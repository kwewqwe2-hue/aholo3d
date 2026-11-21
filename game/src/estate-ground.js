import * as THREE from 'three';
import { plantingPolygons } from './estate-planting.js';
import asphaltColor from './assets/estate/worn_asphalt-color.webp?url&inline';
import asphaltNormal from './assets/estate/worn_asphalt-normal.webp?url&inline';
import asphaltRoughness from './assets/estate/worn_asphalt-roughness.webp?url&inline';
import plasterColor from './assets/estate/plastered_wall-color.webp?url&inline';
import plasterNormal from './assets/estate/plastered_wall-normal.webp?url&inline';
import plasterRoughness from './assets/estate/plastered_wall-roughness.webp?url&inline';
import pavingColor from './assets/estate/rectangular_paving-color.webp?url&inline';
import pavingNormal from './assets/estate/rectangular_paving-normal.webp?url&inline';
import pavingRoughness from './assets/estate/rectangular_paving-roughness.webp?url&inline';

const scansByArt = new WeakMap();

// The Poly Haven swatches cover 2 × 2 metres. The small initial pixels allow
// synchronous scene construction while the browser decodes the local WebPs.
export function loadEstateTexture(art, url, initial, colorSpace, repeat=true) {
  if (typeof initial==='string') {
    const [pixel,ctx]=canvas2d(2);ctx.fillStyle=initial;ctx.fillRect(0,0,2,2);initial=pixel;
  }
  const texture = art.texture(initial, repeat), image = new Image();
  texture.colorSpace = colorSpace;
  let released = false;
  const cancel = () => { released = true; };
  texture.addEventListener('dispose', cancel);
  image.src = url;
  texture.userData.ready = image.decode().then(() => {
    if (released) return;
    // A cold first frame may have allocated immutable 2×2 GL storage.
    // Retire that allocation before installing a differently sized image.
    texture.removeEventListener('dispose',cancel);
    texture.dispose();
    texture.source = new THREE.TextureSource(image);
    texture.needsUpdate = true;
  });
  return texture;
}

export function estateScans(art) {
  if (!scansByArt.has(art)) {
    const set = (color, normal, roughness, swatch) => ({
      map: loadEstateTexture(art, color, swatch, THREE.SRGBColorSpace),
      normalMap: loadEstateTexture(art, normal, '#8080ff', THREE.NoColorSpace),
      roughnessMap: loadEstateTexture(art, roughness, '#b5b5b5', THREE.NoColorSpace),
    });
    const asphalt = set(asphaltColor, asphaltNormal, asphaltRoughness, '#473a31');
    const plaster = set(plasterColor, plasterNormal, plasterRoughness, '#b0a89c');
    const paving = set(pavingColor, pavingNormal, pavingRoughness, '#897d6f');
    const ready = Promise.all([asphalt,plaster,paving].flatMap(set=>Object.values(set).map(map=>map.userData.ready)));
    scansByArt.set(art, {asphalt,plaster,paving,ready});
  }
  return scansByArt.get(art);
}

export function sequence(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function canvas2d(width, height = width) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return [canvas, canvas.getContext('2d')];
}

function streetDecals(art, root, roads, gate) {
  const [atlas, g] = canvas2d(1024), rng = sequence(80143);
  // Two independent networks of sealed fissures, a saw-cut repair and a slot drain.
  for (let tile = 0; tile < 2; tile++) {
    g.save(); g.translate(tile * 512, 0); g.lineCap = g.lineJoin = 'round';
    let x = 43, y = tile ? 155 : 295;
    g.beginPath(); g.moveTo(x, y);
    for (let j = 0; j < 40; j++) {
      x += 8 + rng() * 5; y += (rng() - .5) * 29;
      g.lineTo(x, y);
      if (j % 6 === 3) {
        let bx = x, by = y;
        const side = rng() > .5 ? 1 : -1;
        for (let k = 0; k < 5; k++) { bx += rng()*13; by += side*rng()*14; g.lineTo(bx,by); }
        g.moveTo(x, y);
      }
    }
    g.strokeStyle = 'rgba(112,100,83,.55)'; g.lineWidth = 4.8; g.stroke();
    g.strokeStyle = 'rgba(36,35,34,.87)'; g.lineWidth = 2.7; g.stroke();
    g.restore();
  }
  g.save(); g.translate(0, 512);
  g.beginPath(); g.moveTo(30,78); g.lineTo(467,64); g.lineTo(474,193);
  g.lineTo(466,219); g.lineTo(472,430); g.lineTo(40,446); g.closePath();
  g.fillStyle = 'rgba(41,40,39,.20)'; g.fill();
  g.strokeStyle = 'rgba(48,44,42,.72)'; g.lineWidth = 3.9; g.stroke();
  g.restore();
  g.save(); g.translate(512, 512);
  g.fillStyle = '#514e46'; g.fillRect(30,60,452,392);
  g.fillStyle = '#888479'; g.fillRect(36,65,440,380);
  g.fillStyle = '#676761'; g.fillRect(42,71,428,368);
  for (let j = 0; j < 10; j++) {
    const y = 88 + j*35;
    for (const x of [57, 266]) {
      g.fillStyle = '#9b978a'; g.fillRect(x,y+2,188,17);
      g.fillStyle = '#343837'; g.fillRect(x,y,188,16);
      g.fillStyle = '#252928'; g.fillRect(x,y,188,5);
    }
  }
  g.restore();
  const p = [], uv = [], idx = [];
  const stamp = (x,z,yaw,length,width,tile) => {
    const dx = Math.cos(yaw), dz = Math.sin(yaw), first = p.length/3;
    for (const [a,b] of [[0,0],[1,0],[0,1],[1,1]]) {
      const u = (a-.5)*length, v = (b-.5)*width;
      p.push(x+dx*u-dz*v, .003, z+dz*u+dx*v);
      uv.push((tile%2+.004+a*.992)/2, 1-(Math.floor(tile/2)+.004+b*.992)/2);
    }
    idx.push(first,first+2,first+1,first+1,first+2,first+3);
  };
  for (const {a,b,width} of roads) {
    const dx = b.x-a.x, dz = b.z-a.z, len = Math.hypot(dx,dz);
    if (len < 3) continue;
    const hero = Math.hypot(a.x-gate.x,a.z-gate.z)<32;
    if (rng() > (hero ? .66 : .25)) continue;
    const yaw = Math.atan2(dz,dx), t = .23+.54*rng(), side = rng()>.5?1:-1;
    const tile = Math.floor(rng()*4);
    const offset = (tile===3 ? width/2-.48 : (width-1.6)*rng()*.5)*side;
    stamp(a.x+dx*t-dz/len*offset,a.z+dz*t+dx/len*offset,
      yaw+(tile<2 ? (rng()-.5)*1.8 : 0),tile===3?1.12:1.75+rng()*2.5,
      tile===3?.62:1.12+rng()*1.6,tile);
  }
  const geo = art.keepGeometry(new THREE.BufferGeometry());
  geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geo.setIndex(idx); geo.computeVertexNormals();
  const mat = art.keepMaterial(new THREE.MeshStandardMaterial({
    map:art.texture(atlas), roughness:.82, transparent:true, depthWrite:false,
    polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,
  }));
  const mesh = art.mesh(root,geo,mat);
  mesh.name='道路修补与雨水篦'; mesh.receiveShadow=true;
}

function asphaltSurface(art, root, roads, plan, minX, minZ, width, depth) {
  const p=[], uv=[], idx=[], joints=new Map();
  function vertex(x,z) {
    p.push(x,-.005,z);
    uv.push(x*.5,-z*.5);
    return p.length/3-1;
  }
  for (const {a,b,width:w} of roads) {
    const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz),r=w/2;
    if (!len) continue;
    const nx=-dz*r/len,nz=dx*r/len;
    const first=vertex(a.x+nx,a.z+nz);
    vertex(b.x+nx,b.z+nz);vertex(a.x-nx,a.z-nz);vertex(b.x-nx,b.z-nz);
    idx.push(first,first+1,first+2,first+2,first+1,first+3);
    for(const point of [a,b]) joints.set(point,Math.max(joints.get(point)??0,r));
  }
  for (const [point,r] of joints) {
    const center=vertex(point.x,point.z);
    for(let i=0;i<20;i++) {
      const a=i*Math.PI/10;
      vertex(point.x+r*Math.cos(a),point.z+r*Math.sin(a));
      idx.push(center,center+1+(i+1)%20,center+1+i);
    }
  }
  const geo=art.keepGeometry(new THREE.BufferGeometry());
  geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geo.setIndex(idx);geo.computeVertexNormals();
  const material=art.keepMaterial(new THREE.MeshStandardMaterial({
    ...estateScans(art).asphalt,normalScale:new THREE.Vector2(.48,.48),roughness:1.08,
  }));
  material.onBeforeCompile=shader=>{
    shader.uniforms.estatePlan={value:plan};
    shader.uniforms.planBounds={value:new THREE.Vector4(minX,minZ,1/width,1/depth)};
    shader.vertexShader='uniform vec4 planBounds; varying vec2 estatePlanUv;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',
      '#include <uv_vertex>\n estatePlanUv=(position.xz-planBounds.xy)*planBounds.zw; estatePlanUv.y=1.0-estatePlanUv.y;');
    shader.fragmentShader='uniform sampler2D estatePlan; varying vec2 estatePlanUv;\n'+shader.fragmentShader;
    // Evaluate one continuous UV in the fragment, shared by colour, tangent
    // derivatives and both data maps, even where two road strips overlap.
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
      vec2 estateUv=vMapUv+.18*vec2(sin(vMapUv.y*.55+vMapUv.x*.13),sin(vMapUv.x*.47-vMapUv.y*.09));
      diffuseColor*=texture2D(map,estateUv);
      vec3 wear=texture2D(estatePlan,estatePlanUv).rgb*1.97;
      float aggregate=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
      diffuseColor.rgb=mix(vec3(aggregate),diffuseColor.rgb,.25)*vec3(1.24,1.26,1.31)*wear;
    `).replace('#include <roughnessmap_fragment>',`
      ${THREE.ShaderChunk.roughnessmap_fragment.replaceAll('vRoughnessMapUv','estateUv')}
      roughnessFactor=clamp(roughnessFactor + .09*(wear.g-1.0),.48,1.0);
    `).replace('#include <normal_fragment_begin>',THREE.ShaderChunk.normal_fragment_begin.replaceAll('vNormalMapUv','estateUv'))
       .replace('#include <normal_fragment_maps>',THREE.ShaderChunk.normal_fragment_maps.replaceAll('vNormalMapUv','estateUv'));
  };
  material.customProgramCacheKey=()=>'estate-scanned-asphalt';
  const mesh=art.mesh(root,geo,material);
  mesh.name='两米扫描沥青';mesh.receiveShadow=true;
}

export function buildGround(art, root, course) {
  const b = course.bounds;
  const minX = b.minX - 24, minZ = b.minZ - 24;
  const width = b.maxX - minX + 24, depth = b.maxZ - minZ + 24;
  const px = Math.min(12, 3584 / Math.max(width, depth));
  const [canvas, ctx] = canvas2d(Math.ceil(width * px), Math.ceil(depth * px));
  ctx.setTransform(canvas.width / width, 0, 0, canvas.height / depth,
    -minX * canvas.width / width, -minZ * canvas.height / depth);
  // Neutral areas select scanned flagstones. Warm chroma records soil and
  // painted markings. This macro plan never has to resolve an individual joint.
  ctx.fillStyle = '#bdbdbd'; ctx.fillRect(minX, minZ, width, depth);
  const grass=sequence(641);
  for(const polygon of plantingPolygons(course)){
    ctx.save();ctx.beginPath();
    polygon.forEach(([x,z],i)=>i?ctx.lineTo(x,z):ctx.moveTo(x,z));ctx.closePath();
    ctx.fillStyle='#726d50';ctx.strokeStyle='#8d846b';ctx.lineWidth=.23;ctx.stroke();ctx.fill();ctx.clip();
    const xs=polygon.map(p=>p[0]),zs=polygon.map(p=>p[1]);
    const left=Math.min(...xs),top=Math.min(...zs),w=Math.max(...xs)-left,d=Math.max(...zs)-top;
    for(let i=0;i<w*d*.85;i++){
      const x=left+grass()*w,z=top+grass()*d,r=.24+grass()*.91;
      ctx.fillStyle=i%2?'rgba(92,99,59,.24)':'rgba(100,82,61,.28)';
      ctx.beginPath();ctx.ellipse(x,z,r,r*.64,0,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }
  const nodes = new Map(course.nodes.map(n => [n.id, n]));
  const roads = course.roads.map(r => ({
    a: nodes.get(r.a) ?? r.a, b: nodes.get(r.b) ?? r.b, width: r.width,
  })).filter(r => Number.isFinite(r.a?.x) && Number.isFinite(r.b?.x));
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [extra, surface] of [[1.05, '#77756e'], [.65, '#c0bcb2'], [.16, '#908b83'], [0, '#bdbdbd']]) {
    ctx.strokeStyle = surface;
    for (const road of roads) {
      ctx.lineWidth = road.width + extra;
      ctx.beginPath(); ctx.moveTo(road.a.x, road.a.z); ctx.lineTo(road.b.x, road.b.z); ctx.stroke();
    }
  }
  const rand = sequence(3157);
  for (const road of roads) {
    const dx = road.b.x - road.a.x, dz = road.b.z - road.a.z;
    const length = Math.hypot(dx, dz);
    if (!length) continue;
    ctx.save(); ctx.translate(road.a.x, road.a.z); ctx.rotate(Math.atan2(dz, dx));
    for (const side of [-1,1]) {
      const edge=side*road.width/2;
      const gutter=ctx.createLinearGradient(0,edge,0,edge-side*.93);
      gutter.addColorStop(0,'rgba(96,82,62,.43)');gutter.addColorStop(.34,'rgba(132,115,90,.19)');
      gutter.addColorStop(1,'rgba(148,134,109,0)');
      ctx.fillStyle=gutter;ctx.fillRect(0,Math.min(edge,edge-side*.93),length,.93);
      for (const track of [1.12,2.55]) {
        const v=side*(track+.10*Math.sin(road.a.x*.14));
        const rub=ctx.createLinearGradient(0,v-.27,0,v+.27);
        rub.addColorStop(0,'rgba(71,73,75,0)');rub.addColorStop(.54,'rgba(71,73,75,.082)');
        rub.addColorStop(1,'rgba(71,73,75,0)');
        ctx.fillStyle=rub;ctx.fillRect(0,v-.27,length,.54);
      }
    }
    const mark=ctx.createRadialGradient(length*.55,0,0,length*.55,0,Math.min(length*.5,road.width*.46));
    mark.addColorStop(0,rand()<.52?'rgba(230,219,201,.105)':'rgba(82,87,87,.10)');
    mark.addColorStop(1,'rgba(168,159,144,0)');ctx.fillStyle=mark;
    ctx.fillRect(0,-road.width/2,length,road.width);
    ctx.restore();
  }
  const square = course.square ?? course.landmarks?.square;
  if (square) {
    ctx.save(); ctx.translate(square.x, square.z); ctx.strokeStyle = '#d0c4a6'; ctx.lineWidth = .13;
    for (let i = -1; i < 2; i++) ctx.strokeRect(i * 2.8 - 1.4, -2.1, 2.8, 4.2);
    ctx.restore();
  }
  const groundMap = art.texture(canvas);
  const paving=estateScans(art).paving;
  const material = art.keepMaterial(new THREE.MeshStandardMaterial({map:groundMap,
    normalMap:paving.normalMap,roughnessMap:paving.roughnessMap,normalScale:new THREE.Vector2(.90,.90),roughness:1.02}));
  material.onBeforeCompile=shader=>{
    shader.uniforms.estatePavingStone={value:paving.map};
    shader.fragmentShader='uniform sampler2D estatePavingStone;\n'+shader.fragmentShader;
    shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',
      '#include <uv_vertex>\n vNormalMapUv=mat2(.9799,.1994,-.1994,.9799)*position.xz*vec2(.5,-.5); vRoughnessMapUv=vNormalMapUv;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
      #include <map_fragment>
      float pavingWeight=1.0-smoothstep(.012,.046,diffuseColor.g-diffuseColor.b);
      vec3 stone=texture2D(estatePavingStone,vNormalMapUv).rgb;
      vec3 pavingData=texture2D(roughnessMap,vNormalMapUv).rgb;
      vec3 mineral=mix(vec3(dot(stone,vec3(.2126,.7152,.0722))),stone,.45);
      float jointDirt=clamp((.92-pavingData.r)*.91+.21*(1.0-smoothstep(.53,.578,pavingData.b)),0.0,.48);
      diffuseColor.rgb=mix(diffuseColor.rgb,mineral*(1.0-jointDirt)*vec3(1.39,1.44,1.48),pavingWeight);
    `).replace('#include <normal_fragment_maps>',THREE.ShaderChunk.normal_fragment_maps
      .replace('mapN.xy *= normalScale;', 'mapN.xy *= normalScale*pavingWeight;'))
      .replace('#include <roughnessmap_fragment>','float roughnessFactor=mix(.97,roughness*pavingData.g,pavingWeight);');
  };
  material.customProgramCacheKey=()=>'estate-paving';
  const geometry = art.keepGeometry(new THREE.PlaneGeometry(width, depth));
  geometry.rotateX(-Math.PI / 2);
  const mesh = art.mesh(root, geometry, material, [minX + width / 2, -.025, minZ + depth / 2]);
  mesh.name = '街坊铺地'; mesh.receiveShadow = true;
  asphaltSurface(art,root,roads,groundMap,minX,minZ,width,depth);
  streetDecals(art,root,roads,course.gate);
}

export function curbStones(kit,course) {
  const nodes=new Map(course.nodes.map(n=>[n.id,n]));
  const segments=course.roads.map(r=>{
    const a=nodes.get(r.a), b=nodes.get(r.b), dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
    return {a,b,dx,dz,len,radius:r.width*.5};
  }).filter(s=>s.len>.01);
  const edge=new THREE.Shape();
  edge.moveTo(-.5,-.5);edge.lineTo(.5,-.5);edge.lineTo(.5,.21);edge.lineTo(.37,.5);
  edge.lineTo(-.37,.5);edge.lineTo(-.5,.21);edge.closePath();
  const kerb=kit.art.keepGeometry(new THREE.ExtrudeGeometry(edge,{depth:1,bevelEnabled:false}));
  kerb.translate(0,0,-.5);
  const rand=sequence(783);
  for(const s of segments){
    const count=Math.max(1,Math.round(s.len/1.23)),step=s.len/count, yaw=Math.atan2(s.dx,s.dz);
    for(const side of [-1,1])for(let i=0;i<count;i++){
      const t=(i+.5)/count,offset=side*(s.radius+.29);
      const x=s.a.x+s.dx*t+s.dz/s.len*offset,z=s.a.z+s.dz*t-s.dx/s.len*offset;
      if(segments.some(n=>{
        if(n===s)return false;
        const continuation=(s.a===n.b || s.b===n.a) && s.radius===n.radius &&
          (s.dx*n.dx+s.dz*n.dz)/(s.len*n.len)>.94;
        if(continuation)return false;
        const ax=x-n.a.x,az=z-n.a.z,v=Math.min(1,Math.max(0,(ax*n.dx+az*n.dz)/(n.len*n.len)));
        return Math.hypot(ax-n.dx*v,az-n.dz*v)<n.radius+.17;
      }))continue;
      kit.frame.shape(kerb,'plaster',[x,.047,z],[.265,.120,Math.max(.08,step-.025)],
        ['#aeada1','#bab7aa','#aaaa9e','#bdbbad'][Math.floor(rand()*4)],[0,yaw,0]);
    }
  }
}
