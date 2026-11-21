import * as THREE from 'three';
import { canvas2d, sequence } from './estate-ground.js';
import { rngFor } from './estate-kit.js';
import { weatheredGateBase } from './gatehouse-art.js';

export function guardBooth(kit,b) {
  const f=kit.frame.child([b.x,0,b.z]),w=b.w,d=b.d,h=b.h,front=d/2;
  const trim='#546963',aged='#c7c0b1',iron='#475955',inside='#9caca0';
  const thick=.24, sill=.87, head=2.47;
  // The south and adjoining east windows have actual negative space. The open
  // west bay on the frontage is aligned with the approach to the parked cart.
  const start=-w*.15, end=w*.5-.11, span=end-start, mid=(start+end)/2;
  const weather=weatheredGateBase(kit,span,sill);
  f.box('plaster',[0,.055,0],[w,.11,d],'#aaa69c');
  f.box('plaster',[0,h/2,-front+thick/2],[w,h,thick],aged);
  f.box('plaster',[-w/2+thick/2,h/2,0],[thick,h,d],aged);
  f.box('plaster',[w/2-thick/2,h/2,-2.0],[thick,h,d-4.0],aged);
  f.box('plaster',[w/2-thick/2,sill/2,front-2],[thick,sill,4],aged);
  f.box('plaster',[w/2-thick/2,(h+head)/2,front-2],[thick,h-head,4],aged);
  for(const x of [-w/2+.13,w/2-.13])f.box('plaster',[x,h/2,front-.16],[.28,h,.36],'#d2ccbf');
  f.box('plaster',[mid,sill/2,front-.13],[span,sill,.26],aged);
  f.shape('panel',weather,[mid,sill/2,front+.006],[span,sill,1]);
  f.box('plaster',[0,(head+h)/2,front-.13],[w,h-head,.26],'#d1cbbb');
  f.box('plaster',[mid,sill+.025,front-.10],[span+.08,.09,.47],'#a7a397');
  f.box('metal',[mid,head-.026,front-.14],[span,.071,.12],trim);
  f.box('metal',[mid,sill+.10,front-.15],[span,.062,.12],trim);
  for(const x of [start,end,mid+1.12]) {
    f.box('metal',[x,(sill+head)/2,front-.17],[.058,head-sill,.10],iron);
  }
  f.box('plaster',[0,h+.04,0],[w+.53,.19,d+.56],'#b2b0a6');
  f.box('metal',[0,h+.155,0],[w+.61,.057,d+.65],trim);
  f.box('metal',[0,h-.025,front+.24],[w+.59,.14,.078],'#647976');
  f.box('plaster',[0,1.43,front-2.67],[w-.41,2.86,.19],inside);
  f.box('paint',[0,.53,front-2.56],[w-.42,1.06,.025],'#5d756c');
  f.box('paint',[0,2.90,front-1.35],[w-.42,.13,2.73],'#a1ada2');
  const deskX=start+.18;
  f.box('timber',[deskX,.84,front-1.54],[1.96,.09,.73],'#9d7b59');
  for(const x of [-1,1])f.box('metal',[deskX+x*.81,.46,front-1.56],[.06,.76,.61],iron);
  f.box('paint',[deskX-.42,.91,front-1.41],[.42,.045,.27],'#d9d8cb',[0,-.24,0]);
  f.box('metal',[deskX+.32,1.085,front-1.63],[.34,.29,.12],'#3b4844',[0,.30,0]);
  f.beam('metal',[deskX+.41,1.18,front-1.65],[deskX+.45,1.53,front-1.65],.015,'#49544d');
  const lockerX=-w*.5+.92;
  f.box('metal',[lockerX,1.07,front-2.20],[1.22,2.01,.46],'#77877f');
  for(const side of [-1,1]){
    f.box('metal',[lockerX+side*.30,1.09,front-1.94],[.565,1.83,.025],'#8e9e93');
    f.box('metal',[lockerX+side*.095,1.04,front-1.91],[.031,.17,.046],iron);
    for(let j=0;j<4;j++)f.box('paint',[lockerX+side*.30,1.67+j*.047,front-1.923],[.32,.014,.021],'#57675e');
  }
  f.box('paint',[deskX+.45,1.88,front-2.53],[1.24,.78,.09],'#54695f');
  for(const dx of [-.31,.01,.32])f.box('paint',[deskX+.45+dx,1.90,front-2.47],[.24,.42,.01],'#d1cfbd',[0,0,dx*.11]);
  f.box('metal',[deskX,2.76,front-1.42],[1.12,.08,.17],iron);
  f.box('glow',[deskX,2.71,front-1.41],[1.03,.035,.10],'#e3eee8');
  f.box('metal',[0,head+.08,front+.23],[w-.18,.065,.61],'#677a70',[-.12,0,0]);
  for(const x of [-w*.414,-w*.14,w*.16,w*.43])
    f.beam('metal',[x,head-.32,front],[x,head+.055,front+.48],.035,iron);
  f.shape('panel',kit.sign('保安岗亭','牛角里社区','#3e5953'),[mid,3.09,front+.02],[2.30,.60,1]);
  for(const x of [-w*.46,w*.46]){
    f.drum('metal',[x,h/2,front-.35],[.083,h,.083],'#838e84');
  }
}

function courtSurface(kit) {
  const [canvas,g]=canvas2d(1024,768),rng=sequence(146);
  g.fillStyle='#598e88';g.fillRect(0,0,1024,768);
  g.fillStyle='#bf8164';g.fillRect(399,47,226,265);
  g.fillStyle='#54847e';g.fillRect(51,45,922,9);
  g.strokeStyle='#e2d7ad';g.lineWidth=4.7;g.strokeRect(46,46,932,677);
  g.strokeRect(399,47,226,265);
  g.beginPath();g.arc(512,313,113,0,Math.PI);g.stroke();
  g.setLineDash([15,13]);g.beginPath();g.arc(512,313,113,Math.PI,Math.PI*2);g.stroke();g.setLineDash([]);
  g.beginPath();g.moveTo(148,47);g.lineTo(148,168);g.bezierCurveTo(160,596,864,596,876,168);g.lineTo(876,47);g.stroke();
  g.strokeStyle='#ccbea3';g.lineWidth=3.2;
  g.beginPath();g.arc(512,720,98,Math.PI,2*Math.PI);g.stroke();
  for(let i=0;i<29000;i++){
    const x=rng()*1024,y=rng()*768;
    const edge=Math.min(x,1024-x,y,768-y), wear=edge<67 || ((x+y*.42)%265<31);
    g.fillStyle=i%3===0?'rgba(37,50,47,.24)':wear?'rgba(211,176,139,.58)':'rgba(198,180,144,.22)';
    const size=wear?1+rng()*5.0:.6+rng()*2.3;g.fillRect(x,y,size,size*.69);
  }
  for(let i=0;i<55;i++){
    let x=rng()*1024,y=rng()*768;g.beginPath();g.moveTo(x,y);
    for(let j=0;j<4;j++){x+=rng()*22-8;y+=rng()*10-2;g.lineTo(x,y);}
    g.strokeStyle='rgba(76,76,62,.31)';g.lineWidth=.7+rng();g.stroke();
  }
  return kit.art.keepMaterial(new THREE.MeshStandardMaterial({map:kit.art.texture(canvas),roughness:.96}));
}

export function basketball(kit,b) {
  const f=kit.frame.child([b.x,0,b.z]);
  f.box('plaster',[0,b.h/2,0],[b.w,b.h,b.d],'#b2a68c');
  f.shape('panel',courtSurface(kit),[0,b.h+.011,0],[b.w-.40,b.d-.40,1],'#ffffff',[-Math.PI/2,0,0]);
  for(const s of [-1,1]){
    f.box('brick',[s*(b.w/2-.16),b.h+.054,0],[.28,.12,b.d],'#c5b598');
    f.box('brick',[0,b.h+.054,s*(b.d/2-.16)],[b.w,.12,.28],'#c5b598');
  }
  // One regulation-height rim. The raised court and its pole stay inside the block.
  const z=-b.d/2+Math.max(1.6,b.d*.085),h=b.h;
  f.box('plaster',[0,h+.10,z-.88],[.89,.19,.96],'#ab9f86');
  f.beam('metal',[0,h+.10,z-.88],[0,h+3.42,z-.88],.15,'#475e4e');
  f.beam('metal',[0,h+2.45,z-.86],[0,h+3.51,z+.38],.096,'#4d6856');
  f.beam('metal',[0,h+3.44,z-.86],[0,h+3.53,z+.38],.086,'#677566');
  f.box('metal',[0,h+3.54,z+.42],[1.88,1.13,.08],'#59645a');
  f.box('paint',[0,h+3.54,z+.474],[1.76,1.02,.027],'#d8ccaa');
  for(const sign of [-1,1]){
    f.box('paint',[sign*.294,h+3.30,z+.50],[.035,.44,.018],'#8d513d');
    f.box('paint',[0,h+3.30+sign*.20,z+.50],[.617,.035,.018],'#8d513d');
  }
  f.shape('ring','metal',[0,h+3.05,z+.80],[.54,.54,.67],'#b25937',[Math.PI/2,0,0]);
  for(let i=0;i<12;i++){
    const a=i*Math.PI/6,an=a+.28;
    f.beam('paint',[Math.cos(a)*.243,h+3.04,z+.80+Math.sin(a)*.243],
      [Math.cos(an)*.142,h+2.71,z+.80+Math.sin(an)*.142],.013,'#d5ceb1');
  }
  for(const side of [-1,1]) bench(f,side*(b.w*.5-.71),h,b.d*.26,Math.PI/2);
}

export function bench(frame,x,y,z,yaw=0){
  const f=frame.child([x,y,z],yaw);
  for(const s of [-1,1])f.box('metal',[s*.71,.22,0],[.085,.44,.48],'#525e50');
  for(let i=0;i<4;i++)f.box('timber',[0,.45,(i-1.5)*.12],[1.95,.075,.10],'#99724a');
  for(const s of [-1,1])f.beam('metal',[s*.71,.38,-.19],[s*.71,.92,-.29],.044,'#566250');
  for(let i=0;i<2;i++)f.box('timber',[0,.68+i*.16,-.25-i*.035],[1.95,.123,.055],'#a77d52',[-.16,0,0]);
}

function bicycle(f,x,z,color,angle) {
  const bike=f.child([x,0,z],angle);
  for(const s of [-1,1]){
    bike.shape('ring','paint',[s*.57,.345,0],[.70,.70,1],'#353a34');
    bike.shape('ring','metal',[s*.57,.345,.007],[.62,.62,.28],'#999d8f');
    for(let i=0;i<5;i++){const a=i*Math.PI/5;
      bike.beam('metal',[s*.57-Math.cos(a)*.285,.345-Math.sin(a)*.285,0],
        [s*.57+Math.cos(a)*.285,.345+Math.sin(a)*.285,0],.011,'#a4a497');}
  }
  for(const [a,b] of [
    [[-.57,.345,0],[0,.34,0]],[[0,.34,0],[-.20,.77,0]],[[-.20,.77,0],[-.57,.345,0]],
    [[0,.34,0],[.43,.76,0]],[[-.20,.77,0],[.43,.76,0]],[[.43,.76,0],[.57,.345,0]],
  ])bike.beam('metal',a,b,.043,color);
  bike.box('paint',[-.20,.82,0],[.26,.065,.16],'#463e34');
  bike.beam('metal',[.43,.76,0],[.46,.98,0],.045,'#9c9c8c');
  bike.box('metal',[.46,.98,0],[.065,.045,.48],'#777f73');
}

export function bicycleShed(kit,b){
  const f=kit.frame.child([b.x,0,b.z]),rng=rngFor(b);
  // A long run of steel bays occupies the existing blocked shed footprint.
  const span=Math.min(b.d*.80,7.8),w=b.w-.40,h=b.h;
  f.box('plaster',[0,.095,0],[b.w,.19,b.d],'#ab9f89');
  f.box('metal',[0,h,0],[w+.33,.13,span+.56],'#71938b',[.075,0,0]);
  const bays=Math.max(2,Math.round(w/4.4));
  for(let i=0;i<=bays;i++)for(const side of [-1,1]){
    const x=-w/2+w*i/bays;
    f.box('metal',[x,h/2,side*span/2],[.105,h,.105],'#5f7269');
    f.beam('metal',[x,h-.76,side*span/2],[x,h-.04,side*(span/2-.73)],.073,'#677d72');
  }
  for(let x=-w/2;x<w/2;x+=.39) f.box('metal',[x,h+.076,0],[.048,.048,span+.50],'#95a59a',[.075,0,0]);
  const n=Math.min(20,Math.round(w/1.4));
  for(let i=0;i<n;i++)bicycle(f,(i+.5)*w/n-w/2,(rng()-.5)*.60,['#65796d','#994936','#b39561','#52747a'][i%4],1.30+rng()*.27);
}

export function noticeBoard(kit,b) {
  const f=kit.frame.child([b.x,0,b.z],-.40),h=b.h;
  for(const s of [-1,1])f.box('metal',[s*.59,h/2,0],[.080,h,.085],'#686957');
  f.box('timber',[0,h*.72,0],[1.60,.91,.13],'#96774e');
  const label=kit.sign('球场外圈','牛角里 · 社区告示栏','#405a4f');
  f.shape('panel',label,[0,h*.72,.077],[1.48,.78,1]);
  f.box('timber',[0,h*.72+.51,0],[1.77,.12,.39],'#857448',[-.10,0,0]);
}
