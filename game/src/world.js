import * as THREE from 'three';
import { createArt, furnishDistrict, makeBike, makeStreetEntity, noise } from './world-art.js';

const { clamp, lerp } = THREE.MathUtils;
const TAU = Math.PI * 2;
const roadLift = .045;
const color = value => new THREE.Color(value);

function indexStreets(district) {
  const nodes = new Map(district.nodes.map(n => [n.id, n]));
  const arms = new Map(district.nodes.map(n => [n.id, []]));
  const roads = [];
  for (const spec of district.roads) {
    const start = nodes.get(spec.a), end = nodes.get(spec.b);
    if (!start || !end) continue;
    const dx = end.x-start.x, dz = end.z-start.z, length = Math.hypot(dx,dz);
    if (!length) continue;
    const road = {...spec, start, end, length, tx:dx/length, tz:dz/length, nx:dz/length, nz:-dx/length};
    roads.push(road); arms.get(spec.a).push(road); arms.get(spec.b).push(road);
  }
  function distance(road,x,z) {
    const dx=x-road.start.x, dz=z-road.start.z;
    const along=clamp(dx*road.tx+dz*road.tz,0,road.length);
    return Math.hypot(dx-road.tx*along,dz-road.tz*along);
  }
  function nearest(x,z) {
    let best, score=Infinity;
    for(const road of roads) {
      const d=distance(road,x,z);
      if(d<score) { best=road; score=d; }
    }
    return best;
  }
  function clearance(x,z) {
    let gap=Infinity;
    for(const r of roads) gap=Math.min(gap,distance(r,x,z)-r.width/2);
    return gap;
  }
  function plotGap(x,z) {
    let gap=Infinity;
    for(const b of district.blocks) {
      const dx=Math.abs(x-b.x)-b.w/2, dz=Math.abs(z-b.z)-b.d/2;
      gap=Math.min(gap,Math.hypot(Math.max(0,dx),Math.max(0,dz))+Math.min(0,Math.max(dx,dz)));
    }
    return gap;
  }
  return {nodes,arms,roads,nearest,clearance,plotGap};
}

function buildPaving(art,scene,district,streets,height) {
  const makeSheet=()=>({pos:[],rgb:[],idx:[]});
  const terrain=makeSheet(), streetsheet=makeSheet(), trim=makeSheet();
  const tint=new THREE.Color();
  function grid(sheet,columns,rows,point,paint,lift) {
    const first=sheet.pos.length/3;
    tint.set(paint);
    for(let j=0;j<=rows;j++) for(let i=0;i<=columns;i++) {
      const [x,z]=point(i/columns,j/rows);
      sheet.pos.push(x,height(x,z)+lift,z); sheet.rgb.push(tint.r,tint.g,tint.b);
    }
    for(let j=0;j<rows;j++) for(let i=0;i<columns;i++) {
      const a=first+j*(columns+1)+i, c=a+columns+1;
      sheet.idx.push(a,c,a+1,a+1,c,c+1);
    }
  }
  function disc(sheet,x,z,r,paint,lift) {
    const i=sheet.pos.length/3, n=24; tint.set(paint);
    for(let j=-1;j<n;j++) {
      const u=j===-1?x:x+r*Math.cos(j*TAU/n), v=j===-1?z:z+r*Math.sin(j*TAU/n);
      sheet.pos.push(u,height(u,v)+lift,v); sheet.rgb.push(tint.r,tint.g,tint.b);
    }
    for(let j=0;j<n;j++) sheet.idx.push(i,i+1+(j+1)%n,i+1+j);
  }
  function strip(sheet,r,start,end,left,right,paint,lift,step=3) {
    if(end<=start || right<=left) return;
    grid(sheet,Math.max(1,Math.ceil((right-left)/3)),Math.max(1,Math.ceil((end-start)/step)),(u,v)=>{
      const t=lerp(start,end,v), s=lerp(left,right,u);
      return [r.start.x+r.tx*t+r.nx*s,r.start.z+r.tz*t+r.nz*s];
    },paint,lift);
  }
  const {minX,maxX,minZ,maxZ}=district.bounds;
  const margin=55;
  grid(terrain,Math.ceil((maxX-minX+margin*2)/4),Math.ceil((maxZ-minZ+margin*2)/4),
    (u,v)=>[lerp(minX-margin,maxX+margin,u),lerp(minZ-margin,maxZ+margin,v)],'#aaa69a',-.10);
  const radius=id=>Math.max(0,...streets.arms.get(id).map(r=>r.width/2));
  for(const node of district.nodes) if(streets.arms.get(node.id).length) {
    disc(streetsheet,node.x,node.z,radius(node.id),'#ffffff',roadLift);
  }
  for(const r of streets.roads) {
    const half=r.width/2, alley=r.kind==='alley', ramp=r.kind==='ramp';
    strip(streetsheet,r,0,r.length,-half,half,'#ffffff',roadLift,2);
    const start=radius(r.a)+.55, end=r.length-radius(r.b)-.55;
    if(end<=start) continue;
    for (const s of [-1,1]) {
      const edge=s*(half-.32);
      strip(trim,r,start,end,edge-.058,edge+.058,ramp?'#e8b95f':'#e3dbbf',roadLift+.029);
      const outside=s*(half+.46);
      strip(trim,r,start,end,outside-.46,outside+.46,alley?'#a5a297':'#b7b9ab',roadLift+.078);
      const curb=s*(half+.08);
      strip(trim,r,start,end,curb-.08,curb+.08,'#ded6bf',roadLift+.084);
    }
    if(!alley) {
      for(let d=start+1;d<end;d+=7.1) {
        strip(trim,r,d,Math.min(d+3.35,end),-.085,.085,'#e4bd78',roadLift+.031);
      }
    }
    if(r.kind!=='main') continue;
    for(const [node,at] of [[r.a,start],[r.b,end-2.3]]) {
      if(streets.arms.get(node).length<3 || end-start<10) continue;
      for(let x=-half+1;x<half-1;x+=1.16) {
        strip(trim,r,at,at+2.18,x,Math.min(x+.53,half-.6),'#e6dfc8',roadLift+.035);
      }
    }
  }
  function finish(sheet,mat) {
    if(!sheet.idx.length) return;
    const g=art.keepGeometry(new THREE.BufferGeometry());
    g.setAttribute('position',new THREE.Float32BufferAttribute(sheet.pos,3));
    g.setAttribute('color',new THREE.Float32BufferAttribute(sheet.rgb,3));
    g.setIndex(sheet.idx);g.computeVertexNormals();
    const m=new THREE.Mesh(g,mat);m.receiveShadow=true;scene.add(m);
  }
  const matte=art.keepMaterial(new THREE.MeshLambertMaterial({vertexColors:true}));
  const asphalt=art.keepMaterial(new THREE.MeshStandardMaterial({color:'#65676b',roughness:.95,metalness:.02,vertexColors:true}));
  finish(terrain,matte);finish(streetsheet,asphalt);finish(trim,matte);
  return asphalt;
}

function makeSky(art, scene) {
  const mat=art.keepMaterial(new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,depthTest:false,
    uniforms:{wetness:{value:0}},
    vertexShader:`varying vec3 direction;
      void main(){ direction=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader:`varying vec3 direction; uniform float wetness;
      void main(){
        vec3 d=normalize(direction); float y=smoothstep(-.04,.75,d.y);
        vec3 sky=mix(mix(vec3(.92,.67,.43),vec3(.36,.58,.72),y),
                     mix(vec3(.115,.218,.302),vec3(.028,.066,.125),y),wetness);
        float sun=max(dot(d,normalize(vec3(-.62,.26,.69))),0.);
        sky+=vec3(.44,.26,.09)*(pow(sun,27.)+.9*smoothstep(.9987,.9993,sun))*(1.-wetness);
        gl_FragColor=vec4(sky,1.);
        #include <colorspace_fragment>
      }` }));
  const sky=new THREE.Mesh(art.keepGeometry(new THREE.SphereGeometry(350,36,20)),mat);
  sky.renderOrder=-100;sky.frustumCulled=false;scene.add(sky);
  return sky;
}

function makeRain(art,scene) {
  const count=116, positions=new Float32Array(count*6), seeds=[];
  for(let i=0;i<count;i++) seeds.push([noise(i*3)*36,noise(i*3+1)*14,noise(i*3+2)*36]);
  const g=art.keepGeometry(new THREE.BufferGeometry());
  const attr=new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage);g.setAttribute('position',attr);
  const m=art.keepMaterial(new THREE.LineBasicMaterial({color:'#b1d3df',transparent:true,opacity:.25,depthWrite:false}));
  const lines=new THREE.LineSegments(g,m);lines.frustumCulled=false;scene.add(lines);
  const wrap=(n,repeat)=>n-Math.floor(n/repeat)*repeat;
  return (bike,y,time,wet)=>{
    lines.visible=wet>.008; if(!lines.visible) return;
    m.opacity=.26*wet;
    for(let i=0;i<count;i++) {
      const [sx,sy,sz]=seeds[i],j=i*6;
      const x=bike.x+wrap(sx-time*1.6-bike.x,36)-18;
      const z=bike.z+wrap(sz-time*.45-bike.z,36)-18;
      const bottom=y-.55+wrap(sy-time*(9+i%3),14);
      positions[j]=x;positions[j+1]=bottom;positions[j+2]=z;
      positions[j+3]=x+.062;positions[j+4]=bottom+.37+(i%4)*.055;positions[j+5]=z+.021;
    }
    attr.needsUpdate=true;
  };
}

function makeGuidance(art,scene) {
  const lead=new THREE.Group(), goal=new THREE.Group();scene.add(lead,goal);
  const shape=new THREE.Shape();
  shape.moveTo(-.98,.62);shape.lineTo(0,-.26);shape.lineTo(.98,.62);shape.lineTo(.98,.12);
  shape.lineTo(0,-.79);shape.lineTo(-.98,.12);shape.closePath();
  const arrow=art.keepGeometry(new THREE.ShapeGeometry(shape));arrow.rotateX(-Math.PI/2);
  for(const z of [-.79,.79]) {
    // A shallow pitch presents a readable face 21 m ahead. Both trailing corners clear the grade.
    const chevron=new THREE.Group();chevron.position.set(0,.59,z);chevron.rotation.x=-.54;lead.add(chevron);
    art.mesh(chevron,arrow,art.material('#215559',true),[0,0,0],[1.32,1,1.16]);
    art.mesh(chevron,arrow,art.material('#aff5cf',true),[0,.018,0],[1.11,1,.91]);
  }
  const arc=art.keepGeometry(new THREE.RingGeometry(2.32,2.55,22,1,0,TAU/4-.18));arc.rotateX(-Math.PI/2);
  for(let i=0;i<4;i++) art.mesh(goal,arc,art.material('#ffe087',true),[0,0,0],[1,1,1],[0,i*TAU/4,0]);
  const pin=new THREE.Group();scene.add(pin);
  art.box(pin,'#314953',[0,0,0],[.65,.65,.13],[0,0,Math.PI/4]);
  art.box(pin,'#ffd675',[0,0,.081],[.48,.48,.055],[0,0,Math.PI/4],true);
  art.box(pin,'#38484c',[0,.025,.116],[.095,.24,.015],null,true);
  art.box(pin,'#38484c',[0,-.146,.117],[.095,.06,.015],null,true);
  return {lead,goal,pin};
}

function contactShade(art,scene) {
  const c=document.createElement('canvas');c.width=c.height=64;
  const ctx=c.getContext('2d'), gradient=ctx.createRadialGradient(32,32,3,32,32,31);
  gradient.addColorStop(0,'rgba(14,23,28,.63)');gradient.addColorStop(.53,'rgba(19,28,34,.37)');
  gradient.addColorStop(1,'rgba(19,28,34,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
  const m=art.keepMaterial(new THREE.MeshBasicMaterial({map:art.texture(c),transparent:true,depthWrite:false}));
  const g=art.keepGeometry(new THREE.PlaneGeometry(1.32,2.38));g.rotateX(-Math.PI/2);
  const shade=new THREE.Mesh(g,m);scene.add(shade);return shade;
}

// Local +Z is the nose. A positive heading turns the vehicle toward world -X.
export function createWorld(canvas,district,elevationAt) {
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(56,1,.12,440);
  const art=createArt(), streets=indexStreets(district), height=elevationAt;
  const asphalt=buildPaving(art,scene,district,streets,height);
  const city=furnishDistrict(art,scene,district,streets,height);
  const bikeArt=makeBike(art);scene.add(bikeArt.root);
  const shadow=contactShade(art,scene), guide=makeGuidance(art,scene);
  const sky=makeSky(art,scene), rain=makeRain(art,scene);
  const hemi=new THREE.HemisphereLight('#fff1d6','#b3a69a',1.48);
  const sun=new THREE.DirectionalLight('#ffd298',2.18);
  scene.add(hemi,sun,sun.target);
  const box=district.bounds, midX=(box.minX+box.maxX)/2,midZ=(box.minZ+box.maxZ)/2;
  sun.target.position.set(midX,0,midZ);sun.position.set(midX-160,225,midZ+125);
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
  sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
  const extent=Math.hypot(box.maxX-box.minX,box.maxZ-box.minZ)*.51;
  Object.assign(sun.shadow.camera,{left:-extent,right:extent,top:extent,bottom:-extent,near:.5,far:Math.max(750,extent*2)});
  sun.shadow.camera.updateProjectionMatrix();sun.shadow.normalBias=.22;sun.shadow.bias=-.00014;
  const dry={sky:color('#ffe0b5'),hemi:color('#fff3df'),floor:color('#b5aca1'),sun:color('#ffcf99'),road:color('#64666a')};
  const night={sky:color('#7896aa'),hemi:color('#c0e3ff'),floor:color('#768fa4'),sun:color('#b1d3ed'),road:color('#344958')};
  scene.fog=new THREE.Fog(dry.sky,82,275);
  const entities=new Map(), srcHazards=new Map(district.hazards.map(h=>[h.id,h]));
  const plots=district.blocks.map(b=>({...b,top:height(b.x,b.z)+b.h+.6}));
  const target=new THREE.Vector3(), focus=new THREE.Vector3(), up=new THREE.Vector3(0,1,0);
  let wet=-1,clock=0,lastTime,prevX,prevZ,prevHeading=0,camYaw=0,boom=4.9,wheelAngle=0;
  let width=0,heightPx=0,ratio=0,disposed=false;

  function resize() {
    if(disposed) return;
    const w=Math.max(1,Math.round(canvas.clientWidth||canvas.getBoundingClientRect().width||1));
    const h=Math.max(1,Math.round(canvas.clientHeight||canvas.getBoundingClientRect().height||1));
    const dpr=Math.min(window.devicePixelRatio||1,1.6);
    if(w===width && h===heightPx && dpr===ratio) return;
    width=w;heightPx=h;ratio=dpr;
    renderer.setPixelRatio(dpr);renderer.setSize(w,h,false);
    camera.aspect=w/h;camera.fov=camera.aspect<.95?66:56;camera.updateProjectionMatrix();
  }
  function climate(value) {
    if(Math.abs(value-wet)<.001) return;
    wet=value;
    sky.material.uniforms.wetness.value=wet;
    scene.fog.color.lerpColors(dry.sky,night.sky,wet);scene.fog.far=lerp(275,213,wet);
    hemi.color.lerpColors(dry.hemi,night.hemi,wet);hemi.groundColor.lerpColors(dry.floor,night.floor,wet);
    hemi.intensity=lerp(1.48,1.08,wet);sun.color.lerpColors(dry.sun,night.sun,wet);sun.intensity=lerp(2.18,1.04,wet);
    asphalt.color.lerpColors(dry.road,night.road,wet);asphalt.roughness=lerp(.96,.39,wet);
    for(const facade of city.facades) facade.emissiveIntensity=lerp(.05,.77,wet);
  }
  function layFlat(obj,x,z,lift) {
    obj.position.set(x,height(x,z)+lift,z);
    const dx=height(x+.5,z)-height(x-.5,z),dz=height(x,z+.5)-height(x,z-.5);
    obj.quaternion.setFromUnitVectors(up,target.set(-dx,1,-dz).normalize());
  }
  function placeEntity(spec,key,dt,reset) {
    let obj=entities.get(key);
    if(!obj) {
      obj=makeStreetEntity(art,spec.type,spec.id);entities.set(key,obj);scene.add(obj.root);
    }
    const {x,z,type}=spec, data=srcHazards.get(spec.id);
    const r=Math.max(.15,spec.r??data?.r??1);
    const root=obj.root;root.visible=true;
    const travel=reset||obj.x===undefined?0:Math.hypot(x-obj.x,z-obj.z);
    if(type==='walker') {
      root.position.set(x,height(x,z)+roadLift,z);
      if(travel>.0002) root.rotation.y=Math.atan2(x-obj.x,z-obj.z);
      else if(obj.x===undefined) root.rotation.y=(data?.axis??'x')==='x'?Math.PI/2:0;
    } else {
      layFlat(root,x,z,roadLift+.025);
      if(type==='gate'||type==='barrier') {
        const road=streets.nearest(x,z), angle=spec.angle??data?.angle??(road?Math.atan2(road.tx,road.tz):0);
        root.rotateY(angle);root.scale.set(r,1,1);
      } else if(type==='puddle') root.scale.set(r,1,r);
    }
    obj.pose(clock,travel,dt);obj.x=x;obj.z=z;
  }
  function follow(bike,y,dt,reset) {
    const turn=Math.atan2(Math.sin(bike.heading-camYaw),Math.cos(bike.heading-camYaw));
    camYaw=reset?bike.heading:camYaw+turn*(1-Math.exp(-dt*8.8));
    const fx=-Math.sin(camYaw),fz=Math.cos(camYaw), speed=Math.min(1,Math.abs(bike.speed)/22);
    const wanted=4.48+speed*.96+(camera.aspect<.95?.8:0);
    // Check the boom against solid plot bounds; pull in immediately and ease back on exit.
    let free=wanted;
    for(const p of plots) {
      if(Math.abs(p.x-bike.x)>p.w/2+wanted+.35||Math.abs(p.z-bike.z)>p.d/2+wanted+.35||p.top<y+.9) continue;
      for(let s=.45;s<=free+.24;s+=.24) {
        const x=bike.x-fx*s,z=bike.z-fz*s;
        if(Math.abs(x-p.x)<p.w/2+.24 && Math.abs(z-p.z)<p.d/2+.24) {free=Math.min(free,Math.max(.35,s-.31));break;}
      }
    }
    boom=reset||free<boom?free:lerp(boom,free,1-Math.exp(-dt*6));
    const cx=bike.x-fx*boom,cz=bike.z-fz*boom;
    const cy=Math.max(height(cx,cz)+1.1,y+2.30+speed*.35+(1-boom/wanted)*1.4);
    camera.position.set(cx,cy,cz);
    const ahead=2.35+speed*2.50;
    const tx=bike.x+fx*ahead,tz=bike.z+fz*ahead;
    focus.set(tx,lerp(y,height(tx,tz),.68)+.59,tz);camera.lookAt(focus);
    sky.position.copy(camera.position);
  }
  function navigation(frame) {
    const next=frame.waypoint, dest=frame.destination;
    guide.goal.visible=guide.pin.visible=!!dest;
    if(dest) {
      layFlat(guide.goal,dest.x,dest.z,roadLift+.077);
      let px=dest.x,pz=dest.z;
      for(const site of city.stops.values()) if(Math.hypot(dest.x-site.node.x,dest.z-site.node.z)<2) {
        px=site.x;pz=site.z;break;
      }
      guide.pin.position.set(px,height(px,pz)+4.35,pz);
      guide.pin.quaternion.copy(camera.quaternion);
      guide.pin.scale.setScalar(clamp(camera.position.distanceTo(guide.pin.position)/19,.87,2.85));
    }
    guide.lead.visible=!!next && (!dest||Math.hypot(next.x-dest.x,next.z-dest.z)>2.7);
    if(!guide.lead.visible) return;
    const road=streets.nearest(next.x,next.z);
    const dx=next.x-frame.bike.x,dz=next.z-frame.bike.z;
    const direction=road && dx*road.tx+dz*road.tz<0?-1:1;
    layFlat(guide.lead,next.x,next.z,roadLift+.085);
    guide.lead.rotateY(road?Math.atan2(road.tx*direction,road.tz*direction):Math.atan2(dx,dz));
  }
  function render(frame,dt=0) {
    if(disposed || !frame?.bike) return;
    resize();const bike=frame.bike;
    const reset=prevX===undefined || Math.hypot(bike.x-prevX,bike.z-prevZ)>11 || frame.elapsed<lastTime;
    const step=frame.paused?0:clamp(Number.isFinite(dt)?dt:0,0,.15);
    if(reset) {clock=frame.elapsed??0;wheelAngle=0;} else clock+=step;
    const targetWet=clamp(Number(frame.wet)||0,0,1);
    climate(reset||wet<0||frame.paused?targetWet:lerp(wet,targetWet,1-Math.exp(-step*3)));
    const fx=-Math.sin(bike.heading),fz=Math.cos(bike.heading),wb=.69;
    const front=height(bike.x+fx*wb,bike.z+fz*wb), rear=height(bike.x-fx*wb,bike.z-fz*wb);
    const y=(front+rear)/2+roadLift+.009;
    bikeArt.root.position.set(bike.x,y,bike.z);bikeArt.root.rotation.y=-bike.heading;
    bikeArt.grade.rotation.x=-Math.atan2(front-rear,2*wb);bikeArt.bank.rotation.z=clamp(bike.lean||0,-.82,.82);
    const deltaYaw=Math.atan2(Math.sin(bike.heading-prevHeading),Math.cos(bike.heading-prevHeading));
    const steer=Number.isFinite(bike.steer)?bike.steer:(!reset&&Math.abs(bike.speed*step)>.003?Math.atan(1.38*deltaYaw/(bike.speed*step)):0);
    bikeArt.stem.rotation.y=-clamp(steer,-.6,.6);
    if(!reset && step>0) wheelAngle=(wheelAngle+((bike.x-prevX)*fx+(bike.z-prevZ)*fz)/.289)%TAU;
    for(const w of bikeArt.wheels) w.rotation.x=wheelAngle;
    layFlat(shadow,bike.x,bike.z,roadLift+.021);shadow.rotateY(-bike.heading);
    follow(bike,y,step,reset);navigation(frame);
    for(const obj of entities.values()) obj.root.visible=false;
    for(const spec of frame.hazards??[]) placeEntity(spec,`h/${spec.type}/${spec.id}`,step,reset);
    for(const spec of frame.items??[]) placeEntity(spec,`i/${spec.type}/${spec.id}`,step,reset);
    rain(bike,y,clock,wet);renderer.render(scene,camera);
    prevX=bike.x;prevZ=bike.z;prevHeading=bike.heading;lastTime=frame.elapsed;
  }
  function dispose() {
    if(disposed) return;
    disposed=true;scene.traverse(object=>{if(object.isInstancedMesh)object.dispose();});
    sun.shadow.dispose();art.dispose();scene.clear();
    renderer.resetState();renderer.dispose();entities.clear();
  }
  resize();return {render,resize,dispose};
}
