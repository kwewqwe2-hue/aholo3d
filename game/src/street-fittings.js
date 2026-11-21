import * as THREE from 'three';
import { canvas2d, sequence } from './estate-ground.js';

const iron='#485a52', steel='#8e9a8e', bronze='#967b4d';
function plazaMarker(kit,f) {
  f.box('plaster',[0,.13,0],[4.68,.26,1.51],'#a99d82');
  f.box('brick',[0,.36,-.06],[4.54,.32,1.26],'#937d64');
  f.box('plaster',[0,.538,-.06],[4.62,.116,1.32],'#c4b89a');
  // Behind the masonry name slab, a bed of groundcover and a slatted seat share one plinth.
  f.box('paint',[0,.601,-.36],[4.16,.037,.55],'#62523a');
  for(let i=0;i<7;i++) {
    const x=-1.86+i*.61;
    f.shape('shrub','foliage',[x,.76+(i%3)*.045,-.36],[.61,.44,.55],
      ['#98ad76','#9ab785','#b3bf87'][i%3],[0,i*.71,0]);
  }
  for(let i=0;i<4;i++) f.box('timber',[1.59,.632,-.02+i*.106],[1.20,.071,.084],'#aa8864');
  f.box('plaster',[-.64,.923,.27],[2.96,.85,.24],'#b0a58a',[-.06,0,0]);
  f.box('metal',[-.64,1.352,.25],[3.04,.048,.30],bronze);
  const [canvas,g]=canvas2d(960,248),rng=sequence(598);
  g.fillStyle='#45594e';g.fillRect(0,0,960,248);
  for(let n=0;n<9000;n++){
    g.fillStyle=n%3?'rgba(230,212,160,.13)':'rgba(35,47,39,.24)';
    g.fillRect(rng()*960,rng()*248,1+rng()*4,1+rng()*1.6);
  }
  g.strokeStyle='#aab091';g.lineWidth=3;g.strokeRect(13,13,934,222);
  g.font='bold 148px "Microsoft YaHei", sans-serif';g.textAlign='center';g.textBaseline='middle';
  g.fillStyle='#293b31';g.fillText('牛 逼 广 场',482,134,816);
  g.fillStyle='#eadcc0';g.fillText('牛 逼 广 场',480,130,816);
  const plate=kit.art.keepMaterial(new THREE.MeshStandardMaterial({map:kit.art.texture(canvas),roughness:.68,metalness:.21}));
  f.shape('panel',plate,[-.64,.952,.406],[2.75,.693,1],'#ffffff',[-.06,0,0]);
  for(const x of [-1.94,.66])for(const y of [.67,1.21])
    f.shape('dome','metal',[x,y,.417],[.033,.033,.018],bronze);
}
function lamp(f,road) {
  const h=road?4.94:2.82, radius=road?.15:.125;
  f.box('plaster',[0,.085,0],[road?.41:.35,.17,road?.41:.35],'#ada591');
  f.drum('metal',[0,.245,0],[radius*1.89,.25,radius*1.89],iron);
  f.shape('taper','metal',[0,.18+h*.5,0],[radius*1.36,h,radius*1.36],road?'#71827a':'#5e776c');
  f.box('metal',[0,.49,radius*.65],[.109,.24,.022],steel);
  for(const x of [-.118,.118])for(const z of [-.118,.118])f.drum('metal',[x,.177,z],[.034,.024,.034],bronze);
  if(road) {
    const arm=[[0,4.88,0],[0,5.24,.16],[0,5.48,.49],[0,5.56,1.03],[0,5.51,1.40]];
    for(let i=1;i<arm.length;i++)f.beam('metal',arm[i-1],arm[i],.075,steel);
    f.beam('metal',[0,4.87,.02],[0,5.50,.97],.034,iron);
    f.shape('dome','metal',[0,5.51,1.40],[.33,.16,.72],'#5c706a');
    f.shape('dome','glazing',[0,5.47,1.43],[.29,.096,.62],'#d2d0b1');
  } else {
    f.drum('metal',[0,h+.20,0],[.46,.099,.46],iron);
    f.shape('dome','glazing',[0,h+.43,0],[.42,.48,.42],'#d2cdaf');
    for(const a of [0,Math.PI/2,Math.PI,3*Math.PI/2]){
      const x=.21*Math.cos(a),z=.21*Math.sin(a);
      f.beam('metal',[x*.72,h+.20,z*.72],[x,h+.62,z],.024,iron);
    }
    f.shape('dome','metal',[0,h+.655,0],[.57,.16,.57],iron);
    f.drum('metal',[0,h+.74,0],[.068,.10,.068],bronze);
  }
}

function pavementMarks(kit,course) {
  const [canvas,g]=canvas2d(512,512),rand=sequence(41);
  g.strokeStyle='#d5cfa9';g.lineWidth=6;g.lineCap='round';g.lineJoin='round';
  // The painted cycle stencil is a road marking for the delivery station’s parked scooters.
  for(const x of [145,350]){g.beginPath();g.arc(x,258,56,0,Math.PI*2);g.stroke();}
  g.beginPath();g.moveTo(145,258);g.lineTo(204,161);g.lineTo(257,258);g.lineTo(145,258);
  g.moveTo(257,258);g.lineTo(319,165);g.lineTo(205,172);g.moveTo(350,258);g.lineTo(313,144);
  g.lineTo(338,141);g.moveTo(185,150);g.lineTo(220,150);g.stroke();
  for(const [x,y,dx,dy] of [[24,38,1,1],[486,38,-1,1],[24,470,1,-1],[486,470,-1,-1]]){
    g.beginPath();g.moveTo(x+dx*90,y);g.lineTo(x,y);g.lineTo(x,y+dy*65);g.stroke();
  }
  g.globalCompositeOperation='destination-out';
  for(let i=0;i<8500;i++){g.fillStyle=i%3?'rgba(0,0,0,.54)':'#000';g.fillRect(rand()*512,rand()*512,1+rand()*6,1+rand()*3);}
  const marking=kit.art.keepMaterial(new THREE.MeshStandardMaterial({map:kit.art.texture(canvas),
    alphaTest:.42,roughness:.99,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
  marking.userData.noCast=true;
  const point=course.square;
  kit.frame.shape('panel',marking,[point.x+8.19,-.010,point.z-7.3],[4.92,3.45,1],'#fff5d9',[-Math.PI/2,0,-.08]);
  // A short, worn pedestrian crossing leads from the street edge to the food shops.
  // Both traffic lanes retain their complete driveable width.
  const z=course.pickup.z+13.7;
  const [line,g2]=canvas2d(384,96);g2.fillStyle='#d5cfb4';g2.fillRect(2,3,380,90);
  g2.globalCompositeOperation='destination-out';
  for(let i=0;i<5400;i++){g2.fillStyle=i%3?'rgba(0,0,0,.60)':'#000';g2.fillRect(rand()*384,rand()*96,1+rand()*5,1+rand()*3);}
  const worn=kit.art.keepMaterial(new THREE.MeshStandardMaterial({map:kit.art.texture(line),roughness:.96,alphaTest:.40,
    polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));worn.userData.noCast=true;
  for(const cx of [course.pickup.x-.37, course.landmarks.turnNorth.x-4.9]) {
    for(let i=-3;i<=3;i++)kit.frame.shape('panel',worn,[cx+i*.91,-.009,z],[.41,2.26+(i%2)*.04,1],'#ece8d6',[-Math.PI/2,0,.02]);
  }
}
export function dressStreetEdges(kit,course) {
  const poles=course.blocks.filter(b=>b.style==='streetFixture');
  for(const site of poles) {
    const group=kit.shell(site.id,site);
    const f=group.frame.child([site.x,-.022,site.z],site.yaw);
    if(site.kind==='plazaName')plazaMarker(kit,f);else lamp(f,site.kind==='roadLamp');
    group.flush();
  }
  // Insulated lines run along the fence, above the pavement, between the older posts.
  const run=['fixture-plaza-lamp','fixture-repair-lamp','fixture-shop-lamp'].map(id=>poles.find(p=>p.id===id));
  for(const p of run)kit.frame.box('metal',[p.x,4.55,p.z],[.48,.069,.078],steel);
  for(const side of [-1,1])for(let i=1;i<run.length;i++){
    const a=run[i-1],b=run[i],sag=Math.min(1.22,.018*Math.hypot(a.x-b.x,a.z-b.z));
    const at=t=>[a.x+(b.x-a.x)*t+side*.17,4.59-4*sag*t*(1-t),a.z+(b.z-a.z)*t];
    for(let n=1;n<=7;n++)kit.frame.beam('metal',at((n-1)/7),at(n/7),.021,'#4d5046');
  }
  pavementMarks(kit,course);
}
