import * as THREE from 'three';
import { canvas2d, estateScans, sequence } from './estate-ground.js';
import { residentialWindows } from './estate-windows.js';

const turn = Math.PI * 2;
const up = new THREE.Vector3(0, 1, 0);
const zero = [0, 0, 0], unit = [1, 1, 1];

function surfaceTile(art, kind) {
  const [canvas, g] = canvas2d(256);
  const rng = sequence({ brick: 97, roof: 335, timber: 231 }[kind]);
  g.fillStyle = '#e0dcd4'; g.fillRect(0, 0, 256, 256);
  if (kind === 'brick') {
    g.fillStyle = '#a49b8e'; g.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 16; row++) for (let col = -1; col < 7; col++) {
      const x = col * 48 + (row % 2) * 24, y = row * 16, d = Math.floor(rng() * 24);
      g.fillStyle = 'rgb(' + [216+d,200+d,178+d].join(',') + ')'; g.fillRect(x+1,y+1,46,14);
    }
  } else if (kind === 'roof') {
    for (let i=0; i<4; i++) {
      g.fillStyle='rgba(84,80,70,.22)'; g.fillRect(0,i*64,256,2);
      g.fillRect(i%2*106+43,i*64,2,64);
    }
  } else if (kind === 'timber') {
    for (let i=0;i<230;i++) {
      g.strokeStyle='rgba(78,59,40,' + (.04+rng()*.12) + ')'; g.lineWidth=.4+rng();
      const y=rng()*256; g.beginPath(); g.moveTo(0,y);
      g.bezierCurveTo(80,y-1-rng()*3,170,y+2,256,y); g.stroke();
    }
  }
  for (let i = 0; i < 125; i++) {
    const x = rng()*256, y = rng()*256, r = 2 + rng()*24;
    const stain = g.createRadialGradient(x,y,0,x,y,r);
    stain.addColorStop(0,'rgba(78,68,48,.088)'); stain.addColorStop(1,'rgba(78,68,48,0)');
    g.fillStyle=stain; g.fillRect(x-r,y-r,r*2,r*2);
  }
  for (let i=0;i<6600;i++) {
    g.fillStyle=i%2?'rgba(69,61,50,.12)':'rgba(255,252,239,.30)';
    const x=rng()*256,y=rng()*256; g.fillRect(x,y,.5+rng()*1.4,.5+rng()*1.6);
  }
  return art.texture(canvas,true);
}

// Instanced boxes have unit UVs. Use actual metres per face so plaster grain and
// mortar keep the same size on both a stairwell and a seventy-metre facade.
function metreUV(material, metres) {
  material.onBeforeCompile = shader => {
    shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>', [
      '#include <uv_vertex>', '#if defined(USE_INSTANCING) && defined(USE_MAP)',
      'vec3 dim = vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));',
      'vec3 n = abs(normal);',
      'vec2 span = n.y > max(n.x,n.z) ? dim.xz : (n.x > n.z ? dim.zy : dim.xy);',
      'vec3 anchor = instanceMatrix[3].xyz;',
      'vec2 origin = n.y > max(n.x,n.z) ? anchor.xz : (n.x > n.z ? anchor.zy : anchor.xy);',
      'vMapUv = ((uv-.5)*span+origin)/'+metres.toFixed(2)+';',
      '#ifdef USE_NORMALMAP','vNormalMapUv=vMapUv;','#endif',
      '#ifdef USE_ROUGHNESSMAP','vRoughnessMapUv=vMapUv;','#endif',
      '#endif',
    ].join('\n'));
  };
  material.customProgramCacheKey=()=> 'estate-metres-'+metres;
  return material;
}

function windowTile(art) {
  const [canvas,g]=canvas2d(128,160);
  const grd=g.createLinearGradient(0,0,80,160);
  grd.addColorStop(0,'#b9cbc9'); grd.addColorStop(.48,'#8c9c95'); grd.addColorStop(.49,'#657873'); grd.addColorStop(1,'#4b5a50');
  g.fillStyle=grd; g.fillRect(0,0,128,160);
  g.fillStyle='rgba(241,224,185,.24)'; g.beginPath(); g.moveTo(0,0); g.lineTo(37,0);
  g.quadraticCurveTo(26,65,14,80); g.lineTo(23,160); g.lineTo(0,160); g.fill();
  g.fillStyle='rgba(255,242,211,.10)'; g.fillRect(88,0,18,160);
  for(let n=0;n<12;n++) { g.fillStyle='rgba(31,45,42,.10)'; g.fillRect(4,n*13+3,123,1); }
  return art.texture(canvas);
}

function hangingCloth(shirt) {
  const p=[], uv=[], idx=[], cols=6, rows=3;
  for(let j=0;j<=rows;j++) for(let i=0;i<=cols;i++) {
    const u=i/cols, v=j/rows;
    const shoulder=shirt ? (v<.22 ? 1 : v<.48 ? 1.25 : .78) : 1;
    p.push((u-.5)*shoulder, .5-v-.075*Math.sin(u*Math.PI)*v, .07*Math.sin(u*15+v*1.7)*(.30+v)+.05*Math.sin(Math.PI*v));
    uv.push(u,1-v);
    if(i<cols && j<rows){const a=j*(cols+1)+i; idx.push(a,a+cols+1,a+1,a+1,a+cols+1,a+cols+2);}
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geo.setIndex(idx); geo.computeVertexNormals(); return geo;
}

class Frame {
  constructor(kit, matrix = new THREE.Matrix4()) { this.kit=kit; this.matrix=matrix; }
  localPoint(point) {
    this.kit.root.updateWorldMatrix(true,false);
    const world=new THREE.Matrix4().multiplyMatrices(this.kit.root.matrixWorld,this.matrix);
    return new THREE.Vector3(point.x,point.y??0,point.z).applyMatrix4(world.invert());
  }
  child(pos,yaw=0) {
    const m=new THREE.Matrix4().makeRotationY(yaw); m.setPosition(...pos);
    return new Frame(this.kit,new THREE.Matrix4().multiplyMatrices(this.matrix,m));
  }
  shape(shape, surface, pos, scale=unit, tint='#ffffff', rotation=zero) {
    const k=this.kit;
    const geometry=typeof shape==='string'?k.geometry[shape]:shape;
    const mat=typeof surface==='string'?k.material[surface]:surface;
    k.object.position.set(...pos); k.object.scale.set(...scale);
    if(rotation.isQuaternion) k.object.quaternion.copy(rotation); else k.object.rotation.set(...rotation);
    k.object.updateMatrix();
    const matrix = new THREE.Matrix4().multiplyMatrices(this.matrix,k.object.matrix);
    let key=geometry.id+'/'+mat.id;
    // Broad foliage batches would submit every leaf on the map, including all leaves behind the rider.
    if(k.spatial && ['canopy','foliage','hedge','leaf'].includes(surface)){
      const cell=surface==='canopy'?34:56;
      key+='/'+Math.floor(matrix.elements[12]/cell)+'/'+Math.floor(matrix.elements[14]/cell);
    }
    let bucket=k.buckets.get(key);
    if(!bucket){bucket={geometry,mat,matrices:[],colors:[]}; k.buckets.set(key,bucket);}
    bucket.matrices.push(matrix); bucket.colors.push(tint);
  }
  box(surface,pos,scale,tint,rot) { this.shape('box',surface,pos,scale,tint,rot); }
  drum(surface,pos,scale,tint,rot) { this.shape('drum',surface,pos,scale,tint,rot); }
  beam(surface,a,b,width,tint,shape='rod') {
    const axis=new THREE.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]), len=axis.length();
    if(len<.0001) return;
    const q=new THREE.Quaternion().setFromUnitVectors(up,axis.multiplyScalar(1/len));
    this.shape(shape,surface,[(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2],[width,len,width],tint,q);
  }
}

export function estateKit(art, root) {
  const geo=g=>art.keepGeometry(g), standard=p=>art.keepMaterial(new THREE.MeshStandardMaterial(p));
  const material={
    paint:standard({roughness:.83}), metal:standard({roughness:.46,metalness:.42}),
    glazing:standard({map:windowTile(art),roughness:.21,metalness:.28}),
    cloth:standard({side:THREE.DoubleSide,roughness:1}),
    glow:art.keepMaterial(new THREE.MeshBasicMaterial({color:0xffffff})),
    leaf:standard({vertexColors:true,side:THREE.DoubleSide,roughness:.93}),
  };
  material.residentialWindow=residentialWindows(art);
  root.userData.assetsReady=Promise.all([root.userData.assetsReady,material.residentialWindow.map.userData.ready]);
  material.plaster=metreUV(standard({...estateScans(art).plaster,
    normalScale:new THREE.Vector2(.78,.78),roughness:1.08}),2);
  // The lot tint supplies its paint colour. Keep the scanned mortar value under light paint.
  material.plaster.color.setRGB(1.34,1.35,1.36);
  for(const [name,size] of [['brick',1.29],['roof',5.2],['timber',2.1]]) {
    material[name]=metreUV(standard({map:surfaceTile(art,name),roughness:.93}),size);
  }
  const geometry={
    box:geo(new THREE.BoxGeometry()), drum:geo(new THREE.CylinderGeometry(.5,.5,1,18)),
    rod:geo(new THREE.CylinderGeometry(.5,.5,1,7)), taper:geo(new THREE.CylinderGeometry(.31,.5,1,9)),
    pot:geo(new THREE.CylinderGeometry(.5,.37,1,10)), dome:geo(new THREE.SphereGeometry(.5,16,9)),
    ring:geo(new THREE.TorusGeometry(.46,.04,4,20)), panel:geo(new THREE.PlaneGeometry()),
    cloth:geo(hangingCloth(false)), shirt:geo(hangingCloth(true)),
  };
  const kit={art,root,material,geometry,object:new THREE.Object3D(),buckets:new Map(),signs:new Map(),spatial:true};
  kit.frame=new Frame(kit);
  kit.sign=(main,small,bg,ink='#f6e7be')=>{
    const id=[main,small,bg,ink].join('/');
    if(kit.signs.has(id)) return kit.signs.get(id);
    const [canvas,g]=canvas2d(768,204);
    g.fillStyle=bg;g.fillRect(0,0,768,204);
    g.strokeStyle=ink;g.globalAlpha=.52;g.lineWidth=2;g.strokeRect(9,9,750,186);g.globalAlpha=1;
    g.textAlign='center';g.fillStyle=ink;g.font='700 '+(small?101:133)+'px "Microsoft YaHei",sans-serif';
    g.fillText(main,384,small?126:151,702);
    if(small){g.font='25px "Microsoft YaHei",sans-serif';g.fillText(small,384,177,694);}
    const m=standard({map:art.texture(canvas),roughness:.69,emissive:'#ebc594',emissiveIntensity:.085});
    kit.signs.set(id,m); return m;
  };
  function flush(batch){
    let count=0;
    const color=new THREE.Color();
    for(const {geometry:g,mat,matrices,colors} of batch.buckets.values()){
      const mesh=new THREE.InstancedMesh(g,mat,matrices.length);
      for(let i=0;i<matrices.length;i++){
        mesh.setMatrixAt(i,matrices[i]); mesh.setColorAt(i,color.set(colors[i]));
      }
      mesh.castShadow=!(mat.isMeshBasicMaterial || mat.userData.noCast);
      mesh.receiveShadow=!mat.isMeshBasicMaterial; mesh.computeBoundingSphere();
      if(mat===kit.material.canopy) {
        const distant=new THREE.InstancedMesh(kit.geometry.distantSpray,kit.material.foliage,mesh.count);
        distant.instanceMatrix=mesh.instanceMatrix;distant.instanceColor=mesh.instanceColor;
        distant.castShadow=distant.receiveShadow=true;distant.computeBoundingSphere();
        const lod=new THREE.LOD();
        lod.name='近远树冠';lod.position.copy(mesh.boundingSphere.center);
        mesh.position.copy(lod.position).negate();distant.position.copy(mesh.position);
        const distance=batch.root.userData.blockId==='forkTree'?84:49;
        lod.addLevel(mesh,0);lod.addLevel(distant,distance,.09);batch.root.add(lod);
      } else batch.root.add(mesh);
      count+=matrices.length;
    }
    batch.root.userData.instances=count;batch.root.userData.batches=batch.buckets.size;
    batch.buckets.clear();
  }
  kit.flush=()=>flush(kit);
  // A streamed replacement can hide the entire shell, including every small fitting.
  kit.shell=(name,block)=>{
    const group=new THREE.Group();
    group.name=name; group.position.set(block.x,0,block.z);
    group.userData.blockId=block.id;
    group.userData.size={width:block.w,depth:block.d,height:block.h};
    root.add(group);
    const batch={...kit,root:group,buckets:new Map(),spatial:false};
    batch.frame=new Frame(batch,new THREE.Matrix4().makeTranslation(-block.x,0,-block.z));
    batch.flush=()=>flush(batch);
    return batch;
  };
  return kit;
}

export function faceYaw(block, target) {
  const named={south:0,east:Math.PI/2,north:Math.PI,west:-Math.PI/2};
  if (block.front in named) return named[block.front];
  const dx=target.x-block.x,dz=target.z-block.z;
  return Math.abs(dx)/block.w>Math.abs(dz)/block.d ? (dx>0?Math.PI/2:-Math.PI/2) : (dz>0?0:Math.PI);
}

export function facadeFrame(kit,block,target) {
  const yaw=faceYaw(block,target), swap=Math.abs(Math.sin(yaw))>.5;
  return {frame:kit.frame.child([block.x,0,block.z],yaw), width:swap?block.d:block.w, depth:swap?block.w:block.d};
}

export function rngFor(block) {
  return sequence((Math.round(block.x*97)+301) * 7381 + Math.round(block.z*113)*193);
}

export const fullTurn=turn;
