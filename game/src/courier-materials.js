import * as THREE from 'three';
import faceURL from './courier-face.webp?inline';
import jacketURL from './courier-jacket.webp?inline';
import detailURL from './courier-details.webp?inline';
import cargoColorURL from './assets/courier-cargo/panels.webp?inline';
import cargoSurfaceURL from './assets/courier-cargo/panel-surface.webp?inline';

// “牛逼外卖” traced from the approved rear panel. These silhouettes also work offline without a CJK font.
const wordmark = 'M286 50 265 50 264 49 264 38 265 37 265 35 263 33 255 34 254 35 254 43 253 44 253 48 251 50 246 50 245 51 243 51 242 50 244 46 243 44 239 42 229 40 227 42 228 46 236 49 233 51 224 51 223 52 223 58 224 59 243 59 244 60 242 63 238 64 236 66 230 67 226 69 223 69 222 71 223 72 224 77 225 78 230 78 245 72 251 68 256 63 256 62 261 58 264 60 263 62 259 65 261 68 267 71 271 75 273 75 274 76 281 76 285 71 284 69 282 69 269 61 271 59 285 59 286 57ZM77 29 77 38 78 39 81 39 83 41 82 63 76 69 77 75 79 77 81 77 87 72 90 72 95 76 97 76 98 77 106 77 107 78 140 78 141 77 142 68 135 68 134 69 105 69 104 68 99 68 98 67 101 65 104 65 105 64 116 64 117 65 119 65 120 64 137 65 140 63 139 61 139 58 140 57 140 38 137 38 136 39 130 39 129 38 121 38 120 39 103 38 102 39 101 38 99 38 98 39 98 45 97 46 97 64 95 65 92 62 92 45 93 44 93 42 92 41 92 36 93 35 93 29 91 28 89 29ZM123 56 125 54 129 54 131 57 129 59 126 59 124 58ZM106 56 108 54 113 54 114 55 114 58 113 59 109 59 107 58ZM123 47 125 44 130 44 132 46 129 49 127 49ZM106 47 108 44 113 44 115 46 113 48 107 48ZM101 19 101 21 100 22 100 33 102 35 137 35 138 34 138 31 139 30 139 27 138 26 139 21 138 19 113 19 112 20 110 19ZM111 28 111 26 112 25 128 25 129 26 127 29 112 29ZM98 9 98 15 99 16 104 16 105 15 112 15 113 16 119 16 120 15 127 15 128 16 141 16 142 15 142 8 121 8 120 9 114 9 113 8 100 8ZM192 7 191 9 192 10 192 14 191 15 191 39 190 40 190 52 189 53 189 78 198 78 199 77 199 73 200 72 200 48 201 47 201 41 202 40 204 42 210 53 212 53 216 49 217 44 213 39 207 28 204 28 203 29 201 27 202 25 202 7ZM172 7 161 7 160 9 160 15 159 16 157 24 150 38 150 41 152 43 152 47 154 47 162 36 166 28 166 26 168 24 174 24 177 26 174 41 172 43 165 38 163 39 162 42 160 44 159 47 160 49 166 54 166 56 157 66 154 68 149 69 150 77 151 78 157 77 162 75 173 65 178 55 180 53 181 48 183 45 183 42 184 41 184 38 186 33 187 15 172 15 171 14ZM79 10 80 14 83 17 83 19 86 23 94 20 94 16 88 7 85 7ZM227 12 227 18 228 19 247 19 248 18 250 20 250 22 249 23 226 23 225 24 225 31 230 31 232 30 233 31 233 34 232 35 232 37 233 38 243 40 244 41 247 41 248 42 250 40 250 37 247 35 240 33 239 32 240 31 273 31 274 32 274 41 280 41 281 42 283 42 284 41 286 23 262 23 261 22 261 20 263 18 270 18 271 19 273 19 274 18 279 18 280 19 282 19 284 17 284 11 263 11 261 6 252 6 249 11 236 10 235 11 228 11ZM15 8 13 10 13 13 10 19 9 25 7 28 5 35 10 36 11 37 15 37 17 35 17 33 20 28 22 27 31 27 33 29 33 42 31 44 5 44 4 45 4 53 5 54 31 54 33 56 33 58 32 59 32 77 33 78 43 78 44 77 44 57 47 54 69 54 70 53 70 46 71 45 70 44 48 44 45 42 45 29 47 27 63 27 65 28 67 26 67 18 47 18 45 14 46 6 34 6 34 16 32 18 24 18 23 17 23 15 24 14 25 9 23 8Z';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function randomSource(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function surfaceTile(fabric) {
  const size = 256, c = canvas(size, size), ctx = c.getContext('2d');
  const r = randomSource(fabric ? 902 : 677), pixels = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = 4 * Math.sin(x * Math.PI / 64 + Math.cos(y * Math.PI / 32))
      + 3 * Math.cos(y * Math.PI / 32 + Math.sin(x * Math.PI / 16));
    const warp = fabric ? ((x + (y >> 1)) % 4 === 0 ? -15 : 1) + ((y % 3) ? 2 : -8) : 0;
    const tone = 240 + n + warp + 16 * (r() - .5), i = (y * size + x) * 4;
    pixels.data.set([tone, tone - 1, tone - 3, 255], i);
  }
  ctx.putImageData(pixels, 0, 0);
  ctx.lineCap = 'round';
  for (let i = 0; i < (fabric ? 75 : 185); i++) {
    const x = r() * size, y = r() * size;
    const wear = y < 26 || y > 219 || x < 16;
    ctx.strokeStyle = fabric ? 'rgba(104,85,63,.12)' : wear ? 'rgba(87,70,56,.51)' : 'rgba(127,113,96,.24)';
    ctx.lineWidth = r() * (wear ? 1.2 : .7) + .4;
    const dx = (wear ? 11 : 4) * r(), dy = (r() - .55) * 4;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx * .55, y + dy + .4);
    ctx.lineTo(x + dx, y + dy); ctx.stroke();
  }
  return c;
}

function treadTile() {
  const c = canvas(1024, 128), ctx = c.getContext('2d'), r = randomSource(81);
  const grad = ctx.createLinearGradient(0, 0, 0, 128);
  for (const [t, gray] of [[0, 130], [.19, 178], [.49, 213], [.75, 191], [1, 133]]) {
    grad.addColorStop(t, 'rgb(' + [gray, gray, gray].join(',') + ')');
  }
  ctx.fillStyle = grad; ctx.fillRect(0, 0, c.width, c.height);
  ctx.lineCap = 'round';
  for (let i = -1; i < 33; i++) for (const k of [-1, 1]) {
    const x = i * 32 + (k === 1 ? 12 : 0), y = 64, outer = y + k * 61;
    for (const [dy, color, weight] of [[1.8, '#c2c0b8', 4], [0, '#525559', 3.6], [0, '#434549', 1.4]]) {
      ctx.strokeStyle = color; ctx.lineWidth = weight;
      ctx.beginPath(); ctx.moveTo(x - 6, outer + dy);
      ctx.bezierCurveTo(x + 6, y + k * 51, x + 5, y + k * 27, x + 19, y + k * 8 + dy); ctx.stroke();
    }
    ctx.strokeStyle = '#818487'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 9, outer); ctx.lineTo(x + 15, y + k * 32); ctx.stroke();
  }
  for (let i = 0; i < 4500; i++) {
    ctx.fillStyle = i % 3 ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.15)';
    ctx.fillRect(r() * 1024, r() * 128, 1 + r(), .8);
  }
  return c;
}

function deliveryInk() {
  const c = canvas(512, 352), ctx = c.getContext('2d');
  // The original asymmetry is visible head-on from the chase camera.
  ctx.save();
  ctx.translate(91, 6); ctx.scale(.93, .93);
  const fill = (path, color) => { ctx.fillStyle = color; ctx.fill(new Path2D(path)); };
  fill('M117 108 Q37 113 55 62 Q62 36 93 8 Q65 78 115 76 L135 80Z', '#bd3028');
  fill('M233 105 Q308 107 287 58 Q279 32 255 12 Q278 74 235 76 L215 83Z', '#f5e6c8');
  fill('M118 70 Q122 64 132 72 Q171 76 207 72 Q221 66 224 73 L230 108 Q252 116 227 123 L216 124 Q209 139 198 151 L192 167 Q190 174 178 174 L158 174 Q151 174 148 167 L143 153 Q128 139 121 125 Q94 122 101 115 L114 109Z', '#252322');
  ctx.globalCompositeOperation = 'destination-out';
  fill('M133 110 Q149 112 153 119 Q151 125 137 117Z M183 120 Q187 111 203 110 Q200 119 187 122Z', '#000');
  ctx.restore();
  ctx.save();
  ctx.translate(24, 194);
  ctx.scale(464 / 289, 124 / 81);
  ctx.fillStyle = '#292521';
  ctx.fill(new Path2D(wordmark), 'evenodd');
  ctx.restore();
  const r = randomSource(32);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = 'rgba(0,0,0,.30)';
  for (let i = 0; i < 620; i++) ctx.fillRect(r() * 512, r() * 352, 1 + r() * 1.5, .8);
  return c;
}

function reflectorTile() {
  const c = canvas(192, 64), ctx = c.getContext('2d');
  ctx.fillStyle = '#d8d8d3'; ctx.fillRect(0, 0, 192, 64);
  for (let j = 0; j < 8; j++) for (let i = -1; i < 28; i++) {
    const x = i * 8 + (j % 2) * 4, y = j * 8;
    ctx.fillStyle = '#fbf8f2'; ctx.beginPath(); ctx.moveTo(x, y);
    ctx.lineTo(x + 4, y + 6); ctx.lineTo(x + 7, y); ctx.fill();
  }
  return c;
}

function brakeOptics() {
  const c=canvas(256,64), ctx=c.getContext('2d'), image=ctx.createImageData(256,64);
  for(let y=0;y<64;y++) for(let x=0;x<256;x++) {
    const dx=((x+.5)%32-16)/15, dy=(y-31.5)/28;
    const d=Math.hypot(dx,dy);
    const shoulder=Math.max(0,1-d);
    const flute=Math.cos(33*d)*Math.exp(-((d-.65)**2)/.16);
    const light=34+104*shoulder+76*Math.exp(-6*d*d)+21*flute+17*Math.max(0,1-Math.abs(dy+.56)*7);
    image.data.set([light+21,light,light*.89,255],4*(y*256+x));
  }
  ctx.putImageData(image,0,0);
  return c;
}

function glassSilver() {
  const c = canvas(128, 80), ctx = c.getContext('2d'), g = ctx.createLinearGradient(35, 0, 78, 80);
  for (const [pos, col] of [[0, '#768890'], [.43, '#b7c6c7'], [.49, '#d9d9c9'],
    [.52, '#abb1a8'], [.56, '#68746f'], [.70, '#9c9c8e'], [1, '#566066']]) g.addColorStop(pos, col);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 80);
  return c;
}

export function courierMaterials(art) {
  function map(c, raw = false, repeat = false) {
    const t = art.texture(c, repeat);
    if (raw) t.colorSpace = THREE.NoColorSpace;
    return t;
  }
  // Decode local, inlined photo-derived UV charts into ordinary tracked CanvasTextures.
  // Supply the garment colour immediately, including on the very first render.
  function chart(url, width, height, base, paint) {
    const c = canvas(width, height), ctx = c.getContext('2d'), img = new Image();
    ctx.fillStyle = base; ctx.fillRect(0, 0, width, height);
    if (paint) paint(ctx,null);
    const t = map(c);
    const release = () => { img.onload = null; t.removeEventListener('dispose', release); };
    img.onload = () => {
      if (paint) paint(ctx,img); else ctx.drawImage(img, 0, 0, width, height);
      t.needsUpdate = true; release();
    };
    t.addEventListener('dispose', release);
    img.src = url;
    return t;
  }
  function material(name, props, physical = false) {
    const Type = physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
    const m = new Type({ vertexColors: true, ...props });
    m.name = name;
    return art.keepMaterial(m);
  }
  const textile = surfaceTile(true), enamel = surfaceTile(false), tyre = treadTile();
  const weave = map(textile, true, true), dye = map(textile, false, true);
  const scuff = map(enamel, true, true), paint = map(enamel, false, true);
  const groove = map(tyre, true);
  const clothProps = { map: dye, roughnessMap: weave, bumpMap: weave, bumpScale: .00032, roughness: .95 };
  const details = chart(detailURL,1024,960,'#a68c60');
  const ink = deliveryInk();
  const cargoColor = chart(cargoColorURL,1024,768,'#d4a048',(ctx,img)=>{
    if (img) ctx.drawImage(img,0,0);
    ctx.drawImage(ink,31,57,450,269);
  });
  // Red carries embossing, green roughness and blue metallic foil. The printed
  // cloth, retroreflective strip and quilt can share one draw per moving part.
  const cargoSurface = chart(cargoSurfaceURL,1024,768,'#83c300');
  cargoSurface.colorSpace = THREE.NoColorSpace;
  const stopOptics=map(brakeOptics());
  return {
    cloth: material('canvas', clothProps),
    jacket: material('jacket', { ...clothProps, map: chart(jacketURL, 648, 352, '#bd842d') }),
    detail: material('sewn-panels', { ...clothProps, map: details }),
    fairing: material('painted-panels', { map: details, roughnessMap: scuff, roughness: .61,
      clearcoat: .29, clearcoatRoughness: .39, metalness: .06 }, true),
    bagRear: material('printed-ox', { map: cargoColor, bumpMap: cargoSurface, bumpScale: .00115,
      roughnessMap: cargoSurface, metalnessMap: cargoSurface, roughness: 1, metalness: 1 }),
    face: material('face', { map: chart(faceURL, 448, 224, '#be896b'), roughness: .84 }),
    skin: material('skin', { roughness: .78 }),
    paint: material('enamel', { map: paint, roughnessMap: scuff, roughness: .58,
      clearcoat: .34, clearcoatRoughness: .36, metalness: .07 }, true),
    metal: material('metal', { metalness: .58, roughness: .41, roughnessMap: scuff }),
    rubber: material('rubber', { map: paint, roughness: .86, bumpMap: scuff, bumpScale: .00028 }),
    tyre: material('tread', { map: map(tyre), bumpMap: groove, bumpScale: .0035, roughness: .94 }),
    glass: material('visor', { color: '#bad5dd', transparent: true, opacity: .19,
      depthWrite: false, roughness: .13, clearcoat: 1, side: THREE.DoubleSide, forceSinglePass: true }, true),
    mirror: material('mirror', { map: map(glassSilver()), metalness: .24, roughness: .18 }),
    rearLight: material('tail-lens', { color: '#b84437', emissive: '#ed2715', emissiveIntensity: .24,
      map: stopOptics, emissiveMap: stopOptics, roughness: .24, clearcoat: .80, clearcoatRoughness: .18 }, true),
    lens: material('headlamp', { map: map(reflectorTile()), emissive: '#d0b88b', emissiveIntensity: .27,
      roughness: .21, clearcoat: .9 }, true),
    tape: material('reflective-tape', { metalness: .24, roughness: .58, roughnessMap: weave }),
  };
}
