import * as THREE from 'three';

// The authoring axes are east, depth into the building, height, in metres.
// The offline Cycles baker calls this same mesh builder, including the lightmap unwrap.
const atlasSize = 1536;
const tau = 2 * Math.PI;
const east = [1, 0, 0], north = [0, 1, 0], up = [0, 0, 1];
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const scale = (a, t) => a.map(v => v * t);
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const unit = a => scale(a, 1 / (Math.hypot(...a) || 1));
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const mix = (a, b, t) => add(a, scale(sub(b, a), t));
const xyz = ([x, d, h]) => [x, h, -d];
const clamp = THREE.MathUtils.clamp;
const colors = new Map();
function linear(hex) {
  if (!colors.has(hex)) colors.set(hex, new THREE.Color(hex).toArray());
  return colors.get(hex);
}
function randomSequence(seed) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}

// Each entry is one continuous finish. UV0 repeats in metres, UV1 never overlaps.
const finishes = {
  lime:   { tile:'plaster', metres:2.35, tint:'#fffbef', rough:.94 },
  paint:  { tile:'paint', metres:1.66, tint:'#ffffff', rough:.77 },
  base:   { tile:'plaster', metres:.83, tint:'#615d53', rough:.87 },
  stone:  { tile:'stone', metres:1.22, tint:'#fffcf4', rough:.72 },
  riser:  { tile:'stone', metres:1.22, tint:'#dcd5c6', rough:.86 },
  nosing: { tile:'stone', metres:1.22, tint:'#fff9ea', rough:.38 },
  tile:   { tile:'ceramic', metres:1.02, tint:'#f4ecdd', rough:.55 },
  wood:   { tile:'wood', metres:.75, tint:'#ffffff', rough:.42 },
  metal:  { tile:'patina', metres:.69, tint:'#687977', rough:.53, metal:.23 },
  trim:   { tint:'#9b9180', rough:.54, metal:.26 },
  matte:  { tint:'#e1d9c8', rough:.86 },
  print:  { tile:'labels', tint:'#ffffff', rough:.59 },
  portrait:{ tile:'portrait', tint:'#fff9ee', rough:.81 },
  skin:   { tile:'skin', metres:.20, tint:'#fff5e7', rough:.72 },
  blouse: { tile:'linen', metres:.24, tint:'#ebddce', rough:.90 },
  leaf:   { tile:'foliage', tint:'#e9eec6', rough:.49, twoSided:true },
  light:  { tint:'#fff0c1', glow:true },
  glass:  { tint:'#adc2ba', rough:.18, glass:true },
};

class Joinery {
  constructor() {
    this.batches = new Map();
    this.charts = [];
    this.part = 'fixed';
  }
  face(points, finish, toward, { tint, bake = false, uv, normals } = {}) {
    let n = unit(cross(sub(points[1],points[0]), sub(points[2],points[0])));
    if (Math.hypot(...n) < .5) return;
    if (toward && dot(n,toward) < 0) {
      points = points.toReversed(); uv = uv?.toReversed(); normals = normals?.toReversed(); n = scale(n,-1);
    }
    const key = [this.part, finish, bake].join('.');
    let batch = this.batches.get(key);
    if (!batch) {
      batch = {part:this.part, finish, bake, positions:[], normals:[], colors:[], uv:[], uv1:[], indices:[]};
      this.batches.set(key,batch);
    }
    const start = batch.positions.length / 3, style = finishes[finish], rgb = linear(tint || style.tint);
    const [i,j] = Math.abs(n[2]) >= Math.max(Math.abs(n[0]),Math.abs(n[1])) ? [0,1]
      : Math.abs(n[0]) >= Math.abs(n[1]) ? [1,2] : [0,2];
    const chart = points.map(p => [p[i],p[j]]);
    for (let k=0;k<points.length;k++) {
      batch.positions.push(...points[k]); batch.normals.push(...(normals?.[k] || n)); batch.colors.push(...rgb);
      batch.uv.push(...(uv?.[k] || chart[k].map(v => v / (style.metres || 1))));
      if (bake) batch.uv1.push(0,0);
      if (k >= 2) batch.indices.push(start,start+k-1,start+k);
    }
    if (bake) {
      const u=chart.map(p=>p[0]), v=chart.map(p=>p[1]);
      const x=Math.min(...u), y=Math.min(...v);
      this.charts.push({batch,start,chart,x,y,w:Math.max(...u)-x,h:Math.max(...v)-y});
    }
  }
  box(lo,hi,finish,options) {
    const [a,b,c]=lo, [x,y,z]=hi;
    const p=[[a,b,c],[x,b,c],[x,y,c],[a,y,c],[a,b,z],[x,b,z],[x,y,z],[a,y,z]];
    for (const ids of [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]])
      this.face(ids.map(i=>p[i]),finish,null,options);
  }
  // Profile rings allow a handrail, lamp bowl, ceramic pot or sleeve to keep a
  // shaped silhouette and smooth highlights with one shared material draw.
  rings(rings,finish,options={},rounded=true) {
    const sides=rings[0].length, along=rings.length;
    const normal=(row,i)=>{
      const tangent=sub(rings[row][(i+1)%sides],rings[row][(i+sides-1)%sides]);
      return unit(cross(tangent,sub(rings[Math.min(along-1,row+1)][i],rings[Math.max(0,row-1)][i])));
    };
    const centers=rings.map(r=>scale(r.reduce(add,[0,0,0]),1/sides));
    let length=0;
    for(let j=0;j<along-1;j++){
      const segment=Math.hypot(...sub(centers[j+1],centers[j]));
      for(let i=0;i<sides;i++){
        const k=(i+1)%sides, corners=[[j,i],[j,k],[j+1,k],[j+1,i]];
        const points=corners.map(([row,col])=>rings[row][col]);
        this.face(points,finish,null,{...options,normals:rounded?corners.map(([row,col])=>normal(row,col)):undefined,
          uv:[[length/.75,i/sides], [length/.75,(i+1)/sides], [(length+segment)/.75,(i+1)/sides], [(length+segment)/.75,i/sides]]});
      }
      length+=segment;
    }
    this.face(rings[0].toReversed(),finish,null,options);
    this.face(rings.at(-1),finish,null,options);
  }
  tube(path, radius, finish, tint, sides=8, flatness=1) {
    const first=unit(sub(path[1],path[0]));
    let lateral=unit(cross(Math.abs(first[2])>.85?east:up,first));
    const rings=path.map((p,i)=>{
      const t=unit(sub(path[Math.min(path.length-1,i+1)],path[Math.max(0,i-1)]));
      const projection=sub(lateral,scale(t,dot(lateral,t)));
      lateral=unit(Math.hypot(...projection)>.001?projection:cross(Math.abs(t[2])>.85?east:up,t));
      const b=cross(t,lateral), r=Array.isArray(radius)?radius[i]:radius;
      return Array.from({length:sides},(_,k)=>add(p,add(scale(lateral,r*Math.cos(k*tau/sides)),
        scale(b,r*flatness*Math.sin(k*tau/sides)))));
    });
    this.rings(rings,finish,{tint});
  }
  turned(center,profile,finish,tint,sides=20) {
    this.rings(profile.map(([h,rx,ry=rx,ox=0,oy=0])=>Array.from({length:sides},(_,i)=>{
      const a=tau*i/sides; return add(center,[ox+rx*Math.cos(a),oy+ry*Math.sin(a),h]);
    })),finish,{tint});
  }
  unpack() {
    const pad=3, charts=this.charts.sort((a,b)=>b.h-a.h || b.w-a.w);
    let density=38;
    for(;;density-=2) {
      let x=0,y=0,row=0;
      for(const c of charts){
        c.pw=Math.max(2,Math.ceil(c.w*density)); c.ph=Math.max(2,Math.ceil(c.h*density));
        if(x+c.pw+2*pad>atlasSize){x=0;y+=row;row=0;}
        c.left=x+pad;c.top=y+pad;x+=c.pw+2*pad;row=Math.max(row,c.ph+2*pad);
      }
      if(y+row<=atlasSize)break;
      if(density<=8)throw Error('楼道光图超出图幅');
    }
    for(const c of charts) {
      c.chart.forEach(([u,v],k)=>{
        const i=(k+c.start)*2;
        c.batch.uv1[i]=(c.left+.5+(u-c.x)/Math.max(.00001,c.w)*(c.pw-1))/atlasSize;
        c.batch.uv1[i+1]=1-(c.top+.5+(v-c.y)/Math.max(.00001,c.h)*(c.ph-1))/atlasSize;
      });
    }
    return {batches:[...this.batches.values()], atlasSize, density};
  }
}

// Plane coordinates are (horizontal along wall, height, offset into stairwell).
function wallAxes(side,anchor) {
  const inward={front:north,back:scale(north,-1),west:east,east:scale(east,-1)}[side];
  const horiz=side==='front'||side==='back' ? east : north;
  return {inward,horiz, at:(u,h,v=0)=>add(anchor,add(scale(horiz,u),add(scale(up,h),scale(inward,v))))};
}
function clipHeight(poly, height, keepAbove) {
  const out=[];
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length], da=height(a),db=height(b);
    const inside=keepAbove?da>=0:da<=0, next=keepAbove?db>=0:db<=0;
    if(inside)out.push(a);
    if(inside!==next && Math.abs(da)>1e-8 && Math.abs(db)>1e-8)out.push(mix(a,b,da/(da-db)));
  }
  return out;
}
function wallShell(mesh, wall, range, height, holes, datum, layout, lastBand, cuts=[]) {
  const thick=.245, opts={bake:true};
  const us=[...new Set([range[0],range[1],...cuts,...holes.flatMap(h=>h.slice(0,2))])].sort((a,b)=>a-b);
  const hs=[...new Set([0,height,...holes.flatMap(h=>h.slice(2))])].sort((a,b)=>a-b);
  for(let i=1;i<us.length;i++)for(let j=1;j<hs.length;j++){
    const a=us[i-1], b=us[i], low=hs[j-1],high=hs[j],mid=(low+high)/2, u=(a+b)/2;
    if(holes.some(([l,r,s,t])=>u>l&&u<r&&mid>s&&mid<t))continue;
    const rect=[[a,low],[b,low],[b,high],[a,high]];
    // Paint follows the rake of each flight and turns level at each landing.
    const last=lastBand(u);
    for(let level=-1;level<=last;level++){
      const base=level*layout.floorHeight;
      const topOfPlaster=level===last ? height+layout.floorHeight : layout.floorHeight;
      for(const [bottom,top,finish] of [[0,.105,'base'],[.105,1.09,'paint'],[1.09,topOfPlaster,'lime']]){
        let poly=clipHeight(rect,([s,h])=>h-datum(s)-base-bottom,true);
        poly=clipHeight(poly,([s,h])=>h-datum(s)-base-top,false);
        if(poly.length>=3)mesh.face(poly.map(([s,h])=>wall.at(s,h)),finish,wall.inward,opts);
      }
    }
    mesh.face(rect.map(([s,h])=>wall.at(s,h,-thick)),'lime',scale(wall.inward,-1),opts);
  }
  for(const [a,b,low,high] of holes){
    for(const [u,dir] of [[a,1],[b,-1]])mesh.face([wall.at(u,low),wall.at(u,high),wall.at(u,high,-thick),wall.at(u,low,-thick)],
      'lime',scale(wall.horiz,dir),opts);
    for(const [h,dir] of [[low,1],[high,-1]])mesh.face([wall.at(a,h),wall.at(b,h),wall.at(b,h,-thick),wall.at(a,h,-thick)],'stone',scale(up,dir),opts);
  }
}
function joinBox(mesh,wall,u0,u1,h0,h1,v0,v1,finish,tint,bake=false) {
  const a=wall.at(u0,h0,v0),b=wall.at(u1,h1,v1);
  mesh.box(a.map((v,i)=>Math.min(v,b[i])),a.map((v,i)=>Math.max(v,b[i])),finish,{tint,bake});
}
function openingFrame(mesh,wall,[a,b,low,high],color,thickness=.059) {
  for(const u of [a,b])joinBox(mesh,wall,u-thickness/2,u+thickness/2,low,high,-.15,-.035,'metal',color);
  for(const h of [low,high])joinBox(mesh,wall,a,b,h-thickness/2,h+thickness/2,-.15,-.035,'metal',color);
}
function sash(mesh,wall,hole,panes=3) {
  const [a,b,low,high]=hole, crossbar=high-(high-low)*.32, color='#636f67';
  openingFrame(mesh,wall,hole,'#494f45',.094);
  for(let i=1;i<panes;i++){
    const u=a+i*(b-a)/panes;
    joinBox(mesh,wall,u-.026,u+.026,low,high,-.143,-.065,'metal',color);
    joinBox(mesh,wall,u-.011,u+.011,low,high,-.067,-.047,'trim','#bab5a3');
  }
  joinBox(mesh,wall,a,b,crossbar-.025,crossbar+.025,-.157,-.064,'metal',color);
  joinBox(mesh,wall,a-.075,b+.075,low-.065,low-.012,-.30,.105,'stone','#d6ccba',true);
  mesh.face([[a,low],[b,low],[b,high],[a,high]].map(([u,h])=>wall.at(u,h,-.111)),'glass',wall.inward);
  const latch=(a+b)/2;
  mesh.tube([wall.at(latch,low+.57,.002),wall.at(latch+.05,low+.60,.023),wall.at(latch+.13,low+.60,.023)],.013,'trim','#aba68f');
}

function railing(mesh,path) {
  mesh.tube(path.map(p=>add(p,[0,0,.96])),.056,'wood','#f4dfca',12,.78);
  mesh.tube(path.map(p=>add(p,[0,0,.914])),.032,'metal','#4d625c',8,.58);
  for(const h of [.14,.73])mesh.tube(path.map(p=>add(p,[0,0,h])),.016,'metal','#65776d',6);
  for(let k=1;k<path.length;k++){
    const a=path[k-1],b=path[k],n=Math.ceil(Math.hypot(...sub(b,a))/.205);
    for(let i=k===1?0:1;i<=n;i++){
      const p=mix(a,b,i/n), heavy=i===0||i===n||i%5===0;
      mesh.tube([add(p,[0,0,heavy?-.07:.115]),add(p,[0,0,.919])],heavy?.024:.012,
        'metal',heavy?'#415952':'#687c70',heavy?8:6);
      if(heavy)mesh.turned(p,[[.012,.040],[.032,.040],[.046,.030]],'metal','#7c7a64',8);
    }
  }
}
function stairFlight(mesh,g,storey,right) {
  const w=g.halfWidth, side=right?1:-1, dir=right?-1:1;
  const lower=storey*g.floorHeight+(right?g.rise:0), first=right?g.back:g.front;
  const length=g.back-g.front, tread=length/g.treads, rise=g.rise/g.treads;
  const xa=right?g.divider:-w, xb=right?w:-g.divider;
  const at=(x,q,h)=>[x,first+dir*q,lower+h];
  const ribbon=(q0,h0,q1,h1,finish,normal,opts={bake:true})=>
    mesh.face([at(xa,q0,h0),at(xb,q0,h0),at(xb,q1,h1),at(xa,q1,h1)],finish,normal,opts);
  const underside=q=>q/length*g.rise-.195;
  // Ten full risers; the first and last half-treads centre each shoe on the
  // collision ramp. The polished bullnose has a radius and a recessed throat.
  let start=0;
  for(let n=0;n<=g.treads;n++){
    const end=n===g.treads?length:(n+.5)*tread, h=n*rise;
    const nose=n===0?start:start+.019;
    ribbon(nose,h,end,h,'stone',up);
    if(n>0){
      ribbon(start-.016,h-.023,start-.012,h-.010,'nosing',[0,-dir,1]);
      ribbon(start-.012,h-.010,nose,h,'nosing',[0,-dir,1]);
      ribbon(start-.016,h-.023,start+.006,h-.039,'riser',[0,-dir,-1]);
      ribbon(start+.006,h-.039,start+.006,h-rise,'riser',[0,-dir,0]);
      for(const offset of [.052,.093]){
        const u=start+offset,strip=.012;
        mesh.face([at(xa+.057,u,h+.0009),at(xb-.057,u,h+.0009),
          at(xb-.057,u+strip,h+.0009),at(xa+.057,u+strip,h+.0009)],'matte',up,{tint:'#59594f'});
      }
    }
    const lipX=right?xa:xb;
    mesh.face([at(lipX,start,underside(start)),at(lipX,end,underside(end)),at(lipX,end,h),at(lipX,start,h)],
      'riser',[-side,0,0],{bake:true});
    start=end;
  }
  ribbon(0,underside(0),length,underside(length),'lime',[0,0,-1]);
  const railX=side*(g.divider+.045);
  railing(mesh,[at(railX,.018,.032),at(railX,length-.022,g.rise+.032)]);
}
function slab(mesh,l,r,near,far,h) {
  const options={bake:true}, rect=[[l,near,h],[r,near,h],[r,far,h],[l,far,h]];
  mesh.face(rect,'stone',up,options);
  mesh.face(rect.map(p=>add(p,[0,0,-.16])),'lime',scale(up,-1),options);
  for(const [a,b] of [[0,1],[1,2],[2,3],[3,0]]){
    mesh.face([rect[a],add(rect[a],[0,0,-.16]),add(rect[b],[0,0,-.16]),rect[b]],'riser',null,options);
  }
  // Poured terrazzo landing bays have narrow dividing strips, flush with the finish.
  for(let x=l+1.13;x<r-.02;x+=1.13)
    mesh.face([[x,near,h+.001],[x+.006,near,h+.001],[x+.006,far,h+.001],[x,far,h+.001]],'trim',up,{tint:'#91846b'});
  for(let d=near+.99;d<far-.02;d+=.99)
    mesh.face([[l,d,h+.0012],[r,d,h+.0012],[r,d+.006,h+.0012],[l,d+.006,h+.0012]],'trim',up,{tint:'#978d75'});
}

const signs={
  building:[0,0,470,188],room:[478,0,778,136],second:[782,0,1020,136],
  dial:[0,199,297,383],post:[310,200,514,292],notice:[530,166,804,498],first:[819,165,1020,273],
  fuse:[817,303,1019,492],mail:[0,402,293,505]
};
function plaque(mesh,wall,u,h,w,height,name,v=.036,bolts=true) {
  const l=u-w/2,r=u+w/2,b=h-height/2,t=h+height/2;
  joinBox(mesh,wall,l-.008,r+.008,b-.009,t+.009,v-.025,v,'metal','#525951');
  let [x0,y0,x1,y1]=signs[name];
  if(dot(wall.horiz,cross(up,wall.inward))<0)[x0,x1]=[x1,x0];
  mesh.face([wall.at(l,b,v+.001),wall.at(r,b,v+.001),wall.at(r,t,v+.001),wall.at(l,t,v+.001)],'print',wall.inward,{
    uv:[[x0,y1],[x1,y1],[x1,y0],[x0,y0]].map(([x,y])=>[x/1024,1-y/512])
  });
  if(bolts)for(const s of [-1,1])for(const k of [-1,1]){
    const p=wall.at(u+s*(w*.5-.019),h+k*(height*.5-.019),v+.002);
    mesh.tube([p,add(p,scale(wall.inward,.006))],.0075,'trim','#afaa96',6);
  }
}
function domeLight(mesh,x,d,ceiling,size=1) {
  const p=[x,d,ceiling-.201*size];
  const ring=(profile,finish,tint)=>mesh.turned(p,profile.map(([h,r])=>[h*size,r*size]),finish,tint,28);
  ring([[.102,.197],[.137,.249],[.169,.239],[.193,.214]],'metal','#736448');
  ring([[.006,.048],[.022,.105],[.047,.158],[.083,.194],[.113,.206]],'light','#ffe4a8');
  ring([[0,.022],[.012,.037],[.026,.030]],'trim','#7f6950');
  for(let i=0;i<16;i++){
    const a=i*tau/16;
    mesh.tube([[x+Math.cos(a)*.06*size,d+Math.sin(a)*.06*size,p[2]+.014*size],
      [x+Math.cos(a)*.158*size,d+Math.sin(a)*.158*size,p[2]+.052*size],
      [x+Math.cos(a)*.204*size,d+Math.sin(a)*.204*size,p[2]+.106*size]],.0037*size,'trim','#b09c73',5);
  }
}
function serviceMeters(mesh,wall,u,h) {
  const steel='#96968a',pipe='#a49f8b';
  const conduit=(path,r=.018)=>mesh.tube(path.map(([s,t,v=.067])=>wall.at(s,t,v)),r,'metal',pipe,8);
  for(let j=0;j<2;j++) {
    const c=u+j*.295;
    joinBox(mesh,wall,c-.127,c+.127,h-.213,h+.213,.014,.104,'metal','#686e62');
    joinBox(mesh,wall,c-.121,c+.121,h-.202,h+.207,.103,.128,'metal',steel);
    joinBox(mesh,wall,c-.093,c+.093,h-.077,h+.133,.128,.138,'matte','#595a4f');
    plaque(mesh,wall,c,h+.026,.165,.177,'dial',.140,false);
    for(let k=0;k<5;k++)joinBox(mesh,wall,c-.067,c+.067,h-.106-k*.015,h-.102-k*.015,.129,.138,'matte','#75766b');
    conduit([[c-.035,h+.212],[c-.035,h+.53],[c-.012,h+.58],[u+.7,h+.58]]);
    conduit([[c+.040,h-.20],[c+.04,h-.31],[c+.014,h-.375],[c-.051,h-.392],[c-.091,h-.36],[c-.091,h-.27]],.011);
  }
  conduit([[u+.73,h+.58],[u+.84,h+.58],[u+.884,h+.54],[u+.884,h-.37]]);
  joinBox(mesh,wall,u+.82,u+.95,h-.47,h-.36,.02,.085,'matte','#c5b799');
  joinBox(mesh,wall,u+.852,u+.904,h-.444,h-.385,.084,.102,'matte','#e0d2b6');
  for(let k=0;k<3;k++)
    joinBox(mesh,wall,u+.855,u+.916,h-.21+k*.33,h-.19+k*.33,.044,.095,'trim','#8a8877');
}
function gateLeaves(mesh,g,frontWall) {
  const dh=g.doorHalf;
  openingFrame(mesh,frontWall,[-dh,dh,.012,2.87],'#414f48',.071);
  joinBox(mesh,frontWall,-dh,dh,2.44,2.50,-.19,-.10,'metal','#4c5e54');
  for(let i=-3;i<=3;i++)joinBox(mesh,frontWall,i*.388-.014,i*.388+.014,2.49,2.85,-.163,-.12,'metal','#57685b');
  for(const side of [-1,1]){
    // Both old steel leaves are latched open beyond the jambs.
    const swing=v=>[side*(dh+.025+.22*v),-.155-.976*v,0];
    const normal=unit([side*.976,.22,0]), axis=unit([side*.22,-.976,0]);
    const leaf={inward:normal,horiz:axis,at:(u,h,v=0)=>add(swing(u),add([0,0,h],scale(normal,v)))};
    const edge='#465c54',w=dh-.085;
    const bar=(u0,h0,u1,h1,r=.022,tint=edge)=>mesh.tube([leaf.at(u0,h0),leaf.at(u1,h1)],r,'metal',tint,6);
    for(const u of [0,w])bar(u,.06,u,2.424,.033);
    for(const h of [.065,1.03,2.42])bar(0,h,w,h,.032);
    for(const offset of [-.017,.017])
      mesh.face([[.027,.08],[w-.027,.08],[w-.027,1.027],[.027,1.027]].map(([u,h])=>leaf.at(u,h,offset)),
        'metal',scale(normal,Math.sign(offset)),{tint:'#62796c'});
    for(const h of [.17,.92])bar(.09,h,w-.09,h,.012,'#8a9584');
    for(let j=1;j<4;j++)bar(j*w/4,1.035,j*w/4,2.418,.012);
    bar(.02,1.68,w-.02,1.68,.015);
    mesh.tube([leaf.at(w-.136,.94,-.026),leaf.at(w-.136,.94,-.091),leaf.at(w-.136,1.19,-.091),
      leaf.at(w-.136,1.19,-.026)],.015,'trim','#b9ae93',8);
  }
  const street={inward:scale(north,-1),horiz:east,at:(u,h,v=0)=>[u,-.245-v,h]};
  mesh.face([[-dh,-.44,.003],[dh,-.44,.003],[dh,.003,.011],[-dh,.003,.011]],'nosing',up,{bake:true});
  for(const side of [-1,1]){
    const a=side<0?-g.halfWidth:dh+.05, b=side<0?-dh-.05:g.halfWidth;
    joinBox(mesh,street,a,b,.018,1.00,.006,.030,'tile','#f7eddb',true);
    joinBox(mesh,street,a,b,1.00,1.033,.006,.047,'stone','#c4bdab',true);
    const u=side*(dh+.105);
    joinBox(mesh,street,u-.108,u+.108,0,3.06,-.06,.19,'lime','#efe5d0',true);
  }
  joinBox(mesh,street,-dh-.39,dh+.39,2.94,3.125,-.19,.93,'lime','#e7d9c0',true);
  joinBox(mesh,street,-dh-.43,dh+.43,3.115,3.17,.05,.98,'metal','#979380');
  plaque(mesh,street,-dh-1.13,1.96,1.04,.416,'building',.065);
  for(let row=0;row<2;row++)for(let col=0;col<3;col++){
    const u=dh+.40+.30*col, h=1.23+.232*row;
    joinBox(mesh,street,u-.148,u+.148,h-.114,h+.114,.028,.172,'metal','#939486');
    joinBox(mesh,street,u-.141,u+.141,h-.104,h+.106,.172,.183,'metal','#a5a497');
    joinBox(mesh,street,u-.102,u+.090,h+.030,h+.051,.184,.19,'matte','#4b4b41');
    joinBox(mesh,street,u-.104,u+.095,h+.05,h+.069,.180,.204,'trim','#c1b9a7');
    plaque(mesh,street,u-.039,h-.046,.094,.037,'post',.185,false);
  }
  domeLight(mesh,.04,-.46,2.94,.97);
}

function plant(mesh,p,size,seed,porcelain=false) {
  const rand=randomSequence(seed),s=size, pos=(x,d,h)=>add(p,[x*s,d*s,h*s]);
  const rings=[[0,.145],[.025,.154],[.045,.145],[.087,.177],[.28,.213],[.307,.214],[.313,.233],[.35,.229],[.356,.199],[.305,.19]];
  mesh.turned(p,rings.map(([h,r])=>[h*s,r*s]),'matte',porcelain?'#bab9a2':'#af805e');
  mesh.turned(pos(0,0,.301),[[0,.188*s],[.008*s,.19*s]],'matte','#4d4835');
  for(const [h,r] of [[.053,.151],[.284,.213],[.337,.232]])
    mesh.turned(pos(0,0,h),[[0,r*s],[.011*s,r*s]],'matte',porcelain?'#486a83':'#c29370');
  if(porcelain)for(let i=0;i<11;i++){
    const a=i*tau/11;
    mesh.tube([pos(.187*Math.cos(a),.187*Math.sin(a),.14),
      pos(.197*Math.cos(a+.083),.197*Math.sin(a+.083),.19),
      pos(.205*Math.cos(a-.009),.205*Math.sin(a-.009),.245)],.008*s,'matte','#557a8d',5);
  }
  const greens=['#d9dcab','#ffffce','#eef1b3','#b9cba1','#f7e9ad','#ccdea2'];
  for(let vine=0;vine<10;vine++){
    const a=vine*2.399+rand()*.5, length=.29+rand()*.30, reach=.36+rand()*.24;
    const at=t=>pos(Math.cos(a)*length*t,Math.sin(a)*length*t,.32+reach*Math.sin(t*2.15)-.18*t*t+(vine%3===0?.20:0)*t);
    mesh.tube([at(0),at(.34),at(.66),at(1)],.009*s,'matte','#65723c',6);
    for(let j=0;j<6;j++){
      const t=.15+j*.158,root=at(t),angle=a+(j%2?-.81:.91),len=(.13+rand()*.13)*s;
      const tip=add(root,[len*Math.cos(angle),len*Math.sin(angle),len*(.27-t*.96)]);
      const perp=[-Math.sin(angle),Math.cos(angle),0];
      const width=len*(.25+rand()*.11), tint=greens[Math.floor(rand()*greens.length)];
      const blade=(v,side)=>{
        const fullness=Math.sin(Math.PI*(.12+.88*v))**.87 * (1.18-.34*v);
        const twist=(side*.018*t-.032*Math.abs(side))*s;
        return add(add(mix(root,tip,v),scale(perp,side*width*fullness)),[0,0,(.040*s+twist)*Math.sin(Math.PI*v)]);
      };
      for(let k=0;k<5;k++)for(const side of [-1,1]){
        const a=k/5,b=(k+1)/5;
        mesh.face([blade(a,0),blade(a,side),blade(b,side),blade(b,0)],'leaf',up,
          {tint,uv:[[.5,a],[.5+side*.48,a],[.5+side*.48,b],[.5,b]]});
      }
    }
  }
}
function plantStand(mesh,x,d,h) {
  for(const sx of [-.34,.34])for(const sd of [-.215,.215])
    mesh.box([x+sx-.019,d+sd-.018,h+.006],[x+sx+.019,d+sd+.018,h+.87],'wood',{tint:'#bbaa8f'});
  for(const level of [.13,.52,.84])
    mesh.box([x-.37,d-.246,h+level],[x+.37,d+.246,h+level+.028],'wood',{tint:'#c8b393'});
  plant(mesh,[x-.025,d,h+.873],.94,118,true);
  mesh.turned([x+.18,d,h+.552],[[0,.064],[.021,.084],[.134,.113],[.15,.116]],'matte','#a57b5e');
  mesh.turned([x-.14,d,h+.158],[[0,.086],[.02,.096],[.193,.104],[.207,.088]],'metal','#a5ada0');
}

function landingDoor(mesh,wall,u,h,opening,level) {
  const [a,b]=opening,color='#424f43';
  for(const s of [a,b]){
    joinBox(mesh,wall,s-.041,s+.041,h,h+2.265,-.15,.041,'wood','#726f5a');
    joinBox(mesh,wall,s-.062,s+.062,h,h+2.284,.028,.068,'metal',color);
    joinBox(mesh,wall,s-.014,s+.014,h+.013,h+2.20,.068,.078,'trim','#898d77');
  }
  joinBox(mesh,wall,a-.064,b+.064,h+2.20,h+2.29,-.16,.067,'metal',color);
  joinBox(mesh,wall,a-.04,b+.04,h-.008,h+.023,-.27,.055,'stone','#c8bca6',true);
  if(level<3){
    joinBox(mesh,wall,a+.037,b-.037,h+.020,h+2.207,-.105,-.046,'metal',level===1?'#746c55':'#607369');
    plaque(mesh,wall,u,h+1.76,.208,.109,level===1?'first':'second',-.039);
    mesh.tube([wall.at(a+.17,h+.99,-.045),wall.at(a+.17,h+.99,.015),wall.at(a+.275,h+.99,.015)],.014,'trim','#bbb498');
  }
}
function apartment(mesh,g,eastWall) {
  const w=g.halfWidth,H=g.floorHeight*2,u=g.local(g.door302).d;
  const farD=g.front+.38, farX=w+3.20, thick=.245;
  // The apartment vestibule projects into the side court. There is space for
  // the door to swing and for the tenant to stand behind the actual opening.
  // Bury the return ends in masonry. Coplanar end caps would flicker through the half-wall paint.
  mesh.box([w+thick/2,-.245,.0],[farX,0,3*g.floorHeight+.18],'lime',{bake:true});
  mesh.box([w+thick/2,farD,0],[farX,farD+.19,3*g.floorHeight+.18],'lime',{bake:true});
  mesh.box([farX-.23,0,.0],[farX,farD,3*g.floorHeight+.18],'lime',{bake:true});
  for(const z of [0,g.floorHeight,H,3*g.floorHeight])
    mesh.box([w+thick,0,z-.13],[farX,farD,z],'wood',{tint:'#b49b80',bake:true});
  const inner=wallAxes('east',[farX-.235,0,0]);
  joinBox(mesh,inner,.035,farD-.02,H,H+.13,0,.026,'wood','#ab8862');
  joinBox(mesh,inner,.45,1.34,H+.18,H+.24,0,.36,'wood','#a78362');
  joinBox(mesh,inner,.52,1.27,H+.24,H+.64,0,.32,'wood','#ceb08a');
  joinBox(mesh,inner,.46,1.34,H+.64,H+.684,0,.37,'wood','#ab835f');
  joinBox(mesh,inner,.74,1.44,H+1.21,H+1.69,0,.047,'wood','#9d7453');
  joinBox(mesh,inner,.781,1.397,H+1.25,H+1.65,.045,.051,'matte','#c8aa83');
  const street=wallAxes('front',[0,-.245,0]);
  for(const h of [.26,g.floorHeight+.81,H+.81]){
    const sw={...street,inward:scale(north,-1),at:(s,y,v=0)=>[s,-.245-v,y]};
    joinBox(mesh,sw,w+.48,farX-.32,h,h+1.26,.014,.065,'metal','#69746a');
    joinBox(mesh,sw,w+.56,farX-.40,h+.073,h+1.185,.065,.075,'matte','#9ca599');
    for(let j=0;j<8;j++){
      const x=w+.56+j*(farX-w-.96)/7;
      mesh.tube([sw.at(x,h+.055,.118),sw.at(x,h+1.215,.118)],.014,'metal','#545f53');
    }
    joinBox(mesh,sw,w+.39,farX-.22,h-.068,h,.032,.237,'stone','#bdbaa8');
  }
  const hingeD=u+.526;
  const leaf=wallAxes('east',[0,0,0]);
  mesh.part='door';
  joinBox(mesh,leaf,-1.036,0,.018,2.183,-.047,.008,'metal','#4b6150');
  for(const d of [-.974,-.061])joinBox(mesh,leaf,d-.017,d+.017,.104,2.105,.008,.022,'metal','#677765');
  for(const h of [.103,.74,2.087])joinBox(mesh,leaf,-.986,-.049,h-.012,h+.012,.009,.022,'metal','#65735e');
  for(let j=0;j<5;j++)joinBox(mesh,leaf,-.872,-.177,.20+j*.039,.209+j*.039,.011,.025,'metal','#45584c');
  plaque(mesh,leaf,-.517,1.78,.304,.142,'room',.026);
  const knobD=-.91;
  joinBox(mesh,leaf,knobD-.03,knobD+.031,.87,1.096,.015,.031,'trim','#ab9b74');
  mesh.tube([leaf.at(knobD,1.038,.030),leaf.at(knobD,1.038,.089),leaf.at(knobD+.113,1.025,.093)],.014,'trim','#d6c394',10);
  mesh.tube([leaf.at(-.52,1.49,.009),leaf.at(-.52,1.49,.022)],.012,'trim','#c4ad7e',12);
  for(const z of [.275,1.065,1.925])
    mesh.tube([[0,-.003,z],[0,-.003,z+.107]],.014,'trim','#b0a588',10);
  mesh.part='fixed';
  for(let floor=0;floor<3;floor++)landingDoor(mesh,eastWall,u,floor*g.floorHeight,[u-.56,u+.56],floor+1);
  serviceMeters(mesh,eastWall,u+.86,H+1.59);
  return [w+.132,hingeD,H];
}

function tenantHead(mesh) {
  // Project the portrait onto the cheekbones, eye sockets and chin. The rear
  // hemisphere samples only hair. All directions share the same head silhouette.
  const profile=[
    [1.426,.023,.045,.087],[1.445,.043,.075,.139],[1.463,.064,.084,.202],
    [1.49,.082,.088,.249],[1.529,.092,.095,.284],[1.568,.097,.097,.296],
    [1.597,.098,.105,.314],[1.628,.099,.109,.331],[1.650,.096,.106,.327],
    [1.669,.086,.095,.285],[1.685,.067,.078,.209],[1.697,.040,.055,.131],[1.701,.008,.018,.030]
  ];
  const min=profile[0][0],max=profile.at(-1)[0],cols=40,rows=30;
  const points=[];
  for(let j=0;j<=rows;j++){
    const h=min+(max-min)*j/rows;
    let k=1;while(k<profile.length-1&&h>profile[k][0])k++;
    const row=mix(profile[k-1],profile[k],clamp((h-profile[k-1][0])/(profile[k][0]-profile[k-1][0]),0,1));
    const ring=[];
    for(let i=0;i<cols;i++){
      const a=i*tau/cols,c=Math.cos(a),s=Math.sin(a),v=(max-h)/(max-min);
      const px=.505-s*row[3],py=.023+.903*v;
      const bump=(u,y,w,height)=>Math.exp(-(((px-u)/w)**2+((py-y)/height)**2));
      const nose=.030*bump(.505,.631,.052,.066)+.018*bump(.505,.553,.037,.132);
      const lips=.008*bump(.505,.758,.096,.031);
      const cheeks=.009*(bump(.317,.563,.080,.075)+bump(.698,.563,.080,.075));
      const eyes=.009*(bump(.387,.487,.071,.041)+bump(.625,.487,.071,.041));
      ring.push({p:[.004-c*row[2]-(nose+lips+cheeks-eyes)*Math.max(0,c)**2,s*row[1],h],uv:[px,1-py]});
    }
    points.push(ring);
  }
  const point=(i,j)=>points[clamp(j,0,rows)][(i+cols)%cols].p;
  const normal=(i,j)=>unit(cross(sub(point(i,j+1),point(i,j-1)),sub(point(i+1,j),point(i-1,j))));
  for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
    const k=(i+1)%cols,a=(i+.5)*tau/cols,cs=[[i,j],[k,j],[k,j+1],[i,j+1]];
    const uv=Math.cos(a)>-.03?cs.map(([s,t])=>points[t][s].uv)
      :cs.map(([s,t])=>[.40+.16*Math.sin(s*tau/cols+t*.033),.88+.051*Math.cos(t*.11)]);
    mesh.face(cs.map(([s,t])=>point(s,t)),'portrait',[-Math.cos(a),Math.sin(a),0],{uv,normals:cs.map(([s,t])=>normal(s,t))});
  }
  mesh.turned([.106,.002,1.533],[[0,.025,.041],[.012,.045,.052],[.034,.052,.057],[.058,.043,.054],[.080,.018,.028]],
    'matte','#554b40',24);
  for(const side of [-1,1]){
    mesh.turned([.002,side*.095,1.507],[[0,.011,.008],[.009,.016,.012],[.043,.017,.012],[.050,.010,.008]],'skin','#e4cbb7',14);
    mesh.tube([[-.007,side*.104,1.518],[-.006,side*.109,1.545],[.003,side*.110,1.550]],.0026,'skin','#dad1bf',6);
  }
}
function receivingHand(mesh) {
  const skin='#fff0e2';
  mesh.tube([[.022,.002,.028],[.004,.003,.017],[-.020,0,.008],[-.040,0,.005]],
    [.024,.035,.043,.038],'skin',skin,16,.58);
  for(let i=0;i<4;i++){
    const d=(i-1.5)*.018, reach=[.059,.066,.064,.055][i], r=[.009,.0094,.0085,.0073][i];
    const joints=[[-.028,d,.010],[-.047,d*1.03,.010+r*.2],[-reach,d*1.07,-.005],
      [-reach-.006,d*1.08,-.025],[-reach+.004,d*1.09,-.043],[-reach+.012,d*1.10,-.044]];
    mesh.tube(joints,[r,r*1.05,r*.91,r*.82,r*.65,r*.34],'skin',skin,10,.88);
    mesh.tube([[-reach-.0064,d*1.08,-.023],[-reach-.004,d*1.08,-.032]],r*.56,'matte','#cda68f',8,.59);
    mesh.tube([[-.007,d*.65,.032],[-.024,d*.84,.033],[-.041,d,.021]],.0022,'skin','#dfcec0',6,.65);
  }
  mesh.tube([[.002,-.023,.012],[-.014,-.044,.010],[-.032,-.052,-.004],[-.049,-.044,-.019],[-.054,-.037,-.021]],
    [.015,.013,.011,.009,.006],'skin',skin,12);
}
function tenant(mesh) {
  const shirt='#fff2e2',shadow='#b99886',skin='#fff2e4';
  mesh.part='tenant';
  mesh.turned([0,0,0],[[.68,.136,.174],[.701,.151,.187],[.732,.155,.191],[.797,.143,.182],[.87,.151,.185],
    [.96,.143,.188],[1.09,.146,.196],[1.21,.148,.207],[1.30,.137,.219],[1.35,.123,.212],
    [1.387,.096,.140],[1.397,.071,.085]],'blouse',shirt,28);
  for(const side of [-1,1]){
    mesh.turned([0,side*.085,0],[[.076,.077,.065],[.111,.078,.067],[.335,.084,.079],
      [.41,.088,.081],[.57,.104,.090],[.75,.116,.094]],'matte','#655e5a',18);
    mesh.turned([-.042,side*.087,.018],[[0,.127,.052],[.027,.130,.056],[.061,.105,.054],[.094,.073,.048]],'matte','#72574b',18);
    mesh.face([[-.066,0,1.39],[-.094,side*.087,1.393],[-.131,side*.124,1.328],[-.140,side*.049,1.286]],
      'blouse',[-1,0,0],{tint:shadow});
  }
  mesh.turned([.008,0,0],[[1.36,.063,.069],[1.432,.059,.067],[1.49,.067,.069]],'skin',skin,20);
  tenantHead(mesh);
  for(let i=0;i<6;i++)mesh.tube([[-.139,.01,1.252-i*.085],[-.147,.01,1.252-i*.085]],.0062,'trim','#b8a48b',8);
  mesh.tube([[.002,-.174,1.323],[-.012,-.222,1.239],[-.024,-.224,1.113],[-.059,-.213,1.055]],
    [.053,.072,.061,.055],'blouse',shirt,14);
  mesh.tube([[-.059,-.213,1.063],[-.111,-.196,.976],[-.162,-.139,.933]],[.046,.041,.030],'skin',skin,14);
  mesh.turned([-.165,-.132,.893],[[0,.025,.018],[.016,.034,.023],[.044,.035,.026],[.060,.024,.019]],'skin',skin,14);
  mesh.part='sleeve';
  mesh.turned([0,0,0],[[0,.056],[.037,.072],[.099,.074],[.181,.062],[.212,.064],[.258,.065],[.281,.053]],'blouse',shirt,18);
  mesh.turned([0,0,0],[[.239,.065],[.247,.069],[.264,.067],[.278,.061]],'blouse',shadow,18);
  mesh.part='forearm';
  mesh.turned([0,0,0],[[0,.047,.050],[.052,.052,.055],[.114,.044,.048],[.206,.031,.038],[.264,.025,.032]],'skin',skin,16);
  mesh.part='hand';receivingHand(mesh);
  mesh.part='fixed';
}

export function buildStairSurfaces(g) {
  const mesh=new Joinery(),w=g.halfWidth,H=g.floorHeight, ceiling=3*H,doorD=g.local(g.door302).d;
  const front=wallAxes('front',[0,0,0]),back=wallAxes('back',[0,g.depth,0]);
  const left=wallAxes('west',[-w,0,0]),right=wallAxes('east',[w,0,0]);
  const frontGlass=[1,2].map(k=>[-2.97,1.25,k*H+.72,k*H+2.75]);
  const backGlass=[0,1].map(k=>[-2.89,1.99,k*H+g.rise+.69,k*H+g.rise+2.76]);
  const sideGlass=[0,1].map(k=>[g.front+1.28,g.back-.28,k*H+2.88,k*H+4.71]);
  const doors=[0,1,2].map(k=>[doorD-.56,doorD+.56,k*H,k*H+2.23]);
  const ramp=d=>clamp((d-g.front)/(g.back-g.front),0,1)*g.rise;
  wallShell(mesh,front,[-w,w],ceiling,[[-g.doorHalf,g.doorHalf,0,2.89],...frontGlass],()=>0,g,()=>2);
  wallShell(mesh,back,[-w,w],ceiling,backGlass,()=>g.rise,g,()=>1);
  wallShell(mesh,left,[0,g.depth],ceiling,[],ramp,g,d=>d<=g.front?2:1,[g.front,g.back]);
  wallShell(mesh,right,[0,g.depth],ceiling,[...doors,...sideGlass],d=>H-ramp(d),g,()=>1,[g.front,g.back]);
  frontGlass.forEach(h=>sash(mesh,front,h,4));
  backGlass.forEach(h=>sash(mesh,back,h,4));
  sideGlass.forEach(h=>sash(mesh,right,h,3));
  mesh.face([[-w,0,ceiling],[w,0,ceiling],[w,g.depth,ceiling],[-w,g.depth,ceiling]],'lime',scale(up,-1),{bake:true});
  mesh.face([[-w-.245,-.245,ceiling+.13],[w+.245,-.245,ceiling+.13],[w+.245,g.depth+.245,ceiling+.13],
    [-w-.245,g.depth+.245,ceiling+.13]],'stone',up,{bake:true});
  // Continuous ground under the first return. The other decks span only the landings.
  mesh.face([[-g.divider,g.front,0],[w,g.front,0],[w,g.back,0],[-g.divider,g.back,0]],'base',up,{bake:true});
  mesh.face([[-w,g.back,0],[w,g.back,0],[w,g.depth,0],[-w,g.depth,0]],'base',up,{bake:true});
  for(let k=0;k<3;k++){
    slab(mesh,-w,w,0,g.front,k*H);
    domeLight(mesh,k===2?2.58:-.54,k===2?1.39:1.21,(k+1)*H-(k===2?0:.158),1.02);
    if(k===2)break;
    stairFlight(mesh,g,k,false);stairFlight(mesh,g,k,true);
    slab(mesh,-w,w,g.back,g.depth,k*H+g.rise);
    // Rounded return linking the two balustrades at the open well.
    for(const [d,h,s] of [[g.back,k*H+g.rise,1],...(k===0?[[g.front,H,-1]]:[])]){
      const r=g.divider+.045, path=Array.from({length:13},(_,j)=>{
        const a=j*Math.PI/12;return [-r*Math.cos(a),d+s*r*Math.sin(a),h+.992];});
      mesh.tube(path,.056,'wood','#f4dfca',12,.79);
    }
  }
  railing(mesh,[[-w+.06,g.front,2*H],[-g.divider+.02,g.front,2*H]]);
  serviceMeters(mesh,back,2.40,g.rise+1.59);
  serviceMeters(mesh,left,.38,1.60);
  plaque(mesh,left,1.83,1.51,.33,.43,'notice',.037);
  plaque(mesh,back,2.74,g.rise+H+1.57,.208,.275,'fuse',.043);
  gateLeaves(mesh,g,front);
  const hinge=apartment(mesh,g,right);
  plantStand(mesh,-w+.55,.35,2*H);
  plant(mesh,[-g.doorHalf-1.10,-.70,.006],1.50,196);
  plant(mesh,[g.doorHalf+1.09,-.67,.006],1.12,96);
  plant(mesh,[w-.34,g.depth-.30,g.rise],.90,762,true);
  // A potted climbing shrub lives in the open court, seen through real sashes.
  for(const z of [2.08,5.41]){
    mesh.box([w+.19,5.35,z-.048],[w+1.07,6.19,z],'wood',{tint:'#b5aa91'});
    for(const d of [5.47,6.01])
      mesh.tube([[w+.22,d,z-.53],[w+.22,d,z-.06],[w+.99,d,z-.06],[w+.22,d,z-.53]],
        .019,'metal','#798772',6);
    plant(mesh,[w+.74,5.78,z],z<3?1.58:1.95,z<3?261:37);
  }
  mesh.turned([w-.33,.318,2*H],[[0,.124],[.043,.132],[.312,.158],[.348,.169]],'wood','#cbb79c',16);
  plant(mesh,[w-.33,.318,2*H+.350],.86,305,true);
  tenant(mesh);
  return {...mesh.unpack(),hinge,tenant:[w+.62,doorD-.44,2*H]};
}

const images={
  paint:new URL('./assets/stair/half-wall.webp?inline',import.meta.url).href,
  wallRH:new URL('./assets/stair/plaster-rh.webp?inline',import.meta.url).href,
  stone:new URL('./assets/stair/terrazzo.webp?inline',import.meta.url).href,
  stoneRH:new URL('./assets/stair/terrazzo-rh.webp?inline',import.meta.url).href,
  ceramic:new URL('./assets/stair/tile.webp?inline',import.meta.url).href,
  wood:new URL('./assets/stair/oak.webp?inline',import.meta.url).href,
  patina:new URL('./assets/stair/iron-patina.webp?inline',import.meta.url).href,
  labels:new URL('./assets/stair/enamel.webp?inline',import.meta.url).href,
  portrait:new URL('./assets/stair/resident.webp?inline',import.meta.url).href,
  skin:new URL('./assets/stair/hands.webp?inline',import.meta.url).href,
  linen:new URL('./assets/stair/calico.webp?inline',import.meta.url).href,
  foliage:new URL('./assets/stair/leaf.webp?inline',import.meta.url).href,
  irradiance:new URL('./assets/stair/irradiance.webp?inline',import.meta.url).href,
};
const householdState=Symbol.for('building7.household'), rootForScene=new WeakMap();
const initialPixel={paint:'#60735e',stone:'#928d7b',wood:'#8b5d3b',irradiance:'#79746b'};
function loadFinishes(art,plaster) {
  const textures={},loads=[];
  for(const map of [plaster.map,plaster.normalMap,plaster.roughnessMap])loads.push(map.userData.ready);
  for(const [key,url] of Object.entries(images)){
    const canvas=document.createElement('canvas'); canvas.width=canvas.height=1;
    const ctx=canvas.getContext('2d');ctx.fillStyle=initialPixel[key] || '#ddddcf';ctx.fillRect(0,0,1,1);
    const texture=art.texture(canvas,!['labels','irradiance','portrait','foliage'].includes(key));
    texture.name='building7-'+key;
    if(key.endsWith('RH'))texture.colorSpace=THREE.NoColorSpace;
    if(key==='irradiance'){texture.channel=1;texture.anisotropy=2;}
    textures[key]=texture;
    loads.push(new Promise((resolve,reject)=>{
      const img=new Image();
      const detach=()=>{img.onload=img.onerror=null;texture.removeEventListener('dispose',cancel);};
      const cancel=()=>{detach();resolve();};
      img.onload=()=>{
        detach();texture.dispose();texture.source=new THREE.TextureSource(img);texture.needsUpdate=true;resolve();
      };
      img.onerror=()=>{detach();reject(Error('7号楼纹理未能解码 '+key));};
      texture.addEventListener('dispose',cancel);img.src=url;
    }));
  }
  const materials=new Map();
  function material(finish,baked){
    const key=finish+(baked?'-baked':'');
    if(materials.has(key))return materials.get(key);
    const style=finishes[finish];
    const props={vertexColors:true,side:style.twoSided||style.glass?THREE.DoubleSide:THREE.FrontSide};
    let m;
    if(style.glow)m=new THREE.MeshBasicMaterial(props);
    else {
      Object.assign(props,{roughness:style.rough,metalness:style.metal||0});
      if(style.tile==='plaster') {
        // Reuse the estate's decoded CC0 plaster scan. Lime paint retains the fine sand relief.
        Object.assign(props,{map:plaster.map,normalMap:plaster.normalMap,roughnessMap:plaster.roughnessMap,
          normalScale:new THREE.Vector2(.48,.48),color:new THREE.Color().setRGB(1.46,1.46,1.37)});
      } else if(style.tile)props.map=textures[style.tile];
      if(style.tile==='stone')Object.assign(props,{roughnessMap:textures.stoneRH,bumpMap:textures.stoneRH,bumpScale:.0019});
      if(style.tile==='paint')Object.assign(props,{normalMap:plaster.normalMap,normalScale:new THREE.Vector2(.34,.34),roughnessMap:textures.wallRH});
      if(style.glass)Object.assign(props,{transparent:true,opacity:.065,depthWrite:false});
      if(baked)Object.assign(props,{lightMap:textures.irradiance,lightMapIntensity:4*Math.PI});
      m=new THREE.MeshStandardMaterial(props);
      if(baked){
        // Cycles supplies diffuse light from the sky, sun and fixtures. Retain a
        // small live direct component and the directional rough-surface glints.
        m.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_maps>',
          'irradiance = vec3(0.0);\nreflectedLight.directDiffuse *= 0.042;\nreflectedLight.directSpecular *= 0.36;\n#include <lights_fragment_maps>');};
        m.customProgramCacheKey=()=>'building7-cycles-v1';
      }
    }
    m.name='building7-'+key;materials.set(key,art.keepMaterial(m));return m;
  }
  return {material,ready:Promise.all(loads)};
}
function geometricAttribute(values) {
  const swapped=new Float32Array(values.length);
  for(let i=0;i<values.length;i+=3){swapped[i]=values[i];swapped[i+1]=values[i+2];swapped[i+2]=-values[i+1];}
  return new THREE.BufferAttribute(swapped,3);
}

export function buildStairInterior(kit,layout) {
  const {art}=kit,root=new THREE.Group(), parts={}, library=loadFinishes(art,kit.material.plaster);
  root.name='estate-stair-interior';
  root.position.set(layout.origin.x,0,layout.origin.z);
  kit.root.updateWorldMatrix(true,false);
  kit.root.worldToLocal(root.position);
  kit.root.add(root);
  const model=buildStairSurfaces(layout);
  for(const batch of model.batches){
    const name=batch.part;
    if(!parts[name]){parts[name]=new THREE.Group();parts[name].name='building7-'+name;root.add(parts[name]);}
    const geometry=art.keepGeometry(new THREE.BufferGeometry());
    geometry.setAttribute('position',geometricAttribute(batch.positions));
    geometry.setAttribute('normal',geometricAttribute(batch.normals));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(batch.colors,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(batch.uv,2));
    if(batch.bake)geometry.setAttribute('uv1',new THREE.Float32BufferAttribute(batch.uv1,2));
    geometry.setIndex(batch.indices);geometry.computeBoundingSphere();
    const mesh=new THREE.Mesh(geometry,library.material(batch.finish,batch.bake));
    mesh.name=name+'-'+batch.finish+(batch.bake?'-irradiance':'');
    mesh.castShadow=!['light','glass','print'].includes(batch.finish);
    mesh.receiveShadow=!['light','glass'].includes(batch.finish);
    parts[name].add(mesh);
  }
  parts.door.position.fromArray(xyz(model.hinge));parts.tenant.position.fromArray(xyz(model.tenant));
  const grip=new THREE.Object3D();
  grip.name='residentMealGrip';grip.position.set(-.056,-.029,.001);
  parts.hand.add(grip);
  // The baked lamp illuminates masonry; this matching bulb picks up moving
  // fingers, the bag, the resident's face and the courier under the fitting.
  const bulb=new THREE.PointLight('#ffdeb6',9.4,5.9,2);
  bulb.name='302-landing-bulb';
  bulb.position.set(2.58,3*layout.floorHeight-.35,-1.39);bulb.visible=false;root.add(bulb);
  const state={parts,tenant:parts.tenant.position.clone(),elbow:new THREE.Vector3(),wrist:new THREE.Vector3(),
    direction:new THREE.Vector3(),bend:new THREE.Vector3(),shoulder:new THREE.Vector3(),lastPose:'',bulb,layout};
  root[householdState]=state;
  poseHousehold(state,{});
  root.userData.assetsReady=library.ready;
  // homes() is called on a shell owned by the estate that buildEstate returns.
  const estate=kit.root.parent || kit.root;
  estate.userData.assetsReady=estate.userData.assetsReady
    ? Promise.all([estate.userData.assetsReady,library.ready]) : library.ready;
  return root;
}

const yAxis=new THREE.Vector3(0,1,0), ease=(x,a,b)=>THREE.MathUtils.smoothstep(x,a,b);
function poseHousehold(state,frame) {
  const {parts,shoulder,elbow,wrist,direction,bend,tenant}=state;
  const type=frame.motion?.type, progress=clamp(frame.motion?.progress??0,0,1);
  const handed=frame.cargo==='delivered';
  const key=[type,progress,handed].join('/');
  if(key===state.lastPose)return;
  state.lastPose=key;
  const knocking=type==='knock', taking=type==='handoff';
  const opened=taking||handed?1:knocking?ease(progress,.27,.95):0;
  const reach=taking ? .62+.38*ease(progress,0,.42)-.51*ease(progress,.62,1)
    : knocking?ease(progress,.62,1)*.62:handed?.49:0;
  parts.door.rotation.y=(3+40*opened)*Math.PI/180;
  parts.tenant.position.copy(tenant);
  parts.tenant.position.x-=opened*.17;
  parts.tenant.rotation.y=.11+.15*opened;
  shoulder.set(-.028,1.312,-.177).applyQuaternion(parts.tenant.quaternion).add(parts.tenant.position);
  wrist.copy(shoulder);wrist.x-=.17+.328*reach;wrist.y-=.36-.159*reach;wrist.z-=.041*reach;
  const upper=.278, lower=.260;
  direction.subVectors(wrist,shoulder);
  const length=Math.min(direction.length(),upper+lower-.001);
  direction.normalize(); wrist.copy(shoulder).addScaledVector(direction,length);
  const along=(upper*upper-lower*lower+length*length)/(2*length);
  bend.set(.20,-1,.28);bend.addScaledVector(direction,-bend.dot(direction)).normalize();
  elbow.copy(shoulder).addScaledVector(direction,along).addScaledVector(bend,Math.sqrt(Math.max(0,upper*upper-along*along)));
  parts.sleeve.position.copy(shoulder);parts.sleeve.quaternion.setFromUnitVectors(yAxis,direction.subVectors(elbow,shoulder).normalize());
  parts.forearm.position.copy(elbow);parts.forearm.quaternion.setFromUnitVectors(yAxis,direction.subVectors(wrist,elbow).normalize());
  parts.hand.position.copy(wrist);
}
export function updateStairInterior(scene,frame) {
  let root=rootForScene.get(scene);
  if(!root?.parent){
    root=scene.getObjectByName('estate-stair-interior');
    if(!root?.[householdState])return;
    rootForScene.set(scene,root);
  }
  const state=root[householdState],actor=frame.actor || frame.walker;
  state.bulb.visible=!!actor && Math.abs(actor.x-state.layout.origin.x)<9 &&
    Math.abs(actor.z-state.layout.origin.z)<13 && actor.y>state.layout.floorHeight-.2;
  poseHousehold(state,frame);
}
