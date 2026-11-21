import * as THREE from 'three';

const TAU = Math.PI * 2;
const ink = '#24313a';
const paper = '#fff0ca';
const font = '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif';

export function noise(n) {
  const value = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function canvasOf(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return [canvas, canvas.getContext('2d')];
}

function polygon(ctx, corners) {
  ctx.beginPath();
  corners.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
  ctx.fill();
}

// Original shop stamps. Coordinates are drawn in a square, like a single ink block.
function stamp(ctx, icon, x, y, size, color, ground) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 100, size / 100);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  if (icon === 'ox') {
    ctx.beginPath();
    ctx.moveTo(8, 10);
    ctx.bezierCurveTo(7, 34, 18, 38, 34, 32);
    ctx.quadraticCurveTo(50, 22, 67, 32);
    ctx.quadraticCurveTo(85, 39, 94, 10);
    ctx.bezierCurveTo(100, 43, 88, 54, 74, 53);
    ctx.lineTo(67, 77); ctx.lineTo(56, 87); ctx.lineTo(42, 87);
    ctx.lineTo(32, 77); ctx.lineTo(26, 53);
    ctx.quadraticCurveTo(2, 52, 8, 10);
    ctx.fill();
    ctx.fillStyle = ground;
    polygon(ctx, [[31, 49], [45, 55], [36, 56]]);
    polygon(ctx, [[69, 49], [56, 55], [65, 56]]);
    ctx.fillRect(41, 72, 5, 4); ctx.fillRect(55, 72, 5, 4);
  } else if (icon === 'bowl' || icon === 'steam') {
    ctx.beginPath(); ctx.arc(50, 52, 37, 0, Math.PI); ctx.fill();
    ctx.fillRect(11, 48, 78, 6); ctx.fillRect(36, 87, 28, 5);
    for (const sx of [31, 49, 68]) {
      ctx.beginPath(); ctx.moveTo(sx, 40);
      ctx.bezierCurveTo(sx + 12, 27, sx - 9, 25, sx + 2, 12); ctx.stroke();
    }
  } else if (icon === 'home' || icon === 'tower') {
    polygon(ctx, [[10, 47], [51, 16], [91, 47], [86, 53], [50, 28], [17, 55]]);
    ctx.fillRect(23, 50, 56, 35); ctx.fillStyle = ground;
    ctx.fillRect(46, 64, 12, 22); ctx.fillRect(29, 56, 10, 10);
    ctx.fillRect(64, 56, 9, 10);
  } else if (icon === 'wet') {
    polygon(ctx, [[50, 7], [93, 85], [7, 85]]);
    ctx.fillStyle = ground; ctx.fillRect(46, 34, 8, 27); ctx.fillRect(46, 68, 8, 7);
  } else {
    ctx.fillRect(41, 14, 18, 72); ctx.fillRect(14, 41, 72, 18);
  }
  ctx.restore();
}

function fitText(ctx, text, x, y, width, size, weight = 800) {
  ctx.font = `${weight} ${size}px ${font}`;
  const measured = ctx.measureText(text).width;
  if (measured > width) ctx.font = `${weight} ${size * width / measured}px ${font}`;
  ctx.fillText(text, x, y);
}

function signPainting(text, small, color, icon, badge) {
  const [canvas, ctx] = canvasOf(badge ? 256 : 512, badge ? 256 : 160);
  const w = canvas.width, h = canvas.height;
  ctx.fillStyle = ink; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = color; ctx.fillRect(5, 5, w - 10, h - 10);
  ctx.save(); ctx.beginPath(); ctx.rect(8, 8, w - 16, h - 16); ctx.clip();
  ctx.fillStyle = ink; ctx.globalAlpha = 0.20;
  for (let row = 0; row < 17; row++) {
    for (let col = 0; col < 14; col++) {
      if (col + row > 17) continue;
      ctx.beginPath(); ctx.arc(w - col * 8 - (row % 2) * 4, row * 8, 1.6, 0, TAU); ctx.fill();
    }
  }
  ctx.restore(); ctx.fillStyle = ink;
  if (badge) {
    stamp(ctx, 'ox', 43, 9, 171, ink, color);
    ctx.fillRect(19, 180, 218, 54); ctx.fillStyle = paper;
    ctx.textAlign = 'center'; fitText(ctx, text, 128, 220, 208, 42);
  } else {
    ctx.fillRect(13, 16, 119, 128);
    stamp(ctx, icon, 22, 30, 102, color, ink);
    ctx.fillStyle = ink; fitText(ctx, small, 148, 44, 341, 22, 650);
    ctx.fillRect(149, 54, 320, 2); fitText(ctx, text, 145, 120, 345, 65, 900);
  }
  return canvas;
}

function directionPainting(label, caption, bg, arrow) {
  const [canvas,ctx]=canvasOf(640,164);
  ctx.fillStyle=ink;ctx.fillRect(0,0,640,164);ctx.fillStyle=bg;ctx.fillRect(6,6,628,152);
  ctx.strokeStyle=paper;ctx.lineWidth=3;ctx.strokeRect(13,13,614,138);
  const arrowLeft=arrow==='left', cx=arrowLeft?79:557;
  ctx.save();ctx.translate(cx,81);ctx.rotate(arrowLeft?Math.PI:arrow==='ahead'?-Math.PI/2:0);
  ctx.fillStyle=paper;polygon(ctx,[[-43,-11],[5,-11],[5,-33],[45,0],[5,33],[5,11],[-43,11]]);ctx.restore();
  const tx=arrowLeft?153:34;ctx.fillStyle=paper;fitText(ctx,caption,tx,49,445,24,650);
  fitText(ctx,label,tx-2,121,452,67,900);
  for(const x of [22,618]) for(const y of [22,142]) {ctx.fillStyle=ink;ctx.fillRect(x-2,y-2,4,4);}
  return canvas;
}

// Eight-sided transverse sections give the scooter fairings their folded silhouette.
function shellGeometry(rows) {
  const vertices = [], indices = [];
  for (const [z, bottom, top, half] of rows) {
    const bevel = (top - bottom) * 0.21;
    for (const [x, y] of [[-half * .68, bottom], [half * .68, bottom], [half, bottom + bevel],
      [half, top - bevel], [half * .72, top], [-half * .72, top], [-half, top - bevel], [-half, bottom + bevel]]) {
      vertices.push(x, y, z);
    }
  }
  for (let row = 0; row < rows.length - 1; row++) {
    for (let i = 0; i < 8; i++) {
      const a = row * 8 + i, b = row * 8 + (i + 1) % 8;
      indices.push(a, b, a + 8, b, b + 8, a + 8);
    }
  }
  const last = (rows.length - 1) * 8;
  for (let i = 1; i < 7; i++) indices.push(0, i + 1, i, last, last + i, last + i + 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

export function createArt() {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  const colors = new Map(), signs = new Map();
  const keepGeometry = g => (geometries.add(g), g);
  const keepMaterial = m => (materials.add(m), m);
  const cube = keepGeometry(new THREE.BoxGeometry(1, 1, 1));
  const drum = keepGeometry(new THREE.CylinderGeometry(.5, .5, 1, 12));
  const ball = keepGeometry(new THREE.SphereGeometry(.5, 16, 12));
  const plane = keepGeometry(new THREE.PlaneGeometry(1, 1));
  const yAxis = new THREE.Vector3(0, 1, 0);

  function texture(canvas, repeat = false) {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    textures.add(t);
    return t;
  }
  function material(color, luminous = false) {
    const key = `${luminous}/${color}`;
    if (!colors.has(key)) colors.set(key, keepMaterial(luminous
      ? new THREE.MeshBasicMaterial({ color })
      : new THREE.MeshLambertMaterial({ color })));
    return colors.get(key);
  }
  function mesh(parent, geometry, mat, pos = [0, 0, 0], scale = [1, 1, 1], rot) {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(...pos); mesh.scale.set(...scale);
    if (rot) mesh.rotation.set(...rot);
    parent.add(mesh);
    return mesh;
  }
  function part(parent, geo, color, pos, scale, rot, luminous = false) {
    return mesh(parent, geo, material(color, luminous), pos, scale, rot);
  }
  const box = (p, c, pos, size, rot, glow) => part(p, cube, c, pos, size, rot, glow);
  const cyl = (p, c, pos, size, rot, glow) => part(p, drum, c, pos, size, rot, glow);
  const oval = (p, c, pos, size, rot, glow) => part(p, ball, c, pos, size, rot, glow);
  function link(parent, color, a, b, diameter) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const line = end.sub(start), length = line.length();
    const mid = start.addScaledVector(line, .5);
    const piece = cyl(parent, color, mid.toArray(), [diameter, length, diameter]);
    piece.quaternion.setFromUnitVectors(yAxis, line.normalize());
    return piece;
  }
  function signMaterial(text, small, color, icon, badge = false) {
    const key = [text, small, color, icon, badge].join('|');
    if (!signs.has(key)) signs.set(key, keepMaterial(new THREE.MeshBasicMaterial({
      map: texture(signPainting(text, small, color, icon, badge)), color: '#f6f2e6',
    })));
    return signs.get(key);
  }
  function direction(label,caption,bg,arrow) {
    const key=[label,caption,bg,arrow].join('|');
    if(!signs.has(key)) signs.set(key,keepMaterial(new THREE.MeshBasicMaterial({
      map:texture(directionPainting(label,caption,bg,arrow)),color:'#fbf5e9'})));
    return signs.get(key);
  }
  function panel(parent, mat, pos, w, h, yaw = 0) {
    return mesh(parent, plane, mat, pos, [w, h, 1], [0, yaw, 0]);
  }
  function shell(parent, rows, color) {
    return mesh(parent, keepGeometry(shellGeometry(rows)), material(color));
  }
  // Bake rigid groups once. Their instance colors share one lit and one unlit draw per shape.
  function batch(root, shadows = false) {
    root.updateWorldMatrix(true, true);
    const inv = root.matrixWorld.clone().invert(), buckets = new Map();
    root.traverse(object => {
      if (!object.isMesh || object.isInstancedMesh) return;
      const mat = object.material;
      const batchMat = mat.map ? mat : material('#ffffff', mat.isMeshBasicMaterial === true);
      const key = `${object.geometry.id}/${batchMat.id}`;
      if (!buckets.has(key)) buckets.set(key, { geometry: object.geometry, mat: batchMat, parts: [] });
      buckets.get(key).parts.push(object);
    });
    for (const { geometry, mat, parts } of buckets.values()) {
      const combined = new THREE.InstancedMesh(geometry, mat, parts.length);
      for (let i = 0; i < parts.length; i++) {
        const item = parts[i];
        combined.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(inv, item.matrixWorld));
        if (!mat.map) combined.setColorAt(i, item.material.color);
        item.removeFromParent();
      }
      combined.castShadow = shadows && !mat.isMeshBasicMaterial;
      combined.receiveShadow = !mat.isMeshBasicMaterial;
      combined.computeBoundingSphere(); root.add(combined);
    }
  }
  function dispose() {
    for (const texture of textures) texture.dispose();
    for (const mat of materials) mat.dispose();
    for (const geo of geometries) geo.dispose();
  }
  return { mesh, box, cyl, oval, link, panel, shell, batch, texture, material, signMaterial,
    direction, keepGeometry, keepMaterial, dispose };
}

export function makeBike(art) {
  const { box, cyl, oval, link, mesh, shell, material, keepGeometry } = art;
  const root = new THREE.Group(), grade = new THREE.Group(), bank = new THREE.Group();
  root.add(grade); grade.add(bank);
  const body = new THREE.Group(); bank.add(body);
  const black = '#232b36', rubber = '#20232b', alloy = '#afbec1', red = '#e94939';
  const yellow = '#ffd24e', teal = '#32bdb1', fabric = '#324851';
  const tyre = keepGeometry(new THREE.TorusGeometry(.227, .062, 9, 32));
  const rim = keepGeometry(new THREE.TorusGeometry(.173, .017, 6, 28));
  const wheels = [];
  const stem = new THREE.Group(); stem.position.set(0, .29, .69); bank.add(stem);
  function wheel(parent, z, front) {
    const wheel = new THREE.Group(); parent.add(wheel);
    wheel.position.set(0, front ? 0 : .29, z);
    mesh(wheel, tyre, material(rubber), [0, 0, 0], [1, 1, 1.48], [0, Math.PI / 2, 0]);
    for (const side of [-1, 1]) {
      mesh(wheel, rim, material(teal), [side * .048, 0, 0], [1, 1, 1], [0, Math.PI / 2, 0]);
    }
    cyl(wheel, alloy, [0, 0, 0], [.122, .16, .122], [0, 0, Math.PI / 2]);
    cyl(wheel, '#52616a', [.058, 0, 0], [.238, .012, .238], [0, 0, Math.PI / 2]);
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6;
      link(wheel, alloy, [.002, .05 * Math.cos(a), .05 * Math.sin(a)],
        [.019, .173 * Math.cos(a + .23), .173 * Math.sin(a + .23)], .026);
    }
    art.batch(wheel); wheels.push(wheel);
  }
  wheel(bank, -.69, false); wheel(stem, 0, true);
  shell(body, [[-.94,.48,.57,.105],[-.74,.43,.72,.244],[-.37,.33,.74,.246],[-.13,.28,.53,.202],[.26,.24,.33,.19]], red);
  shell(body, [[-.79,.68,.76,.17],[-.57,.69,.815,.235],[-.24,.67,.765,.208],[.01,.635,.71,.14]], black);
  shell(body, [[-.26,.245,.31,.20],[.19,.225,.29,.24],[.46,.28,.40,.198]], black);
  shell(body, [[.26,.265,.43,.19],[.40,.32,.83,.245],[.60,.47,.91,.265],[.77,.59,.75,.13]], red);
  shell(body, [[.55,.73,.895,.24],[.70,.669,.85,.235],[.81,.66,.76,.105]], black);
  for (const side of [-1, 1]) {
    const s = side;
    link(body, '#374754', [s*.108,.29,-.70], [s*.155,.44,-.17], .073);
    link(body, teal, [s*.15,.33,-.60], [s*.18,.655,-.43], .061);
    link(body, '#ffd579', [s*.233,.56,-.68], [s*.238,.64,-.40], .03);
    link(stem, alloy, [s*.102,0,0], [s*.116,.515,-.108], .042);
    link(stem, teal, [s*.103,.02,-.003], [s*.105,.23,-.048], .059);
    oval(body, '#fff4c9', [s*.142,.768,.741], [.15,.058,.045], [-.14,s*.42,-s*.15], true);
    oval(body, '#ffbc48', [s*.22,.622,-.797], [.055,.054,.085], null, true);
    link(body, alloy, [s*.25,.991,.46], [s*.35,1.237,.51], .019);
    oval(body, black, [s*.36,1.245,.514], [.115,.076,.052], [0,s*.24,0]);
  }
  link(body, '#71838b', [-.22,.31,-.84], [-.24,.32,-.34], .106);
  link(body, black, [-.225,.31,-.844], [-.225,.31,-.80], .084);
  oval(body, red, [0,.565,.70], [.281,.08,.48]);
  link(body, black, [0,.66,.54],[0,.989,.43],.055);
  link(body, black, [-.303,.985,.43],[.303,.985,.43],.048);
  box(body, '#ff483b', [0,.621,-.861], [.29,.075,.076], [-.16,0,0], true);
  box(body, '#e9d9b5', [0,.463,-.852], [.202,.106,.018], [.18,0,0]);
  // Rear rack and insulated bag. The stamp faces the chase camera at local -Z.
  box(body, alloy, [0,.774,-.729], [.52,.045,.48]);
  box(body, black, [0,1.006,-.744], [.658,.45,.538]);
  box(body, yellow, [0,1.015,-.744], [.665,.371,.548]);
  box(body, '#efab32', [0,1.247,-.744], [.688,.078,.57]);
  for (const x of [-.273,.273]) box(body, black, [x,1.024,-.745], [.032,.465,.559]);
  art.panel(body, art.signMaterial('牛逼外卖','',yellow,'ox',true), [0,1.038,-1.025], .35,.35,Math.PI);
  for (const x of [-.284,.284]) box(body, '#fff3ad', [x,.867,-1.023], [.065,.031,.011], null, true);
  // The torso is narrower at the waist. Hands meet the grips and feet rest on the stepboards.
  shell(body, [[-.36,.76,1.13,.12],[-.26,.77,1.31,.196],[-.09,.80,1.34,.207],[.075,.95,1.23,.133]], fabric);
  oval(body, yellow, [0,1.177,-.14], [.437,.346,.311], [-.19,0,0]);
  box(body, '#d9f3ba', [0,1.169,-.317], [.342,.042,.024], [-.14,0,0]);
  cyl(body, '#bc8067',[0,1.32,-.017],[.14,.116,.13]);
  oval(body, black, [0,1.49,-.014], [.334,.342,.355]);
  oval(body, yellow, [0,1.542,-.032], [.344,.292,.361]);
  oval(body, '#314d5c', [0,1.498,.083], [.321,.126,.21], [.13,0,0]);
  box(body, teal, [0,1.566,-.202], [.056,.129,.012], [.22,0,0]);
  box(body, '#fff1b7', [0,1.485,-.192], [.15,.022,.015]);
  for (const s of [-1,1]) {
    link(body, yellow, [s*.173,1.245,-.06],[s*.258,1.065,.13],.126);
    link(body, fabric, [s*.258,1.065,.13],[s*.272,.988,.39],.089);
    oval(body, black, [s*.274,.984,.426],[.090,.079,.114]);
    link(body, black, [s*.132,.773,-.20],[s*.188,.686,.18],.155);
    link(body, fabric, [s*.188,.686,.18],[s*.18,.355,.095],.116);
    oval(body, '#273a41', [s*.19,.333,.142],[.144,.094,.228]);
  }
  art.batch(body);
  return { root, grade, bank, stem, wheels };
}

export function makeStreetEntity(art, type, id) {
  const root = new THREE.Group(), fixed = new THREE.Group(); root.add(fixed);
  const { box, cyl, oval, link } = art;
  const orange = '#ed803e', navy = '#243a47', cream = '#fff1bc';
  let pose = () => {};
  if (type === 'puddle') {
    cyl(fixed, '#305d72', [0,.014,0], [1.93,.018,1.53]);
    cyl(fixed, '#5e96a4', [.065,.024,-.035], [1.57,.01,1.21]);
    for (const [x,z,w] of [[-.19,-.28,.48],[.25,.18,.67],[-.28,.025,.275]]) {
      box(fixed, '#a7ced0', [x,.034,z], [w,.008,.024], [0,-.12,0], true);
    }
    const warning = new THREE.Group(); warning.position.set(-.62,0,.27); fixed.add(warning);
    for (const side of [-1,1]) {
      box(warning, '#ffbd4c', [0,.21,side*.075], [.28,.41,.025], [-side*.34,0,0]);
      box(warning, navy, [0,.25,side*.088], [.035,.103,.027], [-side*.34,0,0]);
    }
  } else if (type === 'gate' || type === 'barrier') {
    const gate = type === 'gate';
    for (const x of [-.83,.83]) {
      box(fixed, navy,[x,.055,0],[.28,.11,.55]);
      box(fixed, gate ? '#d58247' : orange,[x,.50,0],[.13,.88,.15]);
      cyl(fixed, '#ffcb63',[x,.99,0],[.13,.13,.13], null, true);
    }
    if (gate) {
      for (let i=0;i<5;i++) {
        const x = -.81+i*.324;
        link(fixed,'#9eafb0',[x,.20,0],[x+.324,.76,0],.044);
        link(fixed,'#bcc6bc',[x,.76,.035],[x+.324,.20,.035],.044);
      }
    }
    box(fixed,cream,[0,gate?.79:.55,0],[1.93,.24,.13]);
    for (let i=-2;i<=2;i++) {
      for (const side of [-1,1]) box(fixed,gate?'#b1463c':navy,[i*.36,gate?.79:.55,side*.070],
        [.15,.244,.009],[0,0,-.36]);
    }
  } else if (type === 'repair') {
    const bag = new THREE.Group(); root.add(bag);
    cyl(fixed,'#407a78',[0,.025,0],[1.12,.033,1.12]);
    cyl(fixed,'#b7e4c1',[0,.046,0],[.82,.018,.82]);
    box(bag,navy,[0,.48,0],[.79,.49,.39]);
    box(bag,'#71c9b3',[0,.49,0],[.74,.42,.41]);
    link(bag,navy,[-.17,.74,0],[-.14,.86,0],.044);
    link(bag,navy,[.17,.74,0],[.14,.86,0],.044);
    link(bag,navy,[-.14,.86,0],[.14,.86,0],.044);
    for (const side of [-1,1]) {
      box(bag,cream,[0,.51,side*.213],[.29,.075,.012],null,true);
      box(bag,cream,[0,.51,side*.214],[.078,.27,.013],null,true);
    }
    art.batch(bag); pose = (time) => { bag.position.y = .036 * Math.sin(time * 2.3); };
  } else if (type === 'walker') {
    const seed = Array.from(String(id)).reduce((n,c) => n + c.charCodeAt(0), 0);
    const jacket = ['#d89068','#e7ad64','#949ec2','#8cbaa4'][seed % 4];
    oval(fixed,jacket,[0,1.034,0],[.44,.62,.27]);
    cyl(fixed,'#bf917c',[0,1.38,.005],[.14,.15,.135]);
    oval(fixed,'#d5a18a',[0,1.54,.012],[.265,.325,.246]);
    oval(fixed,navy,[0,1.625,-.012],[.276,.19,.251]);
    box(fixed,'#dddcbd',[0,1.10,-.128],[.32,.033,.012]);
    const legs = [], arms = [];
    for (const s of [-1,1]) {
      const leg = new THREE.Group(); leg.position.set(s*.108,.795,0); root.add(leg);
      cyl(leg,'#394954',[0,-.334,0],[.14,.68,.145]);
      oval(leg,navy,[0,-.706,.037],[.156,.105,.242]);
      const arm = new THREE.Group(); arm.position.set(s*.203,1.232,0); root.add(arm);
      link(arm,jacket,[0,0,0],[s*.025,-.316,.008],.108);
      link(arm,'#c9967b',[s*.025,-.316,.008],[s*.027,-.49,.04],.078);
      if (s===1) box(arm,'#d4ba8c',[.025,-.59,.04],[.12,.22,.18]);
      art.batch(leg); art.batch(arm); legs.push(leg); arms.push(arm);
    }
    let gait = seed, stride = 0;
    pose = (_time, travel, dt) => {
      gait += Math.min(travel,.4)*7.4;
      const target = dt > 0 ? Math.min(1,travel/(dt*.85)) : stride;
      stride += (target-stride) * (1-Math.exp(-dt*12));
      const swing = Math.sin(gait) * stride;
      legs[0].rotation.x=swing*.32; legs[1].rotation.x=-swing*.32;
      arms[0].rotation.x=-swing*.23; arms[1].rotation.x=swing*.23;
    };
  }
  art.batch(fixed);
  return { root, pose };
}

const skins = [
  ['#e7c8a8','#866f64','#435866','#efe1bd'],
  ['#b0c8bb','#788b83','#365863','#e6d3a6'],
  ['#cf9c85','#a17769','#414e59','#d7c8af'],
  ['#d4d0bb','#969787','#55676d','#eadbb6'],
  ['#8da8b1','#768f9b','#344f63','#c0cdd0'],
];

function paintFacade(art, index) {
  const [wall, seam, glass, sill] = skins[index];
  const [front, ctx] = canvasOf(512,256), [lights, lit] = canvasOf(512,256);
  ctx.fillStyle=wall; ctx.fillRect(0,0,512,256);
  lit.fillStyle='#000'; lit.fillRect(0,0,512,256);
  for (let floor=0; floor<2; floor++) {
    for (let bay=0; bay<4; bay++) {
      const n = index*23+floor*4+bay, x=bay*128, y=floor*128;
      const w=index===4?102:70+(n%3)*6, left=x+(128-w)/2;
      ctx.fillStyle=seam; ctx.fillRect(x,y+123,128,3);
      ctx.globalAlpha=.28; ctx.fillRect(x+2,y,2,123); ctx.globalAlpha=1;
      ctx.fillStyle=seam; ctx.fillRect(left-4,y+23,w+8,75);
      ctx.fillStyle=glass; ctx.fillRect(left,y+26,w,65);
      ctx.fillStyle=n%3?'#82989a':'#c5a986';
      ctx.fillRect(left+2,y+28,w-4,n%3?9:21);
      ctx.fillStyle='#647c84'; polygon(ctx,[[left+2,y+89],[left+w*.5,y+38],[left+w*.7,y+38],[left+w*.28,y+89]]);
      if (n%3!==1) {
        lit.fillStyle=n%4?'#f6c485':'#b4ced6'; lit.fillRect(left+4,y+36,w/2-6,50);
        lit.fillRect(left+w/2+3,y+36,w/2-7,50);
        lit.fillStyle='#1a2021'; lit.fillRect(left+5,y+63,w-10,3);
      }
      ctx.fillStyle=sill; ctx.fillRect(left+w/2-2,y+24,4,68); ctx.fillRect(left-7,y+92,w+14,5);
      ctx.fillStyle=seam; ctx.fillRect(left-4,y+98,w+8,3);
      if(n%4===2) {
        ctx.fillStyle='#cfcbc0'; ctx.fillRect(x+91,y+94,26,16);
        ctx.strokeStyle=seam; ctx.lineWidth=2; ctx.strokeRect(x+91,y+94,26,16);
        ctx.beginPath(); ctx.arc(x+108,y+102,5,0,TAU); ctx.stroke();
      }
    }
  }
  return art.keepMaterial(new THREE.MeshLambertMaterial({map:art.texture(front,true),
    emissive:'#fff2c9',emissiveMap:art.texture(lights,true),emissiveIntensity:.065}));
}

const stopLooks = {
  square: ['#f6cd5b','ox','城市起点'], shop1: ['#ffb17a','bowl','沿街取餐'],
  home1: ['#a8ddbf','home','住户入口'], shop2: ['#ffcf77','steam','沿街取餐'],
  home2: ['#a5d5e2','tower','客户入口'],
};

function placeLandmark(art, group, key, label) {
  const {box,cyl,oval,link} = art;
  const [accent,icon,small] = stopLooks[key];
  const sign = art.signMaterial(label,small,accent,icon);
  if (key==='square') {
    // A civic clock raised between two cast-bronze horns; the street stays open below it.
    box(group,'#656f70',[0,.13,0],[2.68,.26,1.20]);
    box(group,'#d2b88f',[0,1.24,-.10],[.61,2.18,.65]);
    for(const s of [-1,1]) {
      link(group,'#996444',[s*.18,2.11,0],[s*.94,2.57,0],.29);
      link(group,'#bf8351',[s*.94,2.57,0],[s*1.12,3.22,0],.18);
      link(group,'#f4c276',[s*1.12,3.22,0],[s*1.04,3.51,0],.09);
    }
    cyl(group,ink,[0,2.98,.12],[1.33,.29,1.33],[Math.PI/2,0,0]);
    cyl(group,'#f6e3ac',[0,2.98,.282],[1.10,.04,1.10],[Math.PI/2,0,0],true);
    for(let i=0;i<12;i++) {
      const a=i*TAU/12;
      box(group,ink,[.445*Math.sin(a),2.98+.445*Math.cos(a),.307],[.029,.095,.018],[0,0,-a]);
    }
    link(group,ink,[0,2.98,.324],[-.19,3.15,.324],.041);
    link(group,ink,[0,2.98,.324],[.28,3.10,.324],.031);
    art.panel(group,sign,[0,1.47,.35],2.90,.94);
  } else if(key.startsWith('shop')) {
    const second=key==='shop2', awning=second?'#328e85':'#c15340';
    box(group,'#374850',[0,1.27,-.14],[3.12,2.46,1.10]);
    box(group,'#d4bb95',[0,.57,.43],[2.99,1.10,.11]);
    box(group,'#5c4b43',[0,1.09,.48],[3.22,.11,.46]);
    for (const s of [-1,1]) box(group,ink,[s*1.4,1.48,.43],[.12,.79,.12]);
    for (let i=0;i<7;i++) {
      const c=i%2?'#e9d5a9':awning, x=(i-3)*.45;
      box(group,c,[x,2.01,.64],[.452,.10,.90],[.16,0,0]);
      box(group,c,[x,1.85,1.06],[.452,.18,.065]);
    }
    art.panel(group,sign,[0,2.48,.45],3.16,.94);
    if(second) {
      for(let i=0;i<3;i++) { cyl(group,'#bf8f5a',[-.74,1.23+i*.115,.52],[.68,.11,.64]); }
      oval(group,'#dcc49c',[-.74,1.52,.52],[.61,.12,.58]);
    } else {
      for(const x of [-1.24,1.24]) {
        oval(group,'#ee7549',[x,1.62,.72],[.27,.32,.27]);
        cyl(group,'#d0a259',[x,1.43,.72],[.16,.075,.16]);
      }
      for(const x of [-.52,-.15,.22]) cyl(group,'#e8d7b3',[x,1.23,.52],[.21,.20,.21]);
    }
  } else {
    const high=key==='home2', trim=high?'#446778':'#55867c';
    box(group,trim,[0,1.46,-.18],[2.99,2.87,.60]);
    box(group,'#253f49',[0,1.20,.14],[1.70,2.37,.04]);
    for(const s of [-1,1]) {
      box(group,'#678b8d',[s*.386,1.52,.18],[.69,1.29,.04]);
      box(group,'#e4c997',[s*.078,1.04,.218],[.035,.30,.039]);
    }
    box(group,high?'#738c93':'#d2c4a1',[0,2.37,.39],[3.22,.16,.79]);
    art.panel(group,sign,[0,2.85,.155],3.11,.93);
    if(high) for(let i=0;i<3;i++) box(group,'#acd4da',[-1.28+i*.12,1.26,.145],[.042,2.22,.048]);
    else for(let i=0;i<4;i++) box(group,'#aaa882',[1.13,.81+i*.18,.18],[.40,.128,.10]);
  }
}

function blockFront(road, b) {
  const along=THREE.MathUtils.clamp((b.x-road.start.x)*road.tx+(b.z-road.start.z)*road.tz,0,road.length);
  const dx=road.start.x+road.tx*along-b.x, dz=road.start.z+road.tz*along-b.z;
  const facingX=Math.abs(dx)/b.w>Math.abs(dz)/b.d;
  const nx=facingX?Math.sign(dx):0, nz=facingX?0:Math.sign(dz)||1;
  return {x:b.x+nx*b.w/2,z:b.z+nz*b.d/2,yaw:Math.atan2(nx,nz),span:facingX?b.d:b.w};
}

function streetVignettes(art,root,district,streets,height) {
  const {box,cyl,oval,link,panel} = art;
  const crown=art.keepGeometry(new THREE.IcosahedronGeometry(1,1));
  const sceneAt=(x,z,yaw=0)=>{
    const g=new THREE.Group();g.position.set(x,height(x,z),z);g.rotation.y=yaw;root.add(g);return g;
  };
  function tree(x,z,scale,seed) {
    if(streets.clearance(x,z)<1.65||streets.plotGap(x,z)<2.10)return;
    const g=sceneAt(x,z,noise(seed)*TAU);g.scale.setScalar(scale);
    box(g,'#878e81',[0,.13,0],[2.14,.23,1.79]);box(g,'#717768',[0,.27,0],[1.82,.11,1.49]);
    cyl(g,'#756a55',[0,1.63,0],[.22,3.0,.24]);
    link(g,'#80725c',[0,2.07,0],[-.70,3.20,.05],.13);
    link(g,'#80725c',[0,2.52,0],[.60,3.40,.09],.12);
    const colors=['#557c70','#719181','#819878','#9bab78'];
    for(const [i,p] of [[0,[-.69,3.55,.04]],[1,[.67,3.65,.17]],[2,[.02,4.40,-.31]],[3,[-.25,4.18,.63]]]) {
      art.mesh(g,crown,art.material(colors[(i+seed%2)%4]),p,[1.22,1.02,1.18],[0,seed+i,.13*i]);
    }
  }
  function clothFlag(x,z,yaw,red,word) {
    if(streets.clearance(x,z)<1.65||streets.plotGap(x,z)<1.3)return;
    const g=sceneAt(x,z,yaw);
    cyl(g,'#8d7962',[0,1.74,0],[.08,3.45,.08]);link(g,ink,[0,3.34,0],[1.06,3.34,0],.051);
    box(g,red,[.53,2.38,0],[.89,1.86,.032]);
    const key=art.signMaterial(word,'街市',red,'bowl');
    for(const s of [-1,1])panel(g,key,[.53,2.68,s*.021],.98,.51,s===1?0:Math.PI);
    for(const dx of [.18,.42,.66,.86])box(g,red,[dx,1.43,0],[.18,.22,.031],[0,0,dx*.08]);
  }
  function awning(x,z,width,yaw,seed) {
    if(streets.clearance(x,z)<2.12||streets.plotGap(x,z)<1.5)return;
    const g=sceneAt(x,z,yaw), red=seed%2?'#be493f':'#aa4138';
    for(const s of [-1,1])for(const t of [-1,1]) cyl(g,'#50685f',[s*(width/2-.12),1.16,t*.71],[.065,2.3,.065]);
    const n=Math.max(5,Math.round(width/.59));
    for(let i=0;i<n;i++) {
      const cx=(i+.5)*width/n-width/2,bg=i%4===0?'#e7b991':red;
      box(g,bg,[cx,2.49,0],[width/n+.01,.092,2.12],[.16,0,0]);
      box(g,bg,[cx,2.20,1.03],[width/n+.01,.26,.056]);
    }
    box(g,'#567869',[0,.54,.12],[width-.34,.92,1.06]);
    box(g,'#d5ae7c',[0,1.02,.17],[width-.18,.11,1.18]);
    for(let i=0;i<3;i++) {
      const bx=(i-1)*width*.27;
      box(g,'#8d7152',[bx,1.16,.20],[width*.23,.18,.67]);
      for(let j=0;j<4;j++) oval(g,i===1?'#97a96e':'#d58b52',[bx+(j%2-.5)*.23,1.30,.05+Math.floor(j/2)*.25],[.23,.18,.22]);
    }
  }
  const square=streets.nodes.get(district.stops.square?.node);
  const market=streets.nodes.get('marketW');
  if(square && market) {
    const approach=streets.arms.get(square.id).find(r=>r.a===market.id||r.b===market.id);
    if(approach) {
      const length=Math.hypot(market.x-square.x,market.z-square.z);
      const dx=(market.x-square.x)/length,dz=(market.z-square.z)/length;
      const viewer=Math.atan2(-dx-.28*dz,-dz+.28*dx), side=approach.width/2+3.45;
      const sx=square.x+dx*22+dz*side, sz=square.z+dz*22-dx*side;
      const g=sceneAt(sx,sz,viewer);
      // Broadside to the starting camera. The base, seating and canopy stay outside the lane.
      box(g,'#8b9282',[0,.11,0],[6.10,.22,2.02]);
      for(const x of [-2.15,2.15]) {
        box(g,'#38675e',[x,1.81,0],[.22,3.42,.28]);
        box(g,'#bca773',[x,.32,0],[.38,.55,.42]);
      }
      box(g,'#314e4e',[0,3.52,0],[5.96,1.64,.29]);
      panel(g,art.signMaterial(square.label,'广场街 · 城区导览','#ffd064','ox'),[0,3.54,.157],5.82,1.51);
      panel(g,art.direction(market.label,'广场街','#33776c','ahead'),[.31,2.18,.18],4.78,1.12);
      for(const s of [-1,1]) {
        link(g,'#895740',[s*.13,4.37,0],[s*1.06,4.63,0],.37);
        link(g,'#bf7d49',[s*1.06,4.63,0],[s*1.56,5.10,0],.28);
        link(g,'#e1ab63',[s*1.56,5.10,0],[s*1.61,5.56,0],.15);
      }
      box(g,'#50685f',[0,4.35,0],[1.12,.21,.47]);
      for(const d of [36,63,107,139]) {
        const offset=approach.width/2+3.15;
        tree(square.x+dx*d+dz*offset,square.z+dz*d-dx*offset,.95+(d%3)*.07,d);
      }
      for(const d of [17,47,83,121]) {
        const offset=approach.width/2+2.45;
        tree(square.x+dx*d-dz*offset,square.z+dz*d+dx*offset,.92+(d%3)*.08,d);
      }
      const bench=sceneAt(sx+dz*2.6+dx*4,sz-dx*2.6+dz*4,viewer);
      for(const x of [-.88,.88]) box(bench,'#6c746a',[x,.24,0],[.12,.47,.56]);
      for(const z of [-.17,0,.17]) box(bench,'#aa805c',[0,.49,z],[2.14,.09,.14]);
      for(const d of [19,10]) clothFlag(market.x+dz*(side-.45)-dx*d,market.z-dx*(side-.45)-dz*d,viewer,'#d45b47','开市');
    }
  }
  const shop=streets.nodes.get(district.stops.shop1?.node), shopLot=district.blocks.find(b=>b.label===district.stops.shop1?.label);
  if(shop && shopLot) {
    const road=streets.arms.get(shop.id)[0];
    const s=Math.sign((shopLot.x-shop.x)*road.nx+(shopLot.z-shop.z)*road.nz)||1;
    const side=(road.width/2+3.12)*s, yaw=Math.atan2(-road.nx*s,-road.nz*s);
    for(const [i,along] of [-46,-31,-16,12,25].entries()) {
      const x=shop.x+road.tx*along+road.nx*side,z=shop.z+road.tz*along+road.nz*side;
      awning(x,z,i%2?4.85:5.80,yaw,i);
      if(i%2===0)clothFlag(x-road.tx*3.6,z-road.tz*3.6,yaw+.87,'#e06b4c','烧腊');
    }
  }
  const fork=streets.nodes.get('fork'), noodle=streets.nodes.get(district.stops.shop2?.node);
  if(fork && noodle) {
    const road=streets.arms.get(fork.id).find(r=>r.a===noodle.id||r.b===noodle.id);
    const west=streets.arms.get(fork.id).find(r=>r.kind==='alley');
    const east=streets.arms.get(fork.id).find(r=>r.name==='东堤路');
    if(road && west && east) {
      const g=sceneAt(fork.x+road.width/2+3.18,fork.z+20,-.16);
      for(const x of [-1.83,1.83])cyl(g,'#526b70',[x,1.78,0],[.14,3.52,.14]);
      box(g,ink,[0,3.49,0],[4.78,2.43,.15]);
      panel(g,art.direction(west.name,'窄坡 · 连续弯','#a46640','left'),[0,4.06,.09],4.60,1.14);
      panel(g,art.direction(east.name,'主路 · 宽道','#316a78','right'),[0,2.90,.09],4.60,1.14);
    }
  }
}

function waterTower(art,fixtures,b,height) {
  const {box,cyl,link}=art, g=new THREE.Group();fixtures.add(g);g.position.set(b.x,height(b.x,b.z),b.z);
  const d=Math.min(b.w,b.d),h=b.h;
  box(g,'#a8987c',[0,1.05,0],[b.w,2.10,b.d]);
  for(const x of [-1,1]) for(const z of [-1,1]) {
    link(g,'#8e8b78',[x*d*.37,1,z*d*.37],[x*d*.23,h*.73,z*d*.23],.59);
  }
  for(const s of [-1,1])for(const band of [.23,.46]) {
    link(g,'#9b9580',[-d*.29,h*band,s*d*.29],[d*.29,h*(band+.19),s*d*.29],.25);
    link(g,'#9b9580',[s*d*.29,h*band,-d*.29],[s*d*.29,h*(band+.19),d*.29],.25);
  }
  cyl(g,'#8e7c66',[0,h*.703,0],[d*.73,h*.105,d*.73]);
  cyl(g,'#c57a5b',[0,h*.837,0],[d*.98,h*.234,d*.98]);
  for(const y of [.731,.891,.958])cyl(g,'#e1c49b',[0,h*y,0],[d,h*.024,d]);
  cyl(g,'#72898a',[0,h*.982,0],[d*.86,h*.048,d*.86]);
  const plate=art.signMaterial(b.label,'市政设施','#dbd6aa','wet');
  for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2])art.panel(g,plate,
    [Math.sin(yaw)*d*.488,h*.83,Math.cos(yaw)*d*.488],d*.60,d*.18,yaw);
}

function landmarkSite(key, stop, streets, claimed) {
  const node=streets.nodes.get(stop.node);
  if(!node) return null;
  // Sample corners as well as centre so that the counter, not just its pivot, clears the road.
  let best=null, bestScore=-Infinity;
  const firstRadius=(streets.arms.get(stop.node)?.reduce((w,r)=>Math.max(w,r.width/2),0)??0)+2.0;
  for(let radius=firstRadius;radius<=firstRadius+18;radius+=1.25) {
    for(let i=0;i<32;i++) {
      const angle=i*TAU/32, dx=Math.sin(angle), dz=Math.cos(angle);
      const x=node.x+dx*radius, z=node.z+dz*radius;
      const samples=[[0,0],[-1.68,-.73],[1.68,-.73],[-1.68,1.10],[1.68,1.10]];
      let clearance=Infinity;
      for(const [u,v] of samples) {
        const sx=x-dz*u-dx*v, sz=z+dx*u-dz*v;
        clearance=Math.min(clearance,streets.clearance(sx,sz),streets.plotGap(sx,sz));
      }
      const tooClose=claimed.some(p=>Math.hypot(x-p.x,z-p.z)<3.8);
      const score=Math.min(clearance,.75)*14-radius-(tooClose?80:0);
      if(score>bestScore) {bestScore=score;best={x,z,yaw:Math.atan2(-dx,-dz),key,node};}
    }
    if(best && bestScore>=.65*14-radius) break;
  }
  return best;
}

export function furnishDistrict(art, scene, district, streets, height) {
  const fixtures=new THREE.Group(); scene.add(fixtures);
  const facades=skins.map((_,i)=>paintFacade(art,i));
  const sheets=skins.map(()=>({p:[],uv:[],idx:[]}));
  function wall(sheet,a,b,y0,y1,offset) {
    const i=sheet.p.length/3;
    sheet.p.push(a[0],y0,a[1],b[0],y0,b[1],b[0],y1,b[1],a[0],y1,a[1]);
    const u=Math.max(1,Math.round(Math.hypot(a[0]-b[0],a[1]-b[1])/2.95))/4;
    const v=Math.max(1,Math.round((y1-y0)/3.05))/2;
    sheet.uv.push(offset,0,offset+u,0,offset+u,v,offset,v);sheet.idx.push(i,i+1,i+2,i,i+2,i+3);
  }
  const civic=['街坊修理铺','早班杂货','巷口照相馆','街道邮务','旧物寄卖'];
  const occupied=[];
  const stops=new Map();
  for(const [key,stop] of Object.entries(district.stops)) {
    if(!stopLooks[key]) continue;
    const node=streets.nodes.get(stop.node),building=district.blocks.find(b=>b.label===stop.label);
    let site;
    if(building && node) {
      const nx=node.x-building.x,nz=node.z-building.z;
      const xFront=Math.abs(nx)/building.w>Math.abs(nz)/building.d;
      const dx=xFront?Math.sign(nx):0,dz=xFront?0:Math.sign(nz)||1;
      site={x:building.x+dx*(building.w/2+.68),z:building.z+dz*(building.d/2+.68),yaw:Math.atan2(dx,dz),key,node};
    } else site=landmarkSite(key,stop,streets,occupied);
    if(!site) continue;
    const group=new THREE.Group(); group.position.set(site.x,height(site.x,site.z),site.z);
    group.rotation.y=site.yaw; fixtures.add(group); placeLandmark(art,group,key,stop.label);
    if(building) {
      const [accent,icon,small]=stopLooks[key],blade=art.signMaterial(stop.label,small,accent,icon);
      art.link(group,ink,[1.25,3.64,-.4],[1.25,3.64,2.52],.099);
      art.box(group,ink,[1.25,3.18,1.27],[.11,.91,2.61]);
      for(const s of [-1,1])art.panel(group,blade,[1.25+.062*s,3.18,1.27],2.56,.83,s*Math.PI/2);
    }
    occupied.push(site); stops.set(key,site);
  }
  district.blocks.forEach((b,i)=>{
    if(b.style==='tower') {waterTower(art,fixtures,b,height);return;}
    const style=String(b.style??'');
    const k=/office|glass|写字|科技/i.test(style)?4:/industrial|brick|factory|仓|厂/i.test(style)?2:
      /home|resid|住宅/i.test(style)?[1,3,0,4][i%4]:i%skins.length;
    const halfW=b.w/2,halfD=b.d/2;
    const corners=[[b.x-halfW,b.z+halfD],[b.x+halfW,b.z+halfD],[b.x+halfW,b.z-halfD],[b.x-halfW,b.z-halfD]];
    const base=Math.min(...corners.map(([x,z])=>height(x,z)),height(b.x,b.z))-.14;
    const roof=height(b.x,b.z)+b.h;
    for(let j=0;j<4;j++) wall(sheets[k],corners[j],corners[(j+1)%4],base,roof,(i%4)*.25);
    const {box,cyl,link}=art;
    box(fixtures,'#536569',[b.x,roof+.035,b.z],[b.w+.12,.18,b.d+.12]);
    for(const s of [-1,1]) {
      box(fixtures,skins[k][3],[b.x,roof+.19,b.z+s*(halfD-.06)],[b.w,.28,.15]);
      box(fixtures,skins[k][3],[b.x+s*(halfW-.06),roof+.19,b.z],[.15,.28,b.d]);
    }
    if(b.w>3 && b.d>3) {
      const rx=b.x+halfW*.32,rz=b.z-halfD*.29,w=Math.min(2.7,b.w*.35);
      if(i%3===0) {
        box(fixtures,'#646e70',[rx,roof+.36,rz],[w*.74,.65,w*.74]);
        cyl(fixtures,'#9ba8a6',[rx,roof+1.10,rz],[w,1.45,w]);
        for(const y of [.59,1.57]) cyl(fixtures,'#65797c',[rx,roof+y,rz],[w+.05,.07,w+.05]);
      } else {
        box(fixtures,'#a3a69a',[rx,roof+.54,rz],[w,1.04,w*.70]);
        box(fixtures,'#5f7072',[rx,roof+1.07,rz],[w+.11,.11,w*.70+.1]);
      }
      if(i%4===1) {
        link(fixtures,'#69797a',[rx,roof+1.1,rz],[rx,roof+3.2,rz],.053);
        link(fixtures,'#88908b',[rx-.7,roof+2.75,rz],[rx+.7,roof+2.75,rz],.045);
      }
    }
    const road=streets.nearest(b.x,b.z); if(!road) return;
    const front=blockFront(road,b), face=new THREE.Group(); fixtures.add(face);
    face.position.set(front.x,height(front.x,front.z),front.z); face.rotation.y=front.yaw;
    const span=front.span;
    if(span<2.5) return;
    const width=Math.min(5.2,span*.82), awning=['#b15d49','#527f79','#bb955f'][i%3];
    box(face,'#3e5358',[0,1.07,.057],[width,2.13,.14]);
    for(const s of [-1,1]) {
      box(face,'#789697',[s*width*.285,1.21,.132],[width*.35,1.30,.043]);
      box(face,'#b2aaa0',[s*width*.112,1.13,.165],[.07,2.18,.043]);
    }
    box(face,awning,[0,2.38,.25],[width+.14,.17,.51],[.09,0,0]);
    if((b.label || i%3===0) && !Object.values(district.stops).some(s=>s.label===b.label)) {
      const title=b.label||civic[i%civic.length];
      art.panel(face,art.signMaterial(title,'街坊商号',i%2?'#eacb9d':'#b4cfc0','home'),
        [0,2.77,.09],Math.min(4.9,width),.70);
    }
    if(b.h>7 && span>4 && k!==4) {
      for(let floor=1;floor<=Math.min(3,Math.floor((b.h-1)/3.2));floor++) {
        const y=floor*3.14+.42, x=(floor%2?1:-1)*span*.19;
        box(face,skins[k][3],[x,y,.18],[Math.min(span*.35,3.3),.13,.47]);
        box(face,ink,[x,y+.50,.40],[Math.min(span*.35,3.3),.043,.055]);
        for(const s of [-1,0,1]) box(face,'#62777a',[x+s*Math.min(span*.154,1.47),y+.27,.40],[.037,.44,.04]);
      }
    }
  });
  streetVignettes(art,fixtures,district,streets,height);
  sheets.forEach(({p,uv,idx},i)=>{
    if(!p.length) return;
    const g=art.keepGeometry(new THREE.BufferGeometry());
    g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
    const facade=new THREE.Mesh(g,facades[i]);facade.castShadow=true;facade.receiveShadow=true;scene.add(facade);
  });
  streets.roads.forEach((road,i)=>{
    if(road.kind==='alley') return;
    const skip=road.kind==='ramp'?10:20;
    for(let along=10;along<road.length-6;along+=skip) {
      const side=(Math.round(along/skip)+i)%2?1:-1, offset=side*(road.width/2+.77);
      const x=road.start.x+road.tx*along+road.nx*offset,z=road.start.z+road.tz*along+road.nz*offset;
      if(streets.clearance(x,z)<.36 || streets.plotGap(x,z)<.38 || occupied.some(p=>Math.hypot(x-p.x,z-p.z)<2.0)) continue;
      const y=height(x,z),g=new THREE.Group();g.position.set(x,y,z);fixtures.add(g);
      const nx=-side*road.nx,nz=-side*road.nz;
      if(road.kind==='ramp') {
        art.cyl(g,'#758783',[0,.48,0],[.17,.96,.17]);
        art.box(g,'#f7c86f',[0,.77,0],[.19,.19,.19],null,true);
      } else {
        art.cyl(g,'#51666b',[0,2.3,0],[.096,4.6,.096]);
        art.cyl(g,'#8a9993',[0,.39,0],[.19,.78,.19]);
        art.link(g,'#657b7e',[0,4.50,0],[nx*.83,4.73,nz*.83],.085);
        art.oval(g,'#334e57',[nx*.99,4.70,nz*.99],[.67,.15,.39]);
        art.oval(g,'#ffdb99',[nx*.99,4.63,nz*.99],[.51,.052,.30],null,true);
      }
    }
  });
  // Distant roofs sit beyond the playable bounds and leave the skyline open over streets.
  const {minX,maxX,minZ,maxZ}=district.bounds;
  for(let edge=0;edge<4;edge++) for(let i=0;i<11;i++) {
    const n=edge*11+i, t=(i+.5)/11, setback=22+noise(n)*23;
    const x=edge<2?THREE.MathUtils.lerp(minX,maxX,t):edge===2?minX-setback:maxX+setback;
    const z=edge>=2?THREE.MathUtils.lerp(minZ,maxZ,t):edge===0?minZ-setback:maxZ+setback;
    const h=8+noise(n+92)*26,w=5+noise(n+37)*8,d=6+noise(n+51)*9;
    art.box(fixtures,['#89999b','#a3aca4','#919ba5'][n%3],[x,h/2-1,z],[w,h,d]);
    if(n%2===0) art.box(fixtures,'#869698',[x,h+.18,z],[w*.55,2.36,d*.5]);
  }
  art.batch(fixtures,true);
  return {stops,facades};
}
