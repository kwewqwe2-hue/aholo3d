import * as THREE from 'three';
import { grid, node, sides } from './courier-geometry.js';

const { lerp, smoothstep, clamp } = THREE.MathUtils;
const pi = Math.PI;
const charcoal = '#3c3734', edge = '#554936', steel = '#979289';
const ranges = {
  rear: [4,4,504,376], side: [516,4,504,280], top: [4,388,504,376],
  foil: [516,388,504,376], web: [516,292,252,88], tape: [768,292,252,88],
};
const divisions = [20,4,16,4,20,4,16,4];
const creaseLines = [[.025,.13,.41,.25],[.98,.23,-.43,.32],[.03,.88,-.48,.38],
  [.96,.86,.69,.38],[.94,.95,.25,.21],[.69,.06,.62,.17]];

function uv(chart,u,v) {
  const [x,y,w,h] = ranges[chart];
  return [(x+1.5+u*(w-3))/1024, 1-(y+1.5+(1-v)*(h-3))/768];
}

// Clockwise around the mouth as seen from above. Each long panel has its own
// unwrap. The radius and the four quarter circles agree on every sewn edge.
function outline(part,t,w,d,r) {
  const a=w-r, b=d-r;
  if (part===0) return [lerp(a,-a,t),-d];
  if (part===2) return [-w,lerp(-b,b,t)];
  if (part===4) return [lerp(-a,a,t),d];
  if (part===6) return [w,lerp(b,-b,t)];
  const i=(part-1)/2, angle=-(i+1+t)*pi/2;
  return [(i<2?-a:a)+r*Math.cos(angle),(i===0||i===3?-b:b)+r*Math.sin(angle)];
}

function skin(k,parent,m,chart,cols,rows,point,flip=false,coords=(u,v)=>[u,v],tint) {
  const g=grid(cols,rows,point,{flip,uv:(u,v,j)=>uv(chart,...coords(u,v,j))});
  k.put(parent,m.bagRear,g,tint);
}

function rim(k,parent,m,point,radius,color) {
  const points=[];
  divisions.forEach((n,part)=>{
    const steps=part%2===0?n/2:n;
    for (let j=0;j<steps;j++) points.push(new THREE.Vector3(...point(part,j/steps)));
  });
  const up=new THREE.Vector3(0,1,0), count=points.length;
  const basis=points.map((p,i)=>{
    const tangent=points[(i+1)%count].clone().sub(points[(i+count-1)%count]).normalize();
    const out=new THREE.Vector3().crossVectors(tangent,up).normalize();
    return [out,new THREE.Vector3().crossVectors(out,tangent)];
  });
  const tube=grid(count,6,(u,v,j,i)=>{
    const n=i%count,a=2*pi*v;
    return points[n].clone().addScaledVector(basis[n][0],radius*Math.cos(a))
      .addScaledVector(basis[n][1],radius*Math.sin(a)).toArray();
  },{closed:true});
  k.put(parent,m.cloth,tube,color);
}

function pucker(part,u,v) {
  if (part%2) return 0;
  let h=0;
  for (const [x,y,slope,reach] of creaseLines) {
    const dx=(part===2||part===4?1-u:u)-x, dy=1-v-y;
    const d=dy-slope*dx-.27*dx*dx;
    h+=Math.exp(-1.55*(dx*dx+dy*dy)/(reach*reach))*
      (.0100*Math.exp(-((d-.018)**2)/.00125)-.0125*Math.exp(-((d+.010)**2)/.00059));
  }
  const widthFade=smoothstep(Math.min(u,1-u),0,.069);
  const heightFade=smoothstep(Math.min(v,1-v),0,.069);
  const belly=.0065*Math.sin(pi*u)*Math.sin(pi*v);
  const pinned=.0045*Math.exp(-((u-.51)**2)/.012-((v-.80)**2)/.018);
  return belly+widthFade*heightFade*(h-pinned);
}

function lipHeight(x,z) {
  const hingeRelief=.035*smoothstep(z,.122,.202);
  const thumbRelief=.027*smoothstep(Math.abs(x),.195,.236)*Math.exp(-(((z+.130)/.057)**4));
  return .301-hingeRelief-thumbRelief;
}

function wall(part,u,v,inside=false) {
  const swell=Math.sin(pi*v)**.78;
  const w=inside?lerp(.218,.234,v):lerp(.240,.246,v)+.008*swell;
  const d=inside?lerp(.183,.198,v):lerp(.205,.210,v)+.0085*swell;
  let [x,z]=outline(part,u,w,d,inside?.029:.031);
  const top=lipHeight(x,z), y=lerp(inside?.016:.009,inside?top-.003:top,v);
  const displacement=inside ? -.0016*swell*Math.sin(pi*u)**2*Math.abs(Math.sin(u*6*pi+v*4*pi)) : pucker(part,u,v);
  if (part===0) z-=displacement;
  if (part===2) x-=displacement;
  if (part===4) z+=displacement;
  if (part===6) x+=displacement;
  return [x,y,z];
}

// A rounded, crowned panel with one centre vertex. Planar UVs stay regular
// across all radial strips, including the rounded corners and the centre.
function cushion(k,parent,m,chart,w,d,r,heights,rings,up,tint) {
  const pos=[],nor=[],tex=[],idx=[];
  const append=(x,z)=>{
    const delta=.0003, h=heights(x,z);
    const nx=(heights(x-delta,z)-heights(x+delta,z))/(2*delta);
    const nz=(heights(x,z-delta)-heights(x,z+delta))/(2*delta);
    const normal=new THREE.Vector3(nx,1,nz).normalize().multiplyScalar(up?1:-1);
    pos.push(x,h,z); nor.push(...normal.toArray()); tex.push(...uv(chart,.5-x/(2*w),.5+z/(2*d)));
  };
  const ring=[];
  divisions.forEach((n,part)=>{
    const steps=part%2?n:n/2;
    for(let i=0;i<steps;i++) ring.push(outline(part,i/steps,w,d,r));
  });
  const count=ring.length;
  append(0,0);
  for (const t of rings) for (const [x,z] of ring) append(x*t,z*t);
  const tri=(a,b,c)=>up?idx.push(a,b,c):idx.push(a,c,b);
  for(let i=0;i<count;i++) {
    const j=(i+1)%count; tri(0,1+i,1+j);
    for(let row=1;row<rings.length;row++){
      const a=1+(row-1)*count+i,b=1+(row-1)*count+j;
      tri(a,a+count,b+count);tri(a,b+count,b);
    }
  }
  const g=new THREE.BufferGeometry();
  for (const [key,array,stride] of [['position',pos,3],['normal',nor,3],['uv',tex,2]])
    g.setAttribute(key,new THREE.Float32BufferAttribute(array,stride));
  g.setIndex(idx); k.put(parent,m.bagRear,g,tint);
}

// A finite-width folded strap. The face, woven selvedges and underside travel
// on the same sweep. Its ends sink into the sewn reinforcement patches.
function strap(k,parent,m,points,width,thick,across,steps=16) {
  const path=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
  const cut=[[-.47,.5],[.47,.5],[.5,.23],[.49,-.36],[.45,-.5],[-.45,-.5],[-.49,-.36],[-.5,.23],[-.47,.5]];
  const frames=[];
  for(let i=0;i<=steps;i++) {
    const t=i/steps, tangent=path.getTangentAt(t), axis=new THREE.Vector3(...across);
    axis.addScaledVector(tangent,-axis.dot(tangent)).normalize();
    frames.push([path.getPointAt(t),axis,new THREE.Vector3().crossVectors(axis,tangent)]);
  }
  skin(k,parent,m,'web',steps,cut.length-1,(u,v,j,i)=>{
    const [p,axis,n]=frames[i];
    return p.clone().addScaledVector(axis,cut[j][0]*width).addScaledVector(n,cut[j][1]*thick).toArray();
  },true,(u,v,j)=>[u,cut[j][0]+.5]);
}

function sidePocket(k,m,cargo,s) {
  function surfaceX(y,z){
    const v=clamp((y-.009)/(lipHeight(s*.246,z)-.009),0,1);
    const end=lerp(.205,.210,v)+.0085*Math.sin(pi*v)**.78-.031;
    return Math.abs(wall(s<0?2:6,.5-s*z/(2*end),v)[0]);
  }
  const point=(u,v)=>{
    const crown=Math.sin(pi*u), gather=Math.sin(3*pi*u+.5)*crown;
    const darts=.0055*Math.cos(3.7*pi*u+.8*v)*crown*Math.sin(pi*v);
    const y=.048+.137*v+.007*crown*(1-v)-.006*crown*v;
    const z=lerp(-.152,.089,u)+.008*(v-.5)*(2*u-1);
    const x=surfaceX(y,z)+.0038+.012*crown*Math.sin(pi*v*.84)+.006*v+.003*gather*v+darts;
    return [s*x,y,z];
  };
  skin(k,cargo,m,'side',14,7,point,s>0,(u,v)=>[u,v],'#ead1a7');
  const hem=[];
  for(let i=0;i<=12;i++) hem.push(point(i/12,1));
  k.tube(cargo,m.cloth,edge,hem,.0036,14,5);
  // Turn the lip back into the wall, closing the small dark pocket opening at its ends.
  skin(k,cargo,m,'web',14,1,(u,v)=>{
    const p=point(u,1); p[0]-=s*v*.010; p[1]-=v*.005; return p;
  },s<0);
  for(const u of [0,1]) skin(k,cargo,m,'side',2,6,(a,v)=>{
    const p=point(u,v);p[0]-=s*.009*a;p[2]+=(u?1:-1)*.003*a;return p;
  },(u===1)===(s>0));
  const tab=[[.267,.130],[.223,.129],[.192,.127],[.163,.124]].map(([y,z])=>[s*(surfaceX(y,z)+.004),y,z]);
  strap(k,cargo,m,tab,.023,.003,[0,0,1],8);
  const loop=[[.211,.108],[.219,.109],[.220,.144],[.209,.148],[.201,.144],[.201,.111]]
    .map(([y,z])=>[s*(surfaceX(y,z)+.008),y,z]);
  k.tube(cargo,m.metal,steel,loop,.0022,16,5,true);
}

function tub(k,m,cargo) {
  for(let part=0;part<8;part++) {
    const corner=part%2!==0, count=divisions[part];
    skin(k,cargo,m,part===0?'rear':corner?'web':'side',count,corner?5:16,(u,v)=>wall(part,u,v),
      false,corner?(u,v)=>[v,u]:undefined);
    skin(k,cargo,m,'foil',corner?3:9,5,(u,v)=>wall(part,u,v,true),true);
    skin(k,cargo,m,'web',count,2,(u,v)=>{
      const a=wall(part,u,1),b=wall(part,u,1,true);
      return a.map((p,i)=>lerp(p,b[i],v)+(i===1?.0017*Math.sin(v*pi):0));
    },false,(u,v)=>[u,v]);
    skin(k,cargo,m,'web',count,2,(u,v)=>{
      const p=wall(part,u,.077*v+.003);p[0]*=1.005;p[2]*=1.005;
      p[1]+=.002*Math.sin(pi*u)*v;return p;
    });
    if(corner) {
      const pts=[];
      for(let j=0;j<=7;j++) pts.push(wall(part,.53,j/7));
      k.tube(cargo,m.cloth,charcoal,pts,.0039,9,5);
    }
  }
  rim(k,cargo,m,(p,t)=>wall(p,t,.065),.005,charcoal);
  rim(k,cargo,m,(p,t)=>wall(p,t,1),.0038,edge);
  cushion(k,cargo,m,'foil',.219,.184,.029,(x,z)=>.0165+.0013*Math.cos(x*53)*Math.cos(z*49),[.55,1],true);
  k.box(cargo,m.rubber,charcoal,[0,.007,0],[.460,.010,.387],.004);
  for(const s of sides) sidePocket(k,m,cargo,s);
}

function crown(x,z) {
  const fall=clamp(Math.max(Math.abs(x)/.248,Math.abs(z)/.216),0,1);
  const load=Math.exp(-((Math.abs(x)-.102)**2)/.0006-((z-.02)**2)/.002);
  return .3635+.012*(1-fall**3)-.0055*load+.0015*Math.sin(z*38+x*12)*(1-fall);
}

function hemPoint(part,u,w,d,r,height,cutout=false) {
  const [x,z]=outline(part,u,w,d,r);
  const relief=cutout ? .021*smoothstep(Math.abs(x),.217,.249)*Math.exp(-(((z+.130)/.055)**2))
    +.017*smoothstep(z,.180,.213) : 0;
  return [x,height+relief,z];
}

function lidPanels(k,m,cover) {
  const outer=[[.259,.228,.036,.291],[.2595,.2285,.036,.302],[.258,.227,.035,.340],[.254,.223,.034,.355]];
  const base=(part,u)=>hemPoint(part,u,...outer[0],true);
  const top=(part,u)=>{
    const [x,z]=outline(part,u,.248,.216,.033);
    return [x,crown(x,z),z];
  };
  const inside=(part,u)=>{
    const [x,z]=outline(part,u,.242,.209,.030);
    return [x,.343,z];
  };
  for(let part=0;part<8;part++){
    const n=divisions[part], corner=part%2!==0;
    skin(k,cover,m,corner?'web':'side',n,4,(u,v,j)=>{
      if(j===4) return top(part,u);
      const p=hemPoint(part,u,...outer[j],j===0);
      if(j===1)p[1]+=(base(part,u)[1]-.291)*.88;
      if(j===2)p[1]+=(base(part,u)[1]-.291)*.17;
      return p;
    },false,corner?(u,v)=>[v,u]:(u,v)=>[u,.18+.71*v]);
    // The apron folds back on itself; the central cavity stays open up to the foil panel.
    skin(k,cover,m,'web',n,2,(u,v,j)=>{
      const p=base(part,u);
      if(j===0)return p;
      if(j===2)return inside(part,u);
      return [p[0]*.984,p[1]+.001,p[2]*.983];
    },true);
    if(!corner && part!==4) skin(k,cover,m,'tape',n,2,(u,v)=>{
      const p=hemPoint(part,lerp(.025,.975,u),.2607,.2297,.036,.313+.023*v);
      const hem=base(part,lerp(.025,.975,u))[1]-.291;
      p[1]+=hem*(.23-.11*v)+.0009*Math.sin(pi*u*2.5);
      return p;
    });
  }
  rim(k,cover,m,base,.0043,charcoal);
  rim(k,cover,m,(p,u)=>hemPoint(p,u,.255,.224,.034,.354),.0054,charcoal);
  const rings=[.22,.43,.63,.80,.92,1];
  cushion(k,cover,m,'top',.248,.216,.033,crown,rings,true);
  // A heat seal compresses the foam beneath each diamond. Sample the same
  // two diagonal families as the foil chart so highlights follow the quilting.
  skin(k,cover,m,'foil',36,26,(u,v)=>{
    const z=(v-.5)*.418,r=.030;
    const corner=clamp(Math.abs(z)-(.209-r),0,r);
    const half=.242-r+Math.sqrt(Math.max(0,r*r-corner*corner));
    const x=(1-2*u)*half;
    const interior=1-Math.max(Math.abs(x)/.242,Math.abs(z)/.209);
    const a=pi*(u*6.4+(1-v)*4.2),b=pi*(u*6.4-(1-v)*4.2);
    const quilt=Math.sqrt(Math.abs(Math.sin(a)*Math.sin(b)));
    return [x,.343+.007*interior-.0031*quilt*smoothstep(interior,0,.12),z];
  },true);
  rim(k,cover,m,inside,.0053,'#70614e');
  // Both side bights pass through the pre-existing left-hand IK target.
  for(const s of sides) strap(k,cover,m,[[s*.237,.344,-.166],[s*.217,.328,-.152],
    [s*.201,.313,-.130],[s*.217,.328,-.108],[s*.237,.344,-.094]],.014,.003,[0,1,0],14);
  for(const s of sides){
    const tab=(u,v)=>{
      const x=s*.105+(u-.5)*.058,z=.015+(v-.5)*.059;
      return [x,crown(x,z)+.0011,z];
    };
    skin(k,cover,m,'web',6,5,tab,true);
    for(const across of [false,true]){
      const a=tab(.11,across?.13:.87), b=tab(.89,across?.87:.13);
      a[1]+=.0008;b[1]+=.0008;
      k.rod(cover,m.cloth,'#9d8970',a,b,.0009,.0009,4);
    }
  }
  strap(k,cover,m,[[-.125,crown(-.125,.015)+.003,.015],[-.089,.374,.015],[-.068,.392,.016],
    [-.043,.404,.017],[.038,.404,.021],[.062,.397,.020],[.087,.376,.016],[.125,crown(.125,.015)+.003,.015]],
    .028,.005,[0,0,1],24);
}

function hardware(k,m,cargo,cover) {
  const y=.296,z=.215;
  for(const s of sides){
    const x=s*.147;
    // The two outside knuckles and lower leaf stay on the body. Only the
    // middle knuckle and upper leaf follow the padded cover about the steel pin.
    k.box(cargo,m.metal,'#766d5b',[x,.269,.211],[.054,.041,.004]);
    k.box(cover,m.metal,'#85765e',[x,.319,.222],[.047,.046,.004],0,[-.15,0,0]);
    for(const off of [-.020,.020])
      k.rod(cargo,m.metal,steel,[x+off-.0065,y,z],[x+off+.0065,y,z],.0068,.0068,10);
    k.rod(cover,m.metal,'#786e5c',[x-.012,y,z],[x+.012,y,z],.007,.007,12);
    k.rod(cargo,m.metal,'#bcb2a0',[x-.028,y,z],[x+.028,y,z],.0033,.0033,10);
    for(const dx of [-.014,.014]){
      k.rod(cargo,m.metal,steel,[x+dx,.259,.213],[x+dx,.259,.216],.0036,.0036,8);
      k.rod(cover,m.metal,steel,[x+dx,.331,.225],[x+dx,.331,.228],.0036,.0036,8);
    }
  }
  // Quick-release tongue and a fixed keeper; the tongue lifts out on opening.
  strap(k,cover,m,[[0,.367,-.193],[0,.361,-.219],[0,.346,-.230],[0,.312,-.233],[0,.294,-.233]],.033,.004,[1,0,0],14);
  strap(k,cargo,m,[[0,.227,-.218],[0,.248,-.220],[0,.263,-.224],[0,.277,-.225]],.030,.003,[1,0,0],8);
  k.box(cargo,m.rubber,'#403932',[0,.2705,-.225],[.048,.023,.012],.004);
  k.box(cover,m.metal,'#a1947d',[0,.291,-.233],[.040,.021,.009],.003);
  k.box(cover,m.rubber,'#393630',[0,.291,-.238],[.024,.008,.003]);
}

export function buildCargo(k,m,cargo) {
  const hinge=node(cargo,'cargoHinge',[0,.296,.215]);
  const cover=node(hinge,'cargoLid',[0,-.296,-.215]);
  tub(k,m,cargo);
  lidPanels(k,m,cover);
  hardware(k,m,cargo,cover);
  return hinge;
}
