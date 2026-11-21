import * as THREE from 'three';
import { solidBuilder, loft, grid, rimProfile } from './courier-geometry.js';
import { marketSites } from './market-sites.js';
import stockURL from './assets/market-life/shop-shelves.webp?url&inline';
import letteringURL from './assets/market-life/signwriter.webp?url&inline';
const pi=Math.PI,half=pi/2,tau=2*pi,one=[1,1,1],zero=[0,0,0],vertical=new THREE.Vector3(0,1,0);
const charts={
  rest:[0,0,740,169],battery:[750,0,1023,168],grain:[0,181,742,351],pickup:[752,179,1023,351],
  repair:[0,363,662,534],blade:[674,364,1023,530],pack:[0,544,361,665],water:[374,544,716,665],
  crate:[728,542,1022,665],dial:[0,678,254,933],seal:[267,681,535,822],ledger:[547,681,841,1023],bolt:[852,674,1023,895],
  tools:[4,4,509,507],jars:[515,4,1020,507],coat:[4,516,508,1020],tiles:[516,516,1020,1020],
};

function textureAtlas(art,url,name) {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1024;
  const brush=canvas.getContext('2d');brush.fillStyle='#b0a28a';brush.fillRect(0,0,1024,1024);
  const texture=art.texture(canvas),image=new Image();
  texture.name='market-'+name;let released=false;
  const cancel=()=>{released=true;};
  texture.addEventListener('dispose',cancel);image.src=url;
  const ready=image.decode().then(()=>{
    if(released)return;
    brush.drawImage(image,0,0,1024,1024);texture.needsUpdate=true;
    texture.removeEventListener('dispose',cancel);
  });
  return {texture,ready};
}
function palette(kit) {
  const {art}=kit,stock=textureAtlas(art,stockURL,'shelves'),letters=textureAtlas(art,letteringURL,'lettering');
  const surface=(name,roughness,metalness=0,extra={})=>{
    const m=art.keepMaterial(new THREE.MeshStandardMaterial({vertexColors:true,roughness,metalness,...extra}));
    m.name='market-'+name;return m;
  };
  return {ready:Promise.all([stock.ready,letters.ready]),m:{
    paint:surface('paint',.54,.17),steel:surface('steel',.35,.61),dull:surface('dull',.86,.025),
    wood:surface('wood',.73,.02,{map:kit.material.timber.map}),
    wall:surface('render',.86,0,{map:kit.material.plaster.map,normalMap:kit.material.plaster.normalMap,
      normalScale:new THREE.Vector2(.42,.42)}),
    fabric:surface('canvas',.94,0,{side:THREE.DoubleSide}),
    stock:surface('shelves',.84,0,{map:stock.texture}),
    text:surface('enamel-lettering',.59,.04,{map:letters.texture}),
    lens:surface('glass-lens',.22,.24,{emissive:'#825b32',emissiveIntensity:.15}),
  }};
}
// Store one material mesh per street section; a hundred spokes or basket ribs
// do not turn into a hundred draw calls. Positions remain local to each section.
class Workbench {
  constructor(builder,parent,materials,cache,at=zero,yaw=0){
    this.k=builder;this.parent=parent;this.m=materials;this.cache=cache;this.at=at;this.yaw=yaw;
    this.c=Math.cos(yaw);this.s=Math.sin(yaw);this.turn=new THREE.Quaternion().setFromAxisAngle(vertical,yaw);
  }
  point([x,y,z]){return [this.at[0]+this.c*x+this.s*z,this.at[1]+y,this.at[2]-this.s*x+this.c*z];}
  child(at,yaw=0){return new Workbench(this.k,this.parent,this.m,this.cache,this.point(at),this.yaw+yaw);}
  rotation(e){return e?this.turn.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...e))):this.turn;}
  geo(mat,geometry,color,at=zero,size=one,rot){this.k.put(this.parent,this.m[mat],geometry,color,this.point(at),size,this.rotation(rot));}
  box(mat,p,size,color,round=0,rot){this.k.box(this.parent,this.m[mat],color,this.point(p),size,round,this.rotation(rot));}
  egg(mat,p,radii,color,rot){this.k.egg(this.parent,this.m[mat],color,this.point(p),radii,this.rotation(rot));}
  rod(mat,a,b,r,color,rEnd=r,n=8){this.k.rod(this.parent,this.m[mat],color,this.point(a),this.point(b),r,rEnd,n);}
  pipe(mat,points,r,color,steps=points.length*2,sides=6){this.k.tube(this.parent,this.m[mat],color,points.map(p=>this.point(p)),r,steps,sides);}
  cached(name,make){if(!this.cache.has(name))this.cache.set(name,make());return this.cache.get(name);}
  chart(name,mat,p,w,h,rot){
    const geo=this.cached('uv-'+name,()=>{
      const [x0,y0,x1,y1]=charts[name],g=new THREE.PlaneGeometry(),uv=g.attributes.uv;
      for(let i=0;i<uv.count;i++)uv.setXY(i,(x0+2+uv.getX(i)*(x1-x0-4))/1024,
        1-(y1-2-uv.getY(i)*(y1-y0-4))/1024);
      return g;
    });
    this.geo(mat,geo,'#ffffff',p,[w,h,1],rot);
  }
  sign(name,p,w,h,color='#65695b'){
    this.box('paint',p,[w+.032,h+.034,.038],color,.009);
    this.chart(name,'text',[p[0],p[1],p[2]+.0205],w,h);
  }
  ring(mat,p,r,tube,color,rot){
    const key='ring'+r+'/'+tube;
    this.geo(mat,this.cached(key,()=>new THREE.TorusGeometry(r,tube,6,28)),color,p,one,rot);
  }
}

const steel='#b2b2a2', iron='#536059', dark='#373e3b', rubber='#363937';
function tubularFrame(f,ys,w,d,baseY=.055) {
  for(const i of [-1,1])for(const j of [-1,1]){
    const x=i*w/2,z=j*d/2;
    f.rod('steel',[x,.022,z],[x,ys,z],.022,steel);
    f.rod('dull',[x,0,z],[x,baseY,z],.025,rubber);
  }
}
function pallet(f,w,d) {
  for(const x of [-w*.37,0,w*.37])f.box('wood',[x,.042,0],[.084,.081,d],'#947357');
  for(let j=0;j<5;j++)f.box('wood',[0,.098,(j-2)*d*.197],[w,.030,d*.169],j%2?'#a88764':'#b19877');
}
function crate(f,w,h,d,color,fill=0) {
  // Hollow, pierced returnable HDPE, with a double rim and raised corner keys.
  f.box('paint',[0,.024,0],[w,.047,d],color,.009);
  for(const s of [-1,1]){
    for(const y of [.065,h*.52,h-.048,h-.016]){
      f.box('paint',[0,y,s*(d/2-.012)],[w,.031,.025],color);
      f.box('paint',[s*(w/2-.012),y,0],[.025,.031,d],color);
    }
    for(let n=0;n<7;n++){
      const x=(n/6-.5)*(w-.035);
      f.box('paint',[x,h*.50,s*(d/2-.013)],[n===0||n===6?.028:.017,h-.04,.024],color);
    }
    for(let n=0;n<4;n++)f.box('paint',[s*(w/2-.013),h*.50,(n/3-.5)*(d-.037)],[.024,h-.04,.018],color);
  }
  if(fill){
    f.box('dull',[0,h-.072,0],[w-.045,.047,d-.05],fill===1?'#6e783a':'#b86835');
    for(let j=0;j<3;j++)for(let i=0;i<5;i++){
      const x=(i-2)*w*.17+Math.sin(i*5+j)*.011,z=(j-1)*d*.258;
      const radius=Math.min(w*.09,d*.137);
      const tint=fill===1?['#798c4e','#a0a45c','#718544'][(i+j)%3]:['#d28948','#bd6d3d','#dfaa5f'][(i+j)%3];
      f.egg('dull',[x,h-.033+((i+j)%3)*.008,z],[radius,.074,radius*.88],tint);
      if((i+j)%3===1)f.rod('wood',[x,h+.026,z],[x+.012,h+.047,z-.007],.004,'#7a6844');
    }
  }
}
function returnCrates(f,v){
  pallet(f,1.31,.69);
  for(let i=0;i<2;i++){
    const height=v===1?3:(i?v===2?3:1:2);
    for(let j=0;j<height;j++){
      const box=f.child([(i-.5)*.62,.118+j*.272,(j%2?.009:-.014)],(j%2?1:-1)*.024);
      crate(box,.58,.285,.44,['#56766a','#906954','#66818a'][(v+i+j)%3],j===height-1&&v!==1?i+1:0);
    }
  }
  f.chart('crate','text',[.30,.26,.226],.20,.075);
}
function post(f) {
  f.box('wall',[0,.048,0],[.23,.096,.23],'#bcb7a5');
  f.box('steel',[0,.113,0],[.148,.036,.145],iron);
  f.box('paint',[0,1.44,0],[.088,2.64,.088],'#69847b');
  for(const x of [-.05,.05])for(const z of [-.05,.05])
    f.rod('steel',[x,.130,z],[x,.143,z],.013,'#929687',.013,6);
}
function shelter(f){
  for(const s of [-1,1])f.box('paint',[0,2.72,s*1.24],[5.64,.12,.10],'#526e65');
  for(const x of [-2.63,-1.31,0,1.31,2.63]){
    f.box('paint',[x,2.78,0],[.075,.106,2.96],'#738a7b',0,[-.072,0,0]);
    if(Math.abs(x)>2) for(const side of [-1,1])f.rod('paint',[x,2.31,side*1.24],[x,2.74,side*.69],.021,'#667d70');
  }
  const roof=f.cached('shelter-sheet',()=>grid(76,1,(u,v)=>[(u-.5)*5.94,2.89+.052*Math.cos(u*38*tau)+(v-.5)*.24,(.5-v)*3.14]));
  f.geo('fabric',roof,'#85998b');
  f.box('paint',[0,2.70,1.57],[5.97,.186,.08],'#607f72');
  f.sign('rest',[0,2.722,1.625],2.41,.48,'#39564c');
  const returnFace=f.child([-2.99,0,0],-half);
  returnFace.sign('rest',[0,2.72,.018],1.66,.34);
  f.pipe('steel',[[2.81,2.82,-1.51],[2.84,2.69,-1.51],[2.63,2.58,-1.32],[2.61,.16,-1.33],[2.67,.08,-1.37]],
    .038,'#9caaa0',14,8);
}
function restScreen(f){
  f.box('paint',[0,1.13,0],[5.22,2.21,.108],'#879a86');
  f.box('paint',[0,.31,.059],[5.22,.61,.020],'#637f72');
  f.chart('coat','stock',[-.74,1.34,.060],2.91,1.98);
  for(const x of [-2.55,.77,2.56])f.box('steel',[x,1.18,.077],[.046,2.36,.033],'#7e948c');
  const board=f.child([.98,0,.09],-.1);board.sign('ledger',[0,1.57,.03],.36,.47);
  for(const x of [-1.82,-1.49])f.pipe('steel',[[x,1.91,.08],[x,1.83,.155],[x,1.86,.191]],.010,steel,6);
}
function stationBench(f){
  for(const side of [-1,1]){
    const x=side*.92;
    f.pipe('paint',[[x,.02,.24],[x,.40,.225],[x,.418,-.18],[x,.02,-.21]],.030,iron);
    f.rod('paint',[x,.38,-.18],[x,.89,-.23],.022,iron);
  }
  for(let j=0;j<4;j++)f.box('wood',[0,.447,(j-1.5)*.115],[2.45,.055,.095],
    ['#ae845c','#bc9266','#a77c57','#b88b61'][j],.013);
  for(let j=0;j<2;j++)f.box('wood',[0,.695+j*.14,-.227-j*.018],[2.45,.118,.043],'#b08762',.009,[-.09,0,0]);
  const helmet=f.child([.77,.48,.014],.27);
  helmet.geo('paint',loft([[0,.12,.151,-.011],[.045,.15,.18],[.132,.142,.161],[.202,.093,.106],[.231,.041,.039]],
    {cols:22}),'#c7be9e');
  helmet.box('dull',[0,.009,-.01],[.25,.024,.30],'#53584e',.009);
  helmet.egg('steel',[0,.072,.153],[.107,.052,.025],'#697d7c');
}
function batteryLocker(f){
  f.box('dull',[0,.065,0],[1.10,.13,.66],'#aaa797');
  f.box('paint',[0,.955,-.022],[1.06,1.65,.596],'#a3b2a0',.025);
  for(let i=0;i<2;i++)for(let j=0;j<3;j++){
    const x=(i-.5)*.445,y=.407+j*.392;
    f.box('dull',[x,y,.286],[.429,.365,.016],'#495e53');
    f.box('paint',[x,y,.303],[.409,.341,.028],j===1?'#94a79c':'#829e93',.008);
    f.box('dull',[x+.126,y+.029,.325],[.044,.124,.018],'#4e5e54',.006);
    for(let k=0;k<4;k++)f.box('paint',[x-.066,y-.081+k*.019,.321],[.14,.005,.007],'#63766a');
  }
  f.sign('battery',[-.10,1.615,.307],.52,.204);
  f.box('dull',[.355,1.603,.318],[.125,.134,.023],'#40574d');
  f.box('lens',[.355,1.61,.333],[.088,.059,.005],'#a0bda6');
  f.box('paint',[0,1.806,.012],[1.095,.066,.65],'#719385',.010);
}
function waterCooler(f){
  f.box('paint',[0,.43,0],[.53,.80,.47],'#c9c3a5',.025);
  f.box('dull',[0,.515,.235],[.365,.22,.020],'#696e61');
  for(const s of [-1,1])f.pipe('steel',[[s*.095,.61,.239],[s*.095,.605,.287],[s*.095,.565,.290]],.014,s<0?'#99786e':steel,6);
  f.box('steel',[0,.348,.223],[.40,.028,.15],steel,.008);
  f.geo('lens',loft([[.819,.072,.075],[.884,.070,.073],[.928,.148,.142],[1.013,.195,.191],[1.14,.201,.191],
    [1.27,.195,.185],[1.32,.16,.148],[1.344,.091,.084]],{cols:20}),'#829e9a');
  for(const h of [1.028,1.090,1.238]) f.ring('paint',[0,h,0],.193,.0055,'#96aca4',[half,0,0]);
  f.chart('water','text',[0,.169,.238],.33,.116);
}

// Passenger e-bikes and the grocer's pedal tricycle have different wheelbases,
// silhouettes, carriers and finishes from the player's food-delivery scooter.
function wheel(f,x,z,r,wide,spokes=12) {
  const p=[x,r,z],profile=[[-wide*.54,r*.84],[-wide*.58,r*.92],[-wide*.39,r*.985],[0,r],[wide*.40,r*.985],
    [wide*.58,r*.92],[wide*.54,r*.84],[wide*.27,r*.80],[-wide*.30,r*.80],[-wide*.54,r*.84]];
  f.geo('dull',f.cached('tyre'+r+','+wide,()=>rimProfile(profile,30)),rubber,p);
  f.geo('steel',f.cached('rim'+r+','+wide,()=>rimProfile([[-wide*.40,r*.81],[-wide*.39,r*.85],
    [wide*.39,r*.85],[wide*.40,r*.81],[wide*.20,r*.777],[-wide*.20,r*.777],[-wide*.40,r*.81]],30)),steel,p);
  f.rod('steel',[x-wide*.64,r,z],[x+wide*.64,r,z],r*.16,'#7e837b',r*.16,14);
  for(let i=0;i<spokes;i++){
    const a=i*tau/spokes,b=a+.43,side=i%2?1:-1;
    f.rod('steel',[x+side*wide*.50,r+r*.11*Math.cos(b),z+r*.11*Math.sin(b)],
      [x+side*wide*.25,r+r*.81*Math.cos(a),z+r*.81*Math.sin(a)],.0055,'#a8aba0',.0055,5);
  }
}
function mudguard(f,x,z,r,width,color){
  const geo=f.cached('mudguard'+r+'/'+width,()=>grid(5,19,(u,v)=>{
    const a=(-77+154*v)*pi/180, crown=Math.sin(pi*u)*.019, rad=r+.027+crown;
    return [(u-.5)*width,rad*Math.cos(a),rad*Math.sin(a)];
  }));
  f.geo('fabric',geo,color,[x,r,z]);
}
function basket(f,w,h,d){
  f.box('steel',[0,.014,0],[w*.82,.024,d*.78],iron);
  for(const y of [.041,h*.54,h]){
    const s=.81+.19*y/h,rx=w*s/2,rz=d*s/2,r=y===h?.010:.0045;
    const corners=[[-rx,y,-rz],[rx,y,-rz],[rx,y,rz],[-rx,y,rz],[-rx,y,-rz]];
    for(let i=1;i<corners.length;i++)f.rod('steel',corners[i-1],corners[i],r,iron,r,6);
  }
  for(const side of [-1,1]){
    for(let i=0;i<=7;i++){
      const dx=w*(i/7-.5);f.rod('steel',[dx*.82,.025,side*d*.40],[dx,h,side*d*.50],.0037,iron,.0037,4);
    }
    for(let i=1;i<5;i++){
      const dz=d*(i/5-.5);f.rod('steel',[side*w*.407,.025,dz*.80],[side*w*.5,h,dz],.0037,iron,.0037,4);
    }
  }
}
function moped(f,work) {
  const r=.255,front=.625,rear=-.558,body=work?'#a0796d':'#82a8a0',light=work?'#c0967d':'#bed1bf';
  wheel(f,0,front,r,.083,12);wheel(f,0,rear,r,.092,12);
  mudguard(f,0,front,r,.132,body);mudguard(f,0,rear,r,.139,body);
  f.geo('paint',loft([[-.794,.093,.055,.477],[-.720,.178,.098,.514],[-.502,.201,.134,.531],
    [-.295,.182,.144,.516],[-.143,.138,.134,.470],[-.070,.103,.093,.416]],{axis:'z',cols:22,power:.78}),body);
  f.geo('dull',loft([[-.116,.136,.040,.310],[-.074,.162,.047,.299],[.220,.162,.041,.295],
    [.348,.127,.049,.314],[.384,.106,.048,.331]],{axis:'z',cols:20,power:.45}),'#414b47');
  f.geo('paint',loft([[.315,.139,.093,.301],[.418,.161,.091,.327],[.568,.166,.079,.348],
    [.731,.132,.079,.391],[.835,.083,.063,.438],[.870,.060,.052,.441]],{cols:22,power:.69}),light);
  for(const s of [-1,1]){
    f.rod('steel',[s*.056,r,front],[s*.056,.595,.522],.018,steel);
    f.rod('paint',[s*.060,.544,.54],[s*.060,.757,.463],.022,body);
    f.pipe('steel',[[s*.068,r,rear],[s*.136,.356,-.42],[s*.137,.475,-.222]],.022,iron);
    f.rod('steel',[s*.112,.287,-.545],[s*.144,.534,-.361],.015,steel);
    for(let j=0;j<4;j++)f.ring('dull',[s*.133,.360+j*.030,-.490+j*.022],.025,.005,rubber,[1.04,0,0]);
    f.rod('steel',[s*.094,.337,-.051],[s*.176,.292,-.034],.016,'#7f867d');
  }
  f.pipe('steel',[[-.110,.318,-.147],[-.191,.037,-.246],[-.218,.020,-.285]],.015,iron);
  f.geo('dull',loft([[-.744,.076,.029,.681],[-.663,.160,.048,.690],[-.440,.172,.057,.703],
    [-.287,.145,.053,.685],[-.186,.090,.036,.666]],{axis:'z',power:.72,cols:24}),'#514c45');
  f.geo('paint',loft([[.811,.058,.051,.446],[.860,.133,.104,.463],[.934,.153,.119,.476],
    [.974,.118,.101,.479]],{cols:20}),body);
  f.egg('lens',[0,.906,.575],[.095,.054,.026],'#e7ddbb');
  f.box('lens',[0,.550,-.798],[.169,.059,.035],'#a74e40',.012);
  f.box('dull',[0,.458,-.803],[.135,.086,.010],'#a7ab92',.006,[.19,0,0]);
  f.pipe('steel',[[-.28,.994,.391],[-.135,.992,.43],[0,.943,.448],[.135,.992,.43],[.28,.994,.391]],.015,steel,14);
  for(const s of [-1,1]){
    f.rod('dull',[s*.225,.994,.409],[s*.319,.994,.379],.023,rubber);
    f.pipe('steel',[[s*.166,.997,.426],[s*.192,1.135,.438],[s*.239,1.162,.451]],.007,steel,6);
    f.egg('paint',[s*.247,1.17,.454],[.052,.030,.017],rubber,[0,s*.33,s*.08]);
    f.egg('steel',[s*.247,1.17,.439],[.047,.025,.005],'#9dadab',[0,s*.33,s*.08]);
  }
  if(!work){
    basket(f.child([0,.632,.693]),.397,.222,.319);
  }else{
    for(const s of [-1,1]) f.rod('steel',[s*.137,.313,rear],[s*.163,.625,-.781],.011,steel);
    f.box('steel',[0,.642,-.757],[.40,.034,.39],iron,.008);
    f.box('paint',[0,.756,-.718],[.451,.207,.389],'#687e74',.027);
    f.box('dull',[0,.866,-.717],[.468,.038,.40],'#52685e',.012);
    f.box('steel',[0,.805,-.920],[.081,.052,.015],steel);
  }
}
function cycleStand(f) {
  for(const z of [-.193,.193])f.rod('steel',[-1.53,.046,z],[1.53,.046,z],.026,steel);
  for(let i=0;i<4;i++){
    const x=-1.25+i*.81;
    f.pipe('steel',[[x,.039,.20],[x,.395,.087],[x+.025,.445,.049],
      [x+.159,.445,.047],[x+.18,.40,.030],[x+.18,.04,-.183]],.016,'#909e96',13);
  }
}
function tricycle(f) {
  const r=.295,front=.926,rear=-.617,blue='#66858c';
  wheel(f,0,front,r,.056,14);mudguard(f,0,front,r,.097,blue);
  for(const side of [-1,1]){
    wheel(f,side*.455,rear,.28,.058,14);mudguard(f,side*.455,rear,.28,.099,blue);
    f.rod('paint',[side*.034,.295,front],[side*.035,.872,.707],.019,blue);
    f.rod('paint',[0,.345,.166],[side*.41,.286,rear],.025,blue);
    f.rod('paint',[side*.41,.286,rear],[side*.41,.495,-.093],.018,blue);
  }
  f.pipe('paint',[[0,.73,.722],[0,.430,.452],[0,.361,.15],[0,.661,.067]],.027,blue,12);
  f.rod('steel',[0,.58,.092],[0,.751,.049],.017,steel);
  f.egg('dull',[0,.776,.052],[.119,.050,.146],rubber);
  f.pipe('steel',[[-.278,.982,.637],[-.155,.986,.682],[0,.941,.705],[.15,.985,.682],[.278,.983,.637]],.016,steel);
  for(const s of [-1,1]) {
    f.rod('dull',[s*.20,.982,.662],[s*.291,.982,.632],.022,rubber);
    f.rod('steel',[0,.339,.189],[s*.132,.339+s*.085,.19],.012,steel);
    f.box('dull',[s*.154,.342+s*.085,.19],[.075,.027,.082],dark);
  }
  f.box('steel',[0,.486,-.540],[.86,.048,1.22],iron);
  for(let i=0;i<7;i++)f.box('wood',[(i-3)*.121,.527,-.54],[.110,.045,1.21],i%2?'#98795b':'#ac8a62');
  for(const s of [-1,1]){
    for(const h of [.606,.731])f.box('wood',[s*.419,h,-.54],[.037,.082,1.19],'#a08a65');
    for(const z of [-1.107,-.54,.029])f.box('paint',[s*.433,.655,z],[.038,.295,.034],blue);
    f.box('wood',[0,.654,-.54+s*.592],[.824,.208,.031],'#aa8c66');
  }
  crate(f.child([0,.552,-.78],.025),.61,.28,.45,'#577973',1);
  crate(f.child([.044,.835,-.78],-.065),.53,.232,.365,'#8d725e');
  f.egg('fabric',[-.052,.683,-.221],[.244,.135,.184],'#baa581');
}
function compressor(f) {
  for(const x of [-.24,.25])f.box('dull',[x,.059,.012],[.112,.119,.34],rubber,.009);
  f.egg('paint',[0,.239,0],[.377,.164,.170],'#9d6653');
  f.box('steel',[-.032,.405,0],[.386,.050,.221],steel);
  f.box('paint',[-.088,.521,0],[.235,.19,.176],iron,.017);
  for(let i=0;i<6;i++)f.box('steel',[-.183+i*.037,.531,.095],[.012,.149,.025],'#81867b');
  f.rod('steel',[.119,.409,0],[.169,.584,.011],.035,steel);
  f.rod('steel',[.166,.59,.018],[.166,.59,.068],.056,iron,.056,18);
  f.chart('dial','text',[.166,.59,.069],.092,.092);
  for(let j=0;j<4;j++)f.ring('dull',[.21,.37,.168+j*.014],.114,.009,rubber);
  f.pipe('dull',[[.27,.35,.19],[.33,.23,.19],[.301,.079,.209],[.221,.064,.215]],.009,rubber);
}
function wheelstand(f){
  f.box('steel',[0,.032,0],[.84,.064,.52],iron,.012);
  f.rod('paint',[0,.05,0],[0,1.09,0],.030,'#67877e');
  f.rod('steel',[0,1.06,0],[.25,1.06,0],.023,steel);
  const rim=f.child([.16,.45,0],.09);
  wheel(rim,0,0,.34,.047,16);
  f.box('wood',[-.204,.607,0],[.40,.043,.30],'#aa8c62');
  for(let i=0;i<3;i++)f.rod('steel',[-.35+i*.07,.641,-.05],[-.32+i*.07,.644,.083],.007,steel);
}

function gooseneck(f,x,y,z) {
  f.pipe('steel',[[x,y,z],[x,y+.069,z+.145],[x,y+.079,z+.245],[x,y+.017,z+.29]],.014,iron);
  f.geo('paint',loft([[-.059,.119,.119],[.012,.060,.060],[.039,.037,.037]],{cols:16}),'#66786b',[x,y,z+.29]);
  f.egg('lens',[x,y-.063,z+.29],[.072,.028,.072],'#ead7a0');
}
function leanAwning(f,w,front,y,overhang,color){
  const sheet=f.cached('awning'+w,()=>grid(24,4,(u,v)=>[(u-.5)*w,
    y-.224*v-.042*Math.sin(v*pi)-.014*Math.cos(u*12*pi)*v,front+v*overhang]));
  f.geo('fabric',sheet,color);
  for(let j=0;j<Math.round(w/.6);j++){
    const count=Math.round(w/.6),x=(j+.5-count/2)*w/count;
    const flap=f.cached('scallop'+w,()=>grid(8,1,(u,v)=>[(u-.5)*w/count,
      -v*(.118+.055*Math.sin(pi*u)),v*.018]));
    f.geo('fabric',flap,color,[x,y-.222,front+overhang]);
  }
  for(const side of [-1,1]){
    const x=side*(w/2-.125);
    f.rod('steel',[x,y-.63,front+.018],[x,y-.27,front+overhang-.069],.014,steel);
    f.rod('steel',[x,y-.049,front+.027],[x,y-.255,front+overhang],.018,steel);
  }
  f.rod('steel',[-w/2,y-.23,front+overhang],[w/2,y-.23,front+overhang],.016,steel);
}
function storefront(f,grocer){
  const w=grocer?7.14:4.15,depth=grocer?3.14:2.32,top=grocer?3.75:3.21,front=depth/2;
  const lintel=grocer?2.49:2.18, stone='#cdc2a8',paint=grocer?'#728a76':'#718687';
  f.box('wall',[0,.077,0],[w,.154,depth],stone);
  f.box('wall',[0,top*.5,-front+.076],[w,top,.154],stone);
  for(const side of [-1,1])f.box('wall',[side*(w/2-.073),top*.5,0],[.146,top,depth],stone);
  f.box('wall',[0,(top+lintel)/2,front-.13],[w,top-lintel,.27],stone);
  f.box('wood',[0,lintel-.12,front-.049],[w-.11,.223,.18],'#6e604b');
  f.box('paint',[0,top+.018,0],[w+.21,.092,depth+.315],'#898b7e');
  for(let i=0;i<Math.round(w/.34);i++){
    const n=Math.round(w/.34);f.box('steel',[(i+.5-n/2)*w/n,top+.071,0],[.022,.021,depth+.27],'#989b8b');
  }
  const opening=grocer?w*.635:w*.625,center=-(w/2-.12)+opening/2;
  // Recessed, cropped shop interior plus individual objects in front of it.
  const panelW=opening-.055;
  f.box('wood',[center,lintel*.52,front-.79],[opening,lintel-.065,.112],'#645e4e');
  f.chart(grocer?'jars':'tools','stock',[center,lintel*.52,front-.731],panelW,lintel-.087);
  for(const x of [center-opening/2,center+opening/2]) {
    f.box('paint',[x,lintel*.51,front-.049],[.087,lintel,.15],paint);
    f.box('wood',[x,lintel*.50,front-.41],[.084,lintel-.17,.58],'#9a8968');
  }
  f.box('wood',[center,.705,front-.129],[opening-.021,.102,.611],'#b39871');
  f.box('paint',[center,.377,front+.007],[opening-.093,.564,.12],paint);
  for(let k=0;k<3;k++)f.box('paint',[center+(k-1)*opening*.309,.38,front+.076],[opening*.281,.430,.027],grocer?'#9aa38c':'#859b91');
  const shutW=w-opening-.20,shutX=w/2-.11-shutW/2;
  f.box('dull',[shutX,lintel*.51,front-.119],[shutW+.029,lintel-.06,.14],dark);
  for(let h=.205,j=0;h<lintel+.015;h+=.087,j++)
    f.box('paint',[shutX,h,front-.024],[shutW,.085,.073],j%3===0?'#969d8e':'#a5ab9e',0,[.10,0,0]);
  f.box('steel',[shutX,.837,front+.023],[.232,.026,.032],steel);
  f.sign(grocer?'grain':'repair',[0,lintel+(top-lintel)*.53,front+.034],grocer?4.37:2.87,grocer?.70:.55);
  leanAwning(f,w-.14,front+.012,lintel+.11,grocer?1.18:.91,grocer?'#859581':'#718e8d');
  for(const side of [-1,1])gooseneck(f,side*w*.335,top-.145,front+.015);
  const flank=f.child([w/2-.11,0,front+.42],half);
  f.rod('steel',[w/2-.24,top-.23,front],[w/2-.24,top-.23,front+.76],.021,iron);
  flank.box('paint',[0,top-.57,.058],[.74,.53,.073],paint,.016);
  flank.chart(grocer?'grain':'blade','text',[0,top-.57,.10],.72,.50);
  flank.chart(grocer?'grain':'blade','text',[0,top-.57,.017],.72,.50,[0,pi,0]);
  const gutterX=-w/2+.068;
  f.pipe('steel',[[gutterX,top+.04,front],[gutterX,top-.11,front+.092],[gutterX,.29,front+.092],
    [gutterX,.119,front+.243]],.047,'#9c9c8c',12,8);
  for(const h of [.46,1.38,2.25])f.box('steel',[gutterX,h,front+.075],[.133,.034,.089],iron);
  if(grocer){
    for(let j=0;j<5;j++){
      const x=center-.90+j*.422;
      f.geo('paint',loft([[0,.064,.064],[.04,.082,.083],[.22,.078,.08],[.252,.061,.061],[.28,.032,.032]],
        {cols:12}),'#b79b62',[x,.757,front+.064]);
      f.rod('paint',[x,1.03,front+.064],[x,1.053,front+.064],.034,'#825f40');
    }
  }else{
    f.ring('dull',[center+.666,1.64,front-.445],.292,.024,rubber);
    f.box('paint',[center-.63,.838,front+.054],[.246,.145,.152],'#647e77',.012);
    f.rod('steel',[center-.78,.864,front+.054],[center-.914,.864,front+.054],.014,steel);
  }
}
function weighingScale(f){
  f.box('paint',[0,.044,0],[.29,.088,.27],'#7e9587',.022);
  f.geo('paint',loft([[.069,.116,.117],[.18,.103,.079],[.27,.071,.071]],{cols:14,power:.54}),'#96ac9a');
  f.rod('steel',[0,.203,.031],[0,.203,.107],.111,'#7a8176',.111,20);
  f.chart('dial','text',[0,.203,.109],.209,.209);
  f.rod('steel',[0,.252,0],[0,.343,0],.025,steel);
  f.geo('steel',loft([[.325,.11,.090],[.349,.162,.137],[.372,.180,.155]],{cols:17,power:.53}),'#b9b9a3');
}
function riceSack(f,tint,open){
  f.geo('fabric',loft([[0,.168,.141],[.065,.214,.170],[.188,.239,.186],[.315,.218,.172],
    [.377,.192,.154],[.403,open?.195:.091,open?.153:.085]],
    {cols:18,power:.80,sculpt:([x,y,z],a,t)=>[x+.008*Math.sin(5*a+t*8),y+.009*t*Math.sin(a*5),z]}),tint);
  if(open) {
    f.egg('dull',[0,.399,0],[.185,.044,.145],'#d6c594');
    f.egg('steel',[.073,.432,.044],[.059,.023,.077],steel);
    f.rod('wood',[.059,.442,.031],[.026,.524,-.078],.012,'#937459');
  }else f.rod('wood',[-.077,.403,0],[.093,.407,-.018],.009,'#896d4a');
}
function grainStand(f){
  pallet(f,1.62,.92);
  riceSack(f.child([-.44,.118,.15],.37),'#bda980',true);
  riceSack(f.child([.15,.118,-.18],-.4),'#ba9c72',false);
  riceSack(f.child([.42,.118,.18],.14),'#cfbc93',true);
  f.box('wood',[-.47,.58,-.26],[.54,.039,.34],'#ae8e66');
  for(const x of [-.685,-.261]) for(const z of [-.386,-.128])
    f.box('wood',[x,.347,z],[.044,.44,.045],'#907557');
  weighingScale(f.child([-.47,.600,-.26]));
}
function gasMeters(f){
  for(const s of [-1,1]){
    f.pipe('steel',[[s*1.69,.11,-.031],[s*1.69,.71,.012],[s*1.55,.79,.019],[s*.75,.79,.019],
      [s*.68,.854,.019],[s*.68,1.012,.019]],.031,'#93a19a',16);
    f.box('paint',[s*.68,1.221,.018],[.43,.39,.204],'#9eada0',.022);
    f.box('dull',[s*.68,1.26,.131],[.22,.079,.029],dark,.006);
    for(let j=0;j<6;j++)f.box('dull',[s*.68+(j-2.5)*.028,1.258,.148],[.014,.043,.005],'#ddd7b9');
    f.pipe('steel',[[s*.68,1.42,0],[s*.68,1.67,-.056],[s*.84,1.74,-.075],[s*1.67,1.74,-.075]],
      .026,'#a3a69a',10);
    for(const x of [s*1.39,s*.941])f.box('steel',[x,.788,.048],[.030,.113,.055],iron);
  }
  f.box('paint',[0,1.61,-.028],[.51,.66,.232],'#6e867d',.018);
  f.chart('bolt','text',[0,1.64,.092],.159,.218);
  for(let i=0;i<5;i++)f.box('paint',[0,1.377+i*.019,.092],[.255,.008,.013],iron);
}
function dolly(f){
  for(const x of [-.268,.268]){
    f.rod('dull',[x-.030,.101,.069],[x+.030,.101,.069],.099,rubber,.099,14);
    f.pipe('paint',[[x,.083,-.033],[x,1.118,-.167],[x*.87,1.235,-.166],[x*.38,1.242,-.152]],.021,'#64887e',9);
  }
  for(const h of [.39,.75,1.05])f.rod('steel',[-.263,h,-h*.14],[.263,h,-h*.14],.016,steel);
  f.box('steel',[0,.106,.077],[.587,.039,.297],steel);
  crate(f.child([0,.128,.035]),.56,.255,.36,'#7a8670');
}
function marketDrain(f){
  for(const [x,r] of [[-.67,.052],[-.49,.026]]){
    f.pipe('steel',[[x,3.84,-.03],[x,3.22,.07],[x+.076,3.10,.123],[x+.076,.31,.123],
      [x+.16,.155,.181],[x+.16,.098,.264]],r,'#999f93',16);
    for(const y of [.47,1.41,2.52])f.box('steel',[x+.072,y,.124],[r*3.1,.033,r*1.99],iron);
  }
  f.box('paint',[.28,2.69,.142],[.89,.55,.29],'#b0b1a0',.021);
  for(let i=0;i<7;i++)f.box('steel',[.30,2.502+i*.056,.299],[.725,.019,.027],'#778379');
  for(const x of [-.015,.57])f.rod('steel',[x,2.37,.242],[x,2.16,.018],.019,iron);
}

function plate(f,x,y,z,r,color) {
  f.geo('paint',loft([[0,r*.76,r*.76],[.012,r*.83,r*.83],[.036,r,r],[.041,r*.98,r*.98]],
    {cols:18}),color,[x,y,z]);
}
function takeaway(f,x,y,z,tint) {
  f.box('dull',[x,y+.044,z],[.208,.088,.145],tint,.024);
  f.box('paint',[x,y+.094,z],[.222,.023,.157],'#e7dbbf',.012);
  f.box('dull',[x-.036,y+.108,z],[.030,.004,.143],'#b25a3b');
}
function packingTable(f) {
  tubularFrame(f,.87,1.35,.55);
  f.box('steel',[0,.895,0],[1.51,.077,.72],'#b2b8ae',.012);
  f.box('steel',[0,.28,.01],[1.34,.034,.55],'#859189');
  crate(f.child([.22,.30,0]),.54,.30,.37,'#628172');
  for(let i=0;i<4;i++)takeaway(f,.52,.934+i*.041,-.12,'#c0b08b');
  f.box('dull',[-.52,1.006,.07],[.31,.14,.22],'#676d62',.018);
  f.box('paint',[-.52,1.084,.04],[.226,.012,.115],'#e2d7b6');
  f.chart('pack','text',[.36,.74,.326],.60,.23);
  f.rod('steel',[.66,.932,.249],[.66,1.37,.249],.013,steel);
  f.sign('pickup',[.55,1.263,.247],.34,.22);
}
function roastRail(f) {
  for(const s of [-1,1])f.rod('steel',[s*.95,2.32,-.12],[s*.95,2.32,.36],.022,steel);
  f.rod('steel',[-.95,2.31,.34],[.95,2.31,.34],.020,steel);
  f.box('steel',[0,1.14,.25],[1.76,.043,.44],steel,.012);
  for(const [i,x] of [-.64,-.21,.25,.65].entries()) {
    const y=1.81+(i%2)*.08, color=['#a84b29','#914926','#b35e32','#9e522b'][i];
    f.pipe('steel',[[x-.018,2.34,.34],[x+.025,2.34,.35],[x+.032,2.27,.35],
      [x,2.25,.35],[x,2.10,.35],[x-.033,2.08,.35]],.007,steel);
    f.egg('paint',[x,y,.35],[.13,.228,.085],color,[0,.14*i,.115*(i%2?1:-1)]);
    f.egg('paint',[x+.042,y+.18,.33],[.047,.13,.041],color,[0,0,-.22]);
    for(const side of [-1,1]) f.egg('paint',[x+side*.086,y-.13,.36],[.055,.12,.052],color,[.16,0,-side*.32]);
  }
}
function extractor(f) {
  f.box('steel',[0,2.43,.12],[1.22,.25,.41],'#929b8e',.028);
  for(let i=0;i<8;i++)f.box('dull',[(i-3.5)*.126,2.385,.335],[.082,.081,.012],'#555e55');
  f.pipe('steel',[[.39,2.53,.13],[.39,2.86,.13],[.42,2.97,.075],[.72,3.02,-.02]],
    .105,'#acada1',12,12);
}
function mealTable(f,variant) {
  tubularFrame(f,.721,.90,.61);
  f.box('steel',[0,.735,0],[1.09,.048,.81],steel,.018);
  f.box('paint',[0,.759,0],[1.065,.028,.786],variant?'#a08b60':'#a35e49',.015);
  for(const side of [-1,1]) {
    const x=side*.244,z=side*.069;
    plate(f,x,.777,z,.137,'#e1dcc5');
    f.geo('paint',loft([[0,.061,.061],[.013,.071,.071],[.071,.112,.112],[.078,.107,.107]],{cols:20}),
      '#d3dfcf',[x,.799,z]);
    for(let i=0;i<2;i++) f.rod('wood',[x-.11+i*.014,.886,z-.072],[x+.114+i*.014,.878,z+.045],.004,'#946e43');
  }
  f.box('wood',[.038,.839,-.233],[.17,.12,.097],'#967b55',.01);
  for(const [i,x] of [-.081,.098].entries()) {
    f.rod('paint',[x,.778,.269],[x,.893,.269],.033,i?'#9d593d':'#b39b62');
    f.rod('paint',[x,.893,.269],[x,.917,.269],.026,'#e1d6b5');
  }
}
function stool(f,variant) {
  const tint=variant?'#548480':'#ae5d49';
  for(const x of [-1,1])for(const z of [-1,1])
    f.rod('paint',[x*.162,.016,z*.171],[x*.124,.38,z*.124],.022,tint,.029);
  for(const side of [-1,1])
    f.rod('paint',[side*.15,.16,-.15],[side*.15,.16,.15],.016,tint);
  f.box('paint',[0,.406,0],[.375,.064,.389],tint,.027);
  f.box('dull',[0,.440,0],[.083,.004,.018],'#584e40',.003);
}
function vegetableCart(f) {
  f.box('paint',[0,.63,0],[2.06,.108,.89],'#60877b',.023);
  for(const side of [-1,1]){
    f.rod('paint',[side*.89,.17,-.33],[side*.89,2.24,-.33],.025,'#697e6c');
    f.rod('steel',[side*.89,.12,.33],[side*.89,.60,.33],.025,iron);
    f.rod('steel',[side*.89,2.26,-.36],[side*.89,2.16,.51],.018,steel);
    f.rod('dull',[side*.85-.043,.15,0],[side*.85+.043,.15,0],.148,rubber,.148,16);
  }
  f.geo('fabric',grid(20,4,(u,v)=>[(u-.5)*2.16,2.46-v*.16-.036*Math.sin(pi*v),-.45+v*.96]),'#a0aa73');
  f.box('fabric',[0,2.231,.50],[2.16,.15,.021],'#798e68');
  for(const [i,x] of [-.66,0,.66].entries())
    crate(f.child([x,.695,0]),.61,.26,.65,['#7d9064','#6d8a72','#9f805c'][i],i===1?2:1);
  f.sign('crate',[0,.558,.45],.53,.18);
}

const streetFixtures = {
  shelter, post, screen:restScreen, bench:stationBench, locker:batteryLocker, water:waterCooler,
  moped, stand:cycleStand, repair:f=>storefront(f,false), grocer:f=>storefront(f,true),
  wheelstand, compressor, tricycle, crates:returnCrates, meters:gasMeters, dolly, grain:grainStand,
  packing:packingTable, roasts:roastRail, extractor, table:mealTable, stool, vegetables:vegetableCart, drain:marketDrain,
};

function steamerVapour(art,parent,course,counter) {
  const positions=[],corners=[],seeds=[],indices=[];
  const bay=course.landmarks.market.d / Math.min(5,Math.round(course.landmarks.market.d/6.8));
  for(let plume=0;plume<2;plume++)for(let i=0;i<8;i++){
    const k=positions.length/3;
    for(const [u,v] of [[-1,-1],[1,-1],[1,1],[-1,1]]) {
      positions.push(0,0,plume*bay);corners.push(u,v);seeds.push((i+plume*.47)/8);
    }
    indices.push(k,k+1,k+2,k,k+2,k+3);
  }
  const geometry=art.keepGeometry(new THREE.BufferGeometry());
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('corner',new THREE.Float32BufferAttribute(corners,2));
  geometry.setAttribute('seed',new THREE.Float32BufferAttribute(seeds,1));geometry.setIndex(indices);
  geometry.computeBoundingSphere();geometry.boundingSphere.radius+=1.7;
  const time={value:0};
  const material=art.keepMaterial(new THREE.ShaderMaterial({
    uniforms:{time},transparent:true,depthWrite:false,
    vertexShader:`
      uniform float time;
      attribute vec2 corner; attribute float seed; varying vec2 puff; varying float fade;
      void main() {
        float t=fract(time*.43+seed);
        vec3 lift=vec3(-.23*t*t+.078*sin(6.28*t+seed*14.),1.12*t,.076*sin(4.9*t+seed*19.));
        vec4 eye=modelViewMatrix*vec4(position+lift,1.);
        eye.xy+=corner*mix(.063,.255,t)*vec2(.91,1.21);
        puff=corner; fade=smoothstep(0.,.16,t)*(1.-smoothstep(.25,1.,t));
        gl_Position=projectionMatrix*eye;
      }`,
    fragmentShader:`
      varying vec2 puff; varying float fade;
      void main() {
        float a=(1.-smoothstep(.13,1.,dot(puff,puff)))*fade*.21;
        gl_FragColor=vec4(.88,.90,.86,a);
        #include <colorspace_fragment>
      }`,
  }));
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name='红棚蒸笼热气';mesh.position.set(counter.x-.49,1.73,counter.z+.29);
  parent.add(mesh);
  return frame=>{
    const p=frame.actor??frame.bike;
    mesh.visible=!p.indoors && Math.hypot(p.x-mesh.position.x,p.z-mesh.position.z)<52;
    if(mesh.visible)time.value=frame.elapsed??0;
  };
}

export function buildMarketLife(kit,course) {
  const sites=marketSites(course), {m,ready}=palette(kit), builder=solidBuilder(kit.art), cache=new Map();
  const groups=[];
  for(const site of sites) {
    const root=new THREE.Group(); root.name=site.id;root.userData.blockId=site.id;
    root.position.set(site.x,-.015,site.z);root.rotation.y=site.yaw;
    kit.root.add(root);
    streetFixtures[site.kind](new Workbench(builder,root,m,cache),site.variation);
    groups.push(root);
  }
  builder.finish();
  for(const root of groups) for(const mesh of root.children) {
    mesh.castShadow=true;mesh.receiveShadow=true;mesh.geometry.computeBoundingSphere();
  }
  for(const geo of cache.values())geo.dispose();
  const counter=sites.find(s=>s.kind==='roasts');
  return {ready,update:counter && steamerVapour(kit.art,kit.root,course,counter)};
}
