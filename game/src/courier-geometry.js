import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const TAU = Math.PI * 2;
export const sides = [-1, 1];
export const sideName = s => s > 0 ? 'left' : 'right';
export const signedPow = (x, p) => Math.sign(x) * Math.pow(Math.abs(x), p);
const origin = [0, 0, 0], unit = [1, 1, 1], up = new THREE.Vector3(0, 1, 0);

export function node(parent, name, at = origin, bone = false) {
  const object = bone ? new THREE.Bone() : new THREE.Group();
  object.name = name;
  object.position.fromArray(at);
  parent?.add(object);
  return object;
}

// Each chart has a real UV seam. Average the duplicated normals on closed charts.
export function grid(cols, rows, point, { flip = false, closed = false, uv } = {}) {
  const positions = [], uvs = [], indices = [];
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const u = i / cols, v = j / rows;
      positions.push(...point(u, v, j, i));
      uvs.push(...(uv ? uv(u, v, j) : [u, v]));
      if (!i || !j) continue;
      const c = j * (cols + 1) + i, d = c - 1, b = c - cols - 1, a = b - 1;
      if (flip) indices.push(a, d, b, b, d, c);
      else indices.push(a, b, d, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  if (closed) {
    const n = geometry.attributes.normal, a = new THREE.Vector3(), b = new THREE.Vector3();
    for (let j = 0; j <= rows; j++) {
      const i = j * (cols + 1);
      a.fromBufferAttribute(n, i).add(b.fromBufferAttribute(n, i + cols)).normalize();
      n.setXYZ(i, a.x, a.y, a.z);
      n.setXYZ(i + cols, a.x, a.y, a.z);
    }
  }
  return geometry;
}

export function sectionAt(rows, axial) {
  if (axial <= rows[0][0]) return rows[0];
  for (let i = 1; i < rows.length; i++) {
    const b = rows[i], a = rows[i - 1];
    if (axial > b[0]) continue;
    const t = (axial - a[0]) / (b[0] - a[0]);
    return b.map((value, k) => THREE.MathUtils.lerp(a[k], value, t));
  }
  return rows.at(-1);
}

// Padded charts share one texture. Slot zero is the top left in canvas coordinates.
export function detailUV(geometry, slot, mirror = false) {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    uv.setXY(i, ((slot % 4) * 256 + 4 + 248 * (mirror ? 1-u : u)) / 1024,
      1 - (Math.floor(slot / 4) * 320 + 4 + 312 * (1-v)) / 960);
  }
  return geometry;
}

// Sections are [height or length, half width, half depth or height, centre, lateral offset].
export function loft(rows, { axis = 'y', power = 1, cols = 24, sculpt } = {}) {
  const start = rows[0][0], span = rows.at(-1)[0] - start;
  const cap = row => [row[0], .0001, .0001, row[3], row[4]];
  const rings = [cap(rows[0]), ...rows, cap(rows.at(-1))];
  return grid(cols, rings.length - 1, (u, v, i) => {
    const [ax, w, d, centre = 0, offset = 0] = rings[i];
    const angle = (u - .5) * TAU;
    const x = offset + w * signedPow(Math.sin(angle), power);
    const depth = centre + d * signedPow(Math.cos(angle), power);
    const p = axis === 'y' ? [x, ax, depth] : [x, depth, ax];
    return sculpt ? sculpt(p, angle, (ax - start) / span) : p;
  }, { closed: true, flip: axis === 'z', uv: (u, v, i) => [u, (rings[i][0] - start) / span] });
}

// A turned cross-section in the wheel's YZ plane. The axle lies on local X.
export function rimProfile(profile, cols = 48) {
  return grid(cols, profile.length - 1, (u, v, j) => {
    const [x, r] = profile[j], a = TAU * u;
    return [x, r * Math.cos(a), r * Math.sin(a)];
  }, { closed: true });
}

export function flank(rows, strip, side, power, gap = .002) {
  // Extra stations at the underlying body creases keep the coloured insert on the moulding.
  const cuts = [...new Set([...strip.map(r => r[0]), ...rows.map(r => r[0])
    .filter(z => z > strip[0][0] && z < strip.at(-1)[0])])].sort((a, b) => a - b);
  return grid(cuts.length - 1, 5, (u, v, j, i) => {
    const z = cuts[i], [, w, h, centre] = sectionAt(rows, z);
    const [, lo, hi] = sectionAt(strip, z), q = THREE.MathUtils.lerp(lo, hi, v);
    const x = w * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(q), 2 / power)), power / 2);
    return [side * (x + gap), centre + h * q, z];
  }, { flip: side > 0 });
}

// Bake surfaces that move together into one indexed mesh per PBR material. Bones,
// steering, wheel axes and replaceable parts stay as separate Object3D parents.
export function solidBuilder(art) {
  const groups = new Map(), primitives = new Map();
  const matrix = new THREE.Matrix4(), normals = new THREE.Matrix3(), q = new THREE.Quaternion();
  const p = new THREE.Vector3(), v = new THREE.Vector3(), n = new THREE.Vector3(), tint = new THREE.Color();
  const euler = new THREE.Euler();
  const cached = (key, make) => {
    if (!primitives.has(key)) primitives.set(key, make());
    return primitives.get(key);
  };
  function put(parent, mat, geo, color = '#ffffff', at = origin, size = unit, rotation) {
    if (!groups.has(parent)) groups.set(parent, new Map());
    const materials = groups.get(parent);
    if (!materials.has(mat)) materials.set(mat, { pos: [], nor: [], uv: [], col: [], idx: [] });
    const out = materials.get(mat), offset = out.pos.length / 3;
    if (rotation?.isQuaternion) q.copy(rotation);
    else if (rotation) q.setFromEuler(euler.set(...rotation));
    else q.identity();
    matrix.compose(p.fromArray(at), q, v.fromArray(size));
    normals.getNormalMatrix(matrix);
    tint.set(color);
    const { position, normal, uv } = geo.attributes;
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i).applyMatrix4(matrix);
      n.fromBufferAttribute(normal, i).applyNormalMatrix(normals);
      out.pos.push(v.x, v.y, v.z);
      out.nor.push(n.x, n.y, n.z);
      out.col.push(tint.r, tint.g, tint.b);
      out.uv.push(uv?.getX(i) || 0, uv?.getY(i) || 0);
    }
    const index = geo.index;
    for (let i = 0, end = index?.count ?? position.count; i < end; i++) {
      out.idx.push(offset + (index ? index.getX(i) : i));
    }
  }
  function egg(parent, mat, color, at, radii, rotation) {
    put(parent, mat, cached('egg', () => new THREE.SphereGeometry(1, 14, 8)), color, at, radii, rotation);
  }
  function box(parent, mat, color, at, size, radius = 0, rotation) {
    if (!radius || Math.min(...size) < .007) {
      put(parent, mat, cached('box', () => new THREE.BoxGeometry()), color, at, size, rotation);
    } else {
      const key = [radius, ...size].join('/');
      put(parent, mat, cached(key, () => new RoundedBoxGeometry(...size, 1, radius)), color, at, unit, rotation);
    }
  }
  function rod(parent, mat, color, a, b, r, rEnd = r, segments = 10) {
    const start = new THREE.Vector3(...a), line = new THREE.Vector3(...b).sub(start);
    const length = line.length(), mid = start.addScaledVector(line, .5);
    const rotation = new THREE.Quaternion().setFromUnitVectors(up, line.normalize());
    const key = 'rod/' + segments + '/' + rEnd / r;
    const geo = cached(key, () => new THREE.CylinderGeometry(rEnd / r, 1, 1, segments));
    put(parent, mat, geo, color, mid.toArray(), [r, length, r], rotation);
  }
  function tube(parent, mat, color, points, radius, steps = points.length * 2, radial = 6, closed = false) {
    const curve = new THREE.CatmullRomCurve3(points.map(x => new THREE.Vector3(...x)), closed);
    put(parent, mat, new THREE.TubeGeometry(curve, steps, radius, radial, closed), color);
  }
  function finish() {
    for (const [parent, materials] of groups) for (const [mat, data] of materials) {
      const g = new THREE.BufferGeometry();
      for (const [name, array, stride] of [
        ['position', data.pos, 3], ['normal', data.nor, 3], ['color', data.col, 3], ['uv', data.uv, 2],
      ]) g.setAttribute(name, new THREE.Float32BufferAttribute(array, stride));
      g.setIndex(data.idx);
      // During a live model edit an older part can request a material from the next palette.
      const surface = mat ?? art.material('#b5a78d');
      const mesh = new THREE.Mesh(art.keepGeometry(g), surface);
      mesh.name = parent.name + '.' + (surface.name || 'base-coat');
      mesh.receiveShadow = true;
      parent.add(mesh);
    }
    groups.clear();
    primitives.clear();
  }
  return { put, egg, box, rod, tube, finish };
}
