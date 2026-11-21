import * as THREE from 'three';
import { canvas2d, sequence } from './estate-ground.js';
import brickColor from './assets/gatehouse/worn-brick-color.webp?url&inline';
import brickNormal from './assets/gatehouse/worn-brick-normal.webp?url&inline';
import brickRoughness from './assets/gatehouse/worn-brick-roughness.webp?url&inline';

function localMap(art, uri, color, colorSpace, repeatX, repeatY) {
  const [placeholder, ctx] = canvas2d(2);
  ctx.fillStyle = color; ctx.fillRect(0, 0, 2, 2);
  const map = art.texture(placeholder, true), img = new Image();
  map.colorSpace = colorSpace; map.repeat.set(repeatX, repeatY);
  img.src = uri;
  let disposed = false;
  map.addEventListener('dispose', () => { disposed = true; });
  map.userData.ready = img.decode().then(() => {
    if (!disposed) { map.image = img; map.needsUpdate = true; }
  });
  return map;
}

// A two-metre photogrammetric brick sample sits under missing lime render.
// The mortar continues at its real size across the sill; the large chip mask is unique.
export function weatheredGateBase(kit, width, height) {
  const { art } = kit, rand = sequence(926), [canvas, ctx] = canvas2d(1024, 192);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const edge = [105, 126, 150, 81, 96, 46, 39, 106, 83, 94, 27, 49, 111, 126, 76, 83, 117, 71];
  ctx.fillStyle = '#fff';
  for (let x = 0; x < canvas.width; x++) {
    const u = x / canvas.width * (edge.length - 1), i = Math.floor(u), f = u - i;
    const h = THREE.MathUtils.lerp(edge[i], edge[i+1], f*f*(3-2*f))
      + 5*Math.sin(x*.19) + 2*Math.sin(x*.39) + rand()*11;
    ctx.fillRect(x, h, 1, 192 - h);
    if (rand() < .32) ctx.fillRect(x, h-rand()*12, 1+rand()*3, rand()*5);
  }
  const mask = art.texture(canvas); mask.colorSpace = THREE.NoColorSpace;
  const maps = [
    localMap(art,brickColor,'#946e5d',THREE.SRGBColorSpace,width/2,height/2),
    localMap(art,brickNormal,'#8080ff',THREE.NoColorSpace,width/2,height/2),
    localMap(art,brickRoughness,'#b4b4b4',THREE.NoColorSpace,width/2,height/2),
  ];
  const material = art.keepMaterial(new THREE.MeshStandardMaterial({map:maps[0], normalMap:maps[1],
    normalScale:new THREE.Vector2(.8,.8), roughnessMap:maps[2], roughness:.92, alphaMap:mask,
    alphaTest:.44, polygonOffset:true, polygonOffsetFactor:-1, polygonOffsetUnits:-1}));
  kit.root.userData.assetsReady = Promise.all([kit.root.userData.assetsReady,...maps.map(m=>m.userData.ready)]);
  return material;
}

function enamel(kit, w, h, draw) {
  const [canvas, g] = canvas2d(w, h);
  draw(g, w, h);
  return kit.art.keepMaterial(new THREE.MeshStandardMaterial({
    map: kit.art.texture(canvas), roughness:.64, metalness:.12,
  }));
}

function makeBlade(kit) {
  return enamel(kit, 360, 432, (g,w,h) => {
    const random = sequence(191);
    g.fillStyle='#294a46'; g.fillRect(0,0,w,h);
    g.strokeStyle='#c7c7a9';g.lineWidth=7;g.strokeRect(12,12,w-24,h-24);
    g.textAlign='center';g.fillStyle='#e7e1c9';
    g.font='600 44px "Microsoft YaHei",sans-serif';g.fillText('牛 角 里',w/2,82);
    g.fillRect(53,108,w-106,3);
    g.font='bold 143px "Microsoft YaHei",sans-serif';g.fillText('门岗',w/2,290,w-44);
    g.font='33px "Microsoft YaHei",sans-serif';g.fillText('物 业 值 班',w/2,365);
    for(let i=0;i<620;i++){
      const x=random()*w,y=random()*h;
      if(Math.min(x,y,w-x,h-y)<16 || random()<.035){
        g.fillStyle=i%3?'#9b8a73':'#cec7b0';g.fillRect(x,y,random()*5+1,1+random()*2);
      }
    }
  });
}

function notice(kit) {
  return enamel(kit, 596, 406, (g,w,h) => {
    g.fillStyle='#b3a38a';g.fillRect(0,0,w,h);
    for (let i=0;i<3;i++) {
      g.save();g.translate(29+i*181,39+(i%2)*13);g.rotate([-.026,.015,-.03][i]);
      g.fillStyle='#d7ccaf';g.fillRect(4,5,164,292);g.fillStyle='#eee7cf';g.fillRect(0,0,164,288);
      g.fillStyle='#45534d';g.font='bold 27px "Microsoft YaHei",sans-serif';
      g.fillText(['值班表','来访登记','交接记录'][i],14,42,141);
      for(let t=0;t<8;t++){
        g.fillStyle='#b8b29c';g.fillRect(13,61+t*24,139,1.5);
        g.fillStyle='#7b7f74';g.fillRect(18,73+t*24,23+(t*17+i*19)%47,2);
        g.fillRect(98,73+t*24,16+(t*7)%24,1.8);
      }
      g.fillStyle='#746e60';g.fillRect(17,2,19,4);g.restore();
    }
  });
}

export function dressGatehouse(kit,b,course) {
  const f=kit.frame.child([b.x,0,b.z]),front=b.d/2;
  const port=course.guardStart.x-b.x;
  const paint='#57665c', iron='#424b43', cream='#d9ceb5';
  // Project the enamel blade towards arriving riders, above the posted guard.
  const blade=f.child([port-.78,2.89,front+.56],Math.PI/2);
  blade.box('metal',[0,0,0],[.84,.98,.065],iron);
  const sign=makeBlade(kit);
  blade.shape('panel',sign,[0,0,.038],[.82,.96,1]);
  blade.shape('panel',sign,[0,0,-.038],[.82,.96,1],'#ffffff',[0,Math.PI,0]);
  for(const dy of [-.32,.32]) f.beam('metal',[port-.78,2.89+dy,front-.01],[port-.78,2.89+dy,front+.75],.044,iron);

  // The old cabinet and radio sit farther back; the fan and flask read through the open hatch.
  const deskX=port+.63;
  f.box('timber',[deskX,.86,front-1.01],[1.6,.08,.66],'#a08c6b');
  for(const side of [-1,1]) f.box('metal',[deskX+side*.68,.45,front-1.01],[.044,.80,.55],paint);
  f.drum('metal',[deskX-.48,1.10,front-.98],[.15,.40,.15],'#a74b37');
  f.drum('metal',[deskX-.48,1.32,front-.98],[.136,.054,.136],cream);
  f.drum('paint',[deskX-.25,.958,front-.88],[.10,.12,.10],'#d8c9a4');
  f.box('paint',[deskX+.03,.932,front-.83],[.28,.045,.19],'#bba881',[0,.18,0]);
  const fan=f.child([deskX+.48,.90,front-.98],-.24);
  fan.box('metal',[0,.024,0],[.31,.048,.22],paint);
  fan.beam('metal',[0,.031,0],[0,.38,0],.035,iron);
  for(const radius of [.48,.36,.24])fan.shape('ring','metal',[0,.46,.022],[radius,radius,.50],paint);
  for(let i=0;i<9;i++){
    const a=i*Math.PI/4.5;
    fan.beam('metal',[0,.46,.045],[.221*Math.cos(a),.46+.221*Math.sin(a),.013],.009,iron);
  }
  for(let i=0;i<3;i++){
    const a=i*Math.PI*2/3;
    fan.box('metal',[Math.cos(a)*.105,.46+Math.sin(a)*.105,-.005],[.186,.063,.014],'#82978c',[0,.18,a+.35]);
  }
  fan.shape('dome','metal',[0,.46,.045],[.098,.098,.04],cream);
  f.box('timber',[port+.55,1.92,front-2.50],[1.4,.96,.06],'#725d46');
  f.shape('panel',notice(kit),[port+.55,1.92,front-2.463],[1.34,.90,1]);

  const awning=f.child([port,3.13,front+.44]);
  awning.box('metal',[0,0,0],[2.60,.075,.99],paint,[-.11,0,0]);
  for(const dx of [-1.13,1.13])awning.beam('metal',[dx,-.42,-.42],[dx,-.08,.42],.032,iron);
  for(let i=0;i<19;i++)awning.box('metal',[(i-9)*.138,.036,-.002],[.032,.024,.96],'#79887b',[-.11,0,0]);
  awning.box('metal',[0,-.069,.48],[2.66,.105,.055],'#637569');
  const bay=kit.frame.child([course.guardStart.x,.022,course.guardStart.z],-course.guardStart.heading);
  for(const sx of [-1,1])for(const sz of [-1,1]) {
    bay.box('paint',[sx*.75,0,sz*1.47],[.52,.005,.065],'#c3be9e');
    bay.box('paint',[sx*.98,0,sz*1.20],[.065,.005,.60],'#c3be9e');
  }
}
