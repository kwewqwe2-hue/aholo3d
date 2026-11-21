import * as THREE from 'three';
import { noise } from '../src/world-art.js';

const TAU = Math.PI * 2;
const ink = '#24373c', cream = '#efe4c5', teal = '#377d78', wood = '#aa8058';

function surface(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return [canvas, canvas.getContext('2d')];
}

function groupAt(parent, x, y, z, yaw = 0) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = yaw;
  parent.add(group);
  return group;
}

function line(ctx, points, color, width) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].z);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].z);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function grit(ctx, width, height) {
  const [tile, paint] = surface(128, 128);
  const data = paint.createImageData(128, 128);
  for (let i = 0; i < data.data.length; i += 4) {
    const n = noise(i + 17), tone = n < .50 ? 22 : 239;
    data.data[i] = data.data[i + 1] = data.data[i + 2] = tone;
    data.data[i + 3] = Math.round(5 + 16 * Math.abs(n - .5));
  }
  paint.putImageData(data, 0, 0);
  ctx.save(); ctx.resetTransform();
  ctx.fillStyle = ctx.createPattern(tile, 'repeat'); ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function makeGround(art, scene, course) {
  const { minX, maxX, minZ, maxZ } = course.bounds;
  const w = maxX - minX + 12, d = maxZ - minZ + 12;
  const [sheet, ctx] = surface(1792, Math.round(1792 * d / w));
  ctx.setTransform(sheet.width / w, 0, 0, sheet.height / d,
    -(minX - 6) * sheet.width / w, -(minZ - 6) * sheet.height / d);
  ctx.fillStyle = '#99a690'; ctx.fillRect(minX - 6, minZ - 6, w, d);
  for (let i = 0; i < 830; i++) {
    ctx.fillStyle = i % 2 ? '#aab49c' : '#8d9d86';
    ctx.globalAlpha = .33;
    const x = minX - 6 + noise(i + 100) * w, z = minZ - 6 + noise(i + 2175) * d;
    ctx.fillRect(x, z, .32 + noise(i + 10) * 1.05, .09);
  }
  ctx.globalAlpha = 1;
  for (const b of course.blocks) {
    if (b.style === 'arborFoot' || b.style === 'gateFence') continue;
    const pad = b.style === 'market' ? 2.35 : .77;
    ctx.fillStyle = b.style === 'market' ? '#c1ac92' : '#b8b9a7';
    ctx.fillRect(b.x - b.w / 2 - pad, b.z - b.d / 2 - pad, b.w + 2 * pad, b.d + 2 * pad);
  }
  const nodes = new Map(course.nodes.map(n => [n.id, n]));
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // Painting the entire width pass before the next gives the same *union* of road capsules
  // as the handling code, including open junctions and the middle of the two-way split.
  for (const [extra, color] of [[1.72, '#a5a899'], [.38, '#d2d3bf'], [0, '#5d7278']]) {
    for (const r of course.roads) line(ctx, [nodes.get(r.a), nodes.get(r.b)], color, r.width + extra);
  }
  ctx.lineCap = 'butt';
  ctx.setLineDash([2.1, 4.1]);
  line(ctx, [course.start, { x: course.gate.x + 3.4, z: course.gate.z }], '#c9bb8d', .12);
  ctx.setLineDash([]);
  for (let i = -3; i <= 3; i++) {
    ctx.fillStyle = '#d8d5b9';
    ctx.fillRect(course.gate.x + 3.5, course.gate.z + i * 1.2 - .21, 1.1, .42);
  }
  const { courtEntry, courtExit } = course.landmarks;
  const radius = courtEntry.z - courtExit.z;
  // Two faded sweeps and occasional curb stones read as tyre wear, leaving both lines open.
  for (const offset of [-2.35, 1.95, 2.27]) {
    ctx.beginPath(); ctx.arc(courtEntry.x, courtExit.z, radius + offset, Math.PI / 2, Math.PI);
    ctx.strokeStyle = offset < 0 ? '#586e74' : '#586d73'; ctx.lineWidth = offset < 0 ? .31 : .16; ctx.stroke();
  }
  for (let i = 0; i <= 7; i++) {
    const angle = Math.PI / 2 + i * Math.PI / 14;
    ctx.beginPath(); ctx.arc(courtEntry.x, courtExit.z, radius + 5.48, angle, angle + .043);
    ctx.strokeStyle = i % 2 ? '#b9956f' : '#e4dbc1'; ctx.lineWidth = .29; ctx.stroke();
  }
  // Flush access covers live at the shoulder, away from the broad middle of the curve.
  for (const [x, z] of [[47.2, 7.6], [13.5, 16.45], [-22.6, -22], [-15.9, -87]]) {
    ctx.fillStyle = '#536367'; ctx.fillRect(x - .47, z - .27, .94, .54);
    ctx.fillStyle = '#899591';
    for (let j = 0; j < 6; j++) ctx.fillRect(x - .36 + j * .14, z - .20, .045, .40);
  }
  const f = course.finish;
  ctx.strokeStyle = '#efcf85'; ctx.lineWidth = .19;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(f.x + sx * 1.50, f.z + sz * 2.25);
    ctx.lineTo(f.x + sx * 2.52, f.z + sz * 2.25);
    ctx.lineTo(f.x + sx * 2.52, f.z + sz * 1.16); ctx.stroke();
  }
  grit(ctx, sheet.width, sheet.height);
  const geometry = art.keepGeometry(new THREE.PlaneGeometry(w, d));
  geometry.rotateX(-Math.PI / 2);
  const material = art.keepMaterial(new THREE.MeshLambertMaterial({ map: art.texture(sheet) }));
  const ground = art.mesh(scene, geometry, material, [(minX + maxX) / 2, 0, (minZ + maxZ) / 2]);
  ground.receiveShadow = true;
}

function courtPainting() {
  const [canvas, ctx] = surface(720, 672);
  ctx.scale(48, 48);
  ctx.fillStyle = '#638d89'; ctx.fillRect(0, 0, 15, 14);
  ctx.fillStyle = '#568599'; ctx.fillRect(.48, .48, 14.04, 13.04);
  ctx.fillStyle = '#719d8d';
  ctx.beginPath(); ctx.arc(7.5, 1.65, 6.45, 0, Math.PI); ctx.lineTo(1.05, .49);
  ctx.lineTo(13.95, .49); ctx.fill();
  ctx.fillStyle = '#507e84'; ctx.fillRect(5.12, .50, 4.76, 5.24);
  ctx.lineWidth = .09; ctx.strokeStyle = '#e1dfc4'; ctx.strokeRect(.48, .48, 14.04, 13.04);
  ctx.strokeRect(5.12, .48, 4.76, 5.26);
  ctx.beginPath(); ctx.arc(7.5, 5.74, 1.62, 0, Math.PI); ctx.stroke();
  ctx.setLineDash([.28, .24]); ctx.beginPath(); ctx.arc(7.5, 5.74, 1.62, Math.PI, TAU); ctx.stroke(); ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(1.05, .48); ctx.lineTo(1.05, 1.65);
  ctx.arc(7.5, 1.65, 6.45, Math.PI, 0, true); ctx.lineTo(13.95, .48); ctx.stroke();
  ctx.beginPath(); ctx.arc(7.5, 13.52, 1.62, Math.PI, TAU); ctx.stroke();
  for (let i = 0; i < 1900; i++) {
    const x = noise(i + 6) * 15, z = noise(i + 2200) * 14;
    ctx.fillStyle = i % 4 ? 'rgba(194,195,164,.29)' : 'rgba(48,82,85,.28)';
    ctx.fillRect(x, z, .015 + noise(i + 4850) * .13, .01 + noise(i + 7000) * .043);
  }
  grit(ctx, canvas.width, canvas.height);
  return canvas;
}

function buildCourt(art, root, footprint) {
  // Put the backboard on the west baseline, broadside to traffic entering the bend.
  const b = { ...footprint, w: footprint.d, d: footprint.w };
  const { box, cyl, link } = art, g = groupAt(root, b.x, 0, b.z, Math.PI / 2);
  box(g, '#8faaa0', [0, b.h / 2, 0], [b.w, b.h, b.d]);
  const top = art.keepGeometry(new THREE.PlaneGeometry(b.w - .10, b.d - .10)); top.rotateX(-Math.PI / 2);
  art.mesh(g, top, art.keepMaterial(new THREE.MeshLambertMaterial({ map: art.texture(courtPainting()) })), [0, b.h + .007, 0]);
  const baseline = -b.d / 2;
  // Raised edging and a low spectator rail make the solid half-court legible from road height.
  for (const side of [-1, 1]) {
    box(g, '#c6c6b0', [side * (b.w / 2 - .08), b.h + .04, 0], [.16, .09, b.d]);
    box(g, '#c6c6b0', [0, b.h + .04, side * (b.d / 2 - .08)], [b.w, .09, .16]);
  }
  for (const x of [-5.8, -2.9, 0, 2.9, 5.8]) cyl(g, '#49746e', [x, .78, baseline + .17], [.072, .94, .072]);
  link(g, '#6c8c7f', [-5.85, 1.23, baseline + .17], [5.85, 1.23, baseline + .17], .065);
  box(g, '#47756f', [0, 1.74, baseline + .34], [.21, 2.85, .22]);
  link(g, '#47756f', [0, 2.47, baseline + .34], [0, 3.91, baseline + 1.42], .15);
  box(g, '#687d7a', [0, 3.94, baseline + 1.35], [1.86, 1.12, .095]);
  box(g, '#e8e4ce', [0, 3.94, baseline + 1.411], [1.72, 1.0, .04]);
  for (const x of [-.28, .28]) box(g, '#b65c43', [x, 3.63, baseline + 1.439], [.036, .36, .013]);
  for (const y of [3.45, 3.81]) box(g, '#b65c43', [0, y, baseline + 1.439], [.59, .038, .013]);
  const ringZ = baseline + 1.74, ringY = b.h + 3.05;
  const rim = art.keepGeometry(new THREE.TorusGeometry(.241, .023, 6, 24));
  art.mesh(g, rim, art.material('#d87942'), [0, ringY, ringZ], [1, 1, 1], [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 8; i++) {
    const angle = i * TAU / 8;
    link(g, cream, [.235 * Math.cos(angle), ringY, ringZ + .235 * Math.sin(angle)],
      [.14 * Math.cos(angle + .36), ringY - .37, ringZ + .14 * Math.sin(angle + .36)], .014);
  }
}

function neighborhoodShop(art, root, b) {
  const g = groupAt(root, b.x, 0, b.z), front = b.d / 2;
  const { box, cyl, oval, panel } = art;
  box(g, '#c99371', [0, b.h / 2, 0], [b.w, b.h, b.d]);
  box(g, '#646d67', [0, b.h, 0], [b.w + .18, .17, b.d + .18]);
  const bay = b.w / 3;
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * bay;
    box(g, '#405553', [x, 1.48, front + .028], [bay - .68, 2.84, .08]);
    box(g, '#a9aea1', [x, .61, front + .11], [bay - .72, .99, .14]);
    box(g, '#d6ba91', [x, 1.13, front + .19], [bay - .66, .095, .41]);
    for (const dx of [-1.45, 1.45]) box(g, '#c9c8ae', [x + dx, 1.96, front + .09], [.095, 1.54, .08]);
    const count = 9, width = bay - .18;
    for (let j = 0; j < count; j++) {
      const ax = x + ((j + .5) / count - .5) * width;
      const cloth = j % 4 === 0 ? '#ebc5a4' : i % 2 ? '#bb493e' : '#c95747';
      box(g, cloth, [ax, 2.88, front + .77], [width / count + .012, .09, 1.78], [.14, 0, 0]);
      box(g, cloth, [ax, 2.64, front + 1.64], [width / count + .012, .24, .05]);
    }
    const names = ['红棚取餐', '街坊烧腊', '汤面档'];
    panel(g, art.signMaterial(names[i], '牛角里街市', i === 1 ? '#f1c790' : '#f0ada0', 'bowl'),
      [x, 3.67, front + .08], Math.min(6.4, bay - .85), 1.00);
    for (let j = 0; j < 3; j++) {
      const bx = x + (j - 1) * .78;
      box(g, '#c39866', [bx, 1.38, front + .14], [.43, .42, .31]);
      box(g, '#f0d8a8', [bx, 1.45, front + .30], [.19, .11, .015]);
    }
    for (const side of [-1, 1]) {
      oval(g, '#e68558', [x + side * (bay / 2 - .75), 2.29, front + 1.04], [.35, .46, .35]);
      cyl(g, '#af8b58', [x + side * (bay / 2 - .75), 2.04, front + 1.04], [.15, .076, .15]);
    }
  }
  // A blade is readable looking west from the already-loaded pickup point.
  const blade = art.signMaterial('红棚取餐', '街坊热餐', '#f6ba7e', 'bowl');
  box(g, ink, [-5.1, 3.31, front + 1.46], [.11, .99, 2.97]);
  for (const side of [-1, 1]) panel(g, blade, [-5.1 + side * .065, 3.31, front + 1.46], 2.91, .93, side * Math.PI / 2);
}

function gateDetail(art, root, b) {
  const { box, cyl, link, panel } = art, g = groupAt(root, b.x, 0, b.z);
  if (b.style === 'gatePost') {
    box(g, ink, [0, b.h / 2, 0], [b.w, b.h, b.d]);
    for (let i = 0; i < 4; i++) box(g, '#f3bf4c', [0, .27 + i * .44, 0], [b.w + .019, .235, b.d + .019]);
    box(g, '#f8df91', [0, b.h + .10, 0], [b.w * .80, .17, b.d * .80], null, true);
    return;
  }
  if (b.style === 'gateFence') {
    box(g, '#9a9c8c', [0, .23, 0], [b.w, .46, b.d]);
    const n = Math.ceil(b.d / 2.0);
    for (let i = 0; i <= n; i++) cyl(g, '#53716b', [0, .78, (i / n - .5) * (b.d - .13)], [.070, .78, .070]);
    for (const y of [.76, b.h]) link(g, '#53716b', [0, y, -b.d / 2], [0, y, b.d / 2], .062);
    return;
  }
  box(g, '#d7b888', [0, b.h / 2, 0], [b.w, b.h, b.d]);
  const ex = b.w / 2, ez = b.d / 2;
  for (const side of [-1, 1]) {
    box(g, '#466869', [side * (ex + .016), 1.82, 0], [.045, 1.12, b.d - .27]);
    box(g, '#778e87', [side * (ex + .045), 2.17, -.31], [.016, .31, b.d - 1.01]);
    box(g, '#466869', [0, 1.82, side * (ez + .016)], [b.w - .29, 1.12, .045]);
    box(g, cream, [0, 1.77, side * (ez + .044)], [.084, 1.19, .038]);
  }
  box(g, ink, [0, b.h + .03, 0], [b.w + .56, .24, b.d + .57]);
  box(g, '#e6bd58', [0, b.h + .16, 0], [b.w + .56, .064, b.d + .57]);
  panel(g, art.signMaterial('牛角里', '北门岗', '#ffd273', 'ox'), [ex + .035, 2.63, 0], 3.45, .83, Math.PI / 2);
  // Open boom parked vertically over its hinge, entirely on the booth side.
  box(g, ink, [ex - .36, .57, -ez + .21], [.44, 1.12, .43]);
  box(g, '#f7c04c', [ex - .36, 2.46, -ez + .21], [.14, 3.25, .14]);
  for (let i = 0; i < 6; i++) box(g, ink, [ex - .36, 1.28 + .46 * i, -ez + .21], [.15, .18, .15]);
}

const facadeYaw = { south: 0, east: Math.PI / 2, north: Math.PI, west: -Math.PI / 2 };

function apartment(art, root, b, variant) {
  const { box, panel, oval } = art;
  const yaw = facadeYaw[b.front], sideways = b.front === 'east' || b.front === 'west';
  const w = sideways ? b.d : b.w, d = sideways ? b.w : b.d, f = d / 2;
  const g = groupAt(root, b.x, 0, b.z, yaw), destination = b.style === 'door';
  const walls = ['#d6c8a8', '#c8b49d', '#b6c8b7', '#d1ae94'];
  const plaster = destination ? '#c3c8ab' : walls[variant % walls.length];
  box(g, plaster, [0, b.h / 2, 0], [w, b.h, d]);
  box(g, '#89958a', [0, .36, 0], [w + .042, .72, d + .042]);
  box(g, '#78857d', [0, b.h, 0], [w + .23, .18, d + .24]);
  box(g, '#b4ae95', [0, b.h + .15, 0], [w + .12, .15, d + .12]);
  const floors = Math.max(2, Math.round(b.h / 3)), bays = Math.max(3, Math.floor(w / 3.38));
  for (const side of [-1, 1]) {
    const face = groupAt(g, 0, 0, f * side, side === 1 ? 0 : Math.PI);
    for (let k = 0; k < floors; k++) {
      const floorY = (k + .5) * b.h / floors;
      for (let j = 0; j < bays; j++) {
        const x = ((j + .5) / bays - .5) * w;
        if (destination && side === 1 && k === 0 && Math.abs(x) < 3.4) continue;
        box(face, '#8b9488', [x, floorY, .025], [1.76, 1.46, .074]);
        box(face, (k + j + variant) % 5 ? '#4f6970' : '#bba98a', [x, floorY, .076], [1.57, 1.28, .046]);
        box(face, '#bcc3ab', [x, floorY, .107], [.062, 1.30, .038]);
        box(face, '#ddd7bc', [x, floorY - .73, .11], [1.90, .094, .26]);
        if (k > 0 && (j + k) % 3 === 0) {
          box(face, '#bdc1a9', [x, floorY - .72, .40], [2.22, .105, .63]);
          for (const dx of [-.96, -.33, .33, .96]) box(face, '#71877e', [x + dx, floorY - .39, .67], [.046, .60, .055]);
          box(face, '#71877e', [x, floorY - .086, .67], [2.08, .062, .070]);
          if (j % 2) box(face, variant % 2 ? '#9eabae' : '#bf8775', [x + .40, floorY - .37, .695], [.62, .53, .03]);
        }
      }
    }
  }
  // The end walls also face driving lines while cornering.
  for (const side of [-1, 1]) {
    const end = groupAt(g, side * w / 2, 0, 0, side * Math.PI / 2);
    for (let k = 0; k < floors; k++) {
      const y = (k + .53) * b.h / floors;
      box(end, '#647c7c', [d * .15, y, .038], [1.29, 1.02, .085]);
      box(end, cream, [d * .15, y - .55, .085], [1.45, .085, .19]);
    }
    box(end, '#9d9d84', [-d * .32, b.h * .48, .078], [.09, b.h * .94, .12]);
  }
  if (!destination) return;
  const door = groupAt(g, 0, 0, f);
  box(door, '#526d68', [0, 1.63, .073], [3.18, 3.23, .19]);
  box(door, '#d89450', [0, 1.50, .19], [2.43, 2.88, .067], null, true);
  for (const s of [-1, 1]) {
    box(door, '#ffe7a1', [s * .57, 1.95, .24], [.99, 1.73, .03], null, true);
    box(door, '#d8b482', [s * .14, 1.11, .27], [.061, .37, .034]);
    box(door, '#485d58', [s * 2.06, 2.05, .20], [.38, 1.14, .21]);
    box(door, '#ffdc84', [s * 2.06, 2.05, .34], [.24, .87, .07], null, true);
    oval(door, '#748c6b', [s * 2.68, .62, .14], [.69, .85, .61]);
    box(door, '#af8f70', [s * 2.68, .25, .14], [.59, .49, .51]);
  }
  box(door, '#496e69', [0, 3.00, .48], [5.68, .17, 1.40]);
  box(door, '#f7d184', [0, 2.91, 1.15], [5.54, .055, .045], null, true);
  box(door, '#50655d', [0, 3.70, .62], [4.84, 1.16, .31]);
  panel(door, art.signMaterial(b.label, '牛角里 · 住户入口', '#f0d490', 'home'), [0, 3.70, .785], 4.77, 1.12);
}

function plants(art, root, course) {
  const foliage = art.keepGeometry(new THREE.IcosahedronGeometry(1, 1));
  const flower = art.keepGeometry(new THREE.IcosahedronGeometry(1, 0));
  function leaf(g, c, pos, size, rotation = 0) {
    return art.mesh(g, foliage, art.material(c), pos, size, [0, rotation, .09]);
  }
  course.blocks.filter(b => b.style === 'treeBed').forEach((b, i) => {
    const g = groupAt(root, b.x, 0, b.z);
    art.box(g, '#adb19b', [0, b.h / 2, 0], [b.w, b.h, b.d]);
    art.box(g, '#7a8872', [0, b.h + .014, 0], [b.w - .21, .033, b.d - .21]);
    art.link(g, '#806e56', [0, b.h, 0], [.13, 3.47, .12], .20);
    art.link(g, '#87765d', [.10, 2.15, .07], [-.75, 3.32, -.24], .14);
    for (let k = 0; k < 5; k++) {
      const angle = k * 2.3 + i;
      const c = ['#698f78', '#78987a', '#879e73', '#9aab79', '#74917c'][k];
      leaf(g, c, [Math.cos(angle) * .86, 3.56 + (k % 3) * .46, Math.sin(angle) * .81],
        [1.27, 1.07, 1.26], angle);
    }
  });
  const bed = course.blocks.find(b => b.style === 'garden');
  if (bed) {
    const g = groupAt(root, bed.x, 0, bed.z);
    art.box(g, '#9d9c87', [0, bed.h / 2, 0], [bed.w, bed.h, bed.d]);
    art.box(g, '#687e69', [0, bed.h + .01, 0], [bed.w - .32, .04, bed.d - .32]);
    for (let i = 0; i < 24; i++) {
      const x = (noise(i + 23) - .5) * (bed.w - 2.2), z = (noise(i + 332) - .5) * (bed.d - 1.8);
      leaf(g, i % 3 ? '#819679' : '#718975', [x, .77, z], [.83, .44, .72], i);
      if (i % 3 === 0) art.mesh(g, flower, art.material('#d19c85'), [x + .21, 1.13, z], [.24, .14, .18]);
    }
    const sign = groupAt(g, 1.05, 0, bed.d / 2 - .50, .22);
    for (const x of [-1.28, 1.28]) art.cyl(sign, '#65766b', [x, 1.67, 0], [.12, 2.30, .12]);
    art.box(sign, ink, [0, 2.61, 0], [3.76, 1.64, .12]);
    art.panel(sign, art.direction('外圈', '花圃外侧', '#39766e', 'left'), [0, 3.00, .073], 3.66, .77);
    art.panel(sign, art.direction('花架', '穿廊短路', '#875d6b', 'right'), [0, 2.22, .073], 3.66, .77);
  }
  const arches = course.landmarks.pergola;
  arches.forEach((arch, i) => {
    const g = groupAt(root, arch.x, 0, arch.z, arch.yaw);
    for (const s of [-1, 1]) {
      const x = s * 3.73;
      art.box(g, '#8d795e', [x, 2.325, 0], [.24, 4.65, .24]);
      art.box(g, '#b1a891', [x, .22, 0], [.32, .44, .32]);
      art.link(g, wood, [x, 3.60, 0], [x - s * .78, 4.44, 0], .14);
    }
    art.box(g, '#a88b62', [0, 4.53, 0], [7.94, .23, .24]);
    for (let j = 0; j < 8; j++) {
      const x = (j - 3.5) * .94, z = .18 * Math.sin(i + j * 2);
      leaf(g, j % 2 ? '#758e6b' : '#608470', [x, 4.69, z], [.70, .29, .59], i + j);
      if ((j + i) % 3 === 0) continue;
      const c = j % 2 ? '#cb91ae' : '#d5a6b9';
      art.mesh(g, flower, art.material(c), [x + .12, 4.40, z + .23], [.19, .32, .17]);
      art.mesh(g, flower, art.material(c), [x + .09, 4.14, z + .22], [.12, .20, .11]);
    }
    if (i === 0) {
      art.panel(g, art.signMaterial('花架巷', '步廊', '#d7c5bc', 'home'), [0, 4.28, -.155], 2.43, .64, Math.PI);
    }
    if (i > 0) {
      const prev = arches[i - 1];
      for (const side of [0, 1]) {
        const a = prev.feet[side], b = arch.feet[side];
        art.link(root, '#95805e', [a.x, 4.61, a.z], [b.x, 4.61, b.z], .15);
      }
    }
  });
}

export function buildNeighborhood(art, scene, course) {
  makeGround(art, scene, course);
  const fixtures = new THREE.Group(); scene.add(fixtures);
  course.blocks.forEach((b, i) => {
    if (b.style === 'court') buildCourt(art, fixtures, b);
    if (b.style === 'market') neighborhoodShop(art, fixtures, b);
    if (b.style === 'booth' || b.style === 'gatePost' || b.style === 'gateFence') gateDetail(art, fixtures, b);
    if (b.style === 'flats' || b.style === 'door') apartment(art, fixtures, b, i);
    if (b.style === 'exitSign') {
      const g = groupAt(fixtures, b.x, 0, b.z);
      art.box(g, '#b5ad91', [0, b.h / 2, 0], [b.w, b.h, b.d]);
      const face = groupAt(g, 0, 0, 0, .76);
      for (const x of [-.96, .96]) art.cyl(face, '#65776b', [x, 1.35, 0], [.10, 2.02, .10]);
      art.panel(face, art.direction('球场出口', '牛角里', '#33796e', 'right'), [0, 2.46, .035], 3.06, .86);
    }
  });
  plants(art, fixtures, course);
  art.batch(fixtures, true);
}

export function makePatrolCart(art, campaign = false) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const { box, oval, cyl, link, shell } = art;
  const trim = '#62b3a5', hull = '#346963', dark = '#263c42';
  shell(body, [[-.94,.27,.56,.37],[-.78,.22,.67,.50],[.41,.22,.68,.50],[.76,.29,.65,.46],[.91,.33,.51,.37]], hull);
  box(body, dark, [0, .29, -.06], [.97, .14, 1.78]);
  box(body, '#354f51', [0, .62, -.23], [.76, .14, .62]);
  box(body, dark, [0, .77, -.49], [.75, .31, .14], [-.12, 0, 0]);
  for (const s of [-1, 1]) {
    link(body, dark, [s * .438, .63, -.61], [s * .422, 1.44, -.62], .054);
    link(body, dark, [s * .438, .65, .54], [s * .422, 1.44, .38], .054);
    box(body, trim, [s * .483, .61, -.04], [.033, .084, 1.37]);
    box(body, '#f3d992', [s * .28, .51, .859], [.185, .087, .045], null, true);
    if (campaign) {
      box(body, dark, [s * .344, .49, -.918], [.160, .093, .047]);
      oval(body, '#d74e3c', [s * .344, .50, -.946], [.138, .063, .026], null, true);
      box(body, '#f5d5a3', [s * .344, .466, -.945], [.089, .012, .008]);
      box(body, '#e2dfbc', [s * .357, .674, -.929], [.113, .029, .010]);
      link(body, dark, [s * .428, 1.09, .457], [s * .548, 1.16, .411], .019);
      oval(body, dark, [s * .560, 1.18, .410], [.096, .115, .045], [0,s*.20,0]);
      oval(body, '#adc1bc', [s * .556, 1.18, .389], [.079, .093, .013], [0,s*.20,0]);
    } else box(body, '#e39164', [s * .32, .48, -.916], [.134, .072, .043], null, true);
  }
  box(body, dark, [0, 1.46, -.10], [1.02, .11, 1.43]);
  box(body, '#79b9a6', [0, 1.532, -.10], [.97, .048, 1.34]);
  box(body, trim, [0, .71, -.69], [.89, .23, .39]);
  if (campaign) {
    box(body, hull, [0, .679, -.913], [.87, .214, .021]);
    art.panel(body, art.signMaterial('物业巡逻', '牛角里', '#dbe2c7', 'home'), [0,.680,-.929], .57,.177,Math.PI);
    const curve = new THREE.CatmullRomCurve3([[-.465,.351,-.811],[-.455,.349,-.929],
      [-.369,.345,-.977],[0,.342,-.991],[.369,.345,-.977],[.455,.349,-.929],[.465,.351,-.811]]
      .map(p => new THREE.Vector3(...p)));
    art.mesh(body, art.keepGeometry(new THREE.TubeGeometry(curve,24,.030,8,false)), art.material(dark));
    for (const s of [-1,1]) link(body, dark, [s*.29,.343,-.908], [s*.29,.343,-.973], .035);
    oval(body, dark, [0,1.566,-.29], [.33,.042,.155]);
    oval(body, '#e8aa52', [0,1.596,-.29], [.285,.067,.124], null, true);
    link(body, dark, [-.046,.844,.511], [.115,1.012,.479], .014);
    link(body, '#354345', [-.037,.975,.486], [.273,1.050,.471], .020);
  } else {
    const plate = art.signMaterial('巡逻', '门岗陪练', '#acd1b8', 'home');
    art.panel(body, plate, [0, .65, -.926], .63, .21, Math.PI);
  }
  art.batch(body);
  const driver = new THREE.Group();
  driver.name = 'patrolDriver';
  body.add(driver);
  driver.visible = !campaign;
  // The campaign boards its on-foot guard here. Practice keeps its seated attendant.
  if (!campaign) {
    oval(driver, '#647d74', [0, .89, -.13], [.43, .39, .32]);
    oval(driver, '#c99577', [0, 1.18, -.08], [.25, .285, .24]);
    oval(driver, dark, [0, 1.28, -.08], [.278, .14, .29]);
    box(driver, dark, [0, 1.245, .054], [.235, .042, .13]);
    for (const s of [-1, 1]) link(driver, '#607a72', [s * .17, .99, -.08], [s * .14, .84, .22], .078);
    art.batch(driver);
  }
  if (campaign) {
    const glass = art.keepMaterial(new THREE.MeshPhongMaterial({
      color: '#9fc8c6', transparent: true, opacity: .22, depthWrite: false, side: THREE.DoubleSide,
    }));
    art.mesh(body, art.keepGeometry(new THREE.PlaneGeometry(.811,.585)), glass, [0,1.115,.449], [1,1,1], [-.20,0,0]);
  }
  const wheels = [], steering = [];
  const tread = art.keepGeometry(new THREE.TorusGeometry(.162, .061, 8, 20));
  for (const z of [-.60, .58]) for (const s of [-1, 1]) {
    const hub = groupAt(root, s * .47, .223, z), spin = new THREE.Group(); hub.add(spin);
    if (z > 0) steering.push(hub);
    art.mesh(spin, tread, art.material(dark), [0,0,0], [1,1,1.28], [0, Math.PI / 2, 0]);
    cyl(spin, '#80978f', [0,0,0], [.228, .106, .228], [0,0,Math.PI / 2]);
    for (let j = 0; j < 3; j++) box(spin, '#405b58', [s * .056,0,0], [.015,.038,.183], [j * Math.PI / 3,0,0]);
    art.batch(spin); wheels.push(spin);
  }
  return { root, body, driver, wheels, steering };
}
