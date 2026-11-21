import * as THREE from 'three';
import { grid, solidBuilder } from './courier-geometry.js';
import printURL from './assets/courtyard-life/courtyard-print.webp?url&inline';
import slatURL from './assets/courtyard-life/slat-color.webp?url&inline';
import slatNormalURL from './assets/courtyard-life/slat-normal.webp?url&inline';
import slatRoughnessURL from './assets/courtyard-life/slat-roughness.webp?url&inline';
import ballURL from './assets/courtyard-life/court-ball.webp?url&inline';
import ballReliefURL from './assets/courtyard-life/court-ball-relief.webp?url&inline';

const tau=Math.PI*2;
const identity=new THREE.Quaternion();
const atOrigin=[0,0,0], unit=[1,1,1];

// Compose rigid subassemblies into the same local mesh per material and lot.
// Bike wheels, newspaper leaves, drawers and drink caps all stay in metre space.
class Fixture {
  constructor(builder,root,materials,position=new THREE.Vector3(),rotation=identity) {
    this.b=builder;this.root=root;this.m=materials;this.position=position;this.rotation=rotation;
  }
  point(p) {return new THREE.Vector3(...p).applyQuaternion(this.rotation).add(this.position).toArray();}
  orient(e) {
    if(!e)return this.rotation;
    return this.rotation.clone().multiply(e.isQuaternion?e:new THREE.Quaternion().setFromEuler(new THREE.Euler(...e)));
  }
  child(p,e) {return new Fixture(this.b,this.root,this.m,new THREE.Vector3(...this.point(p)),this.orient(e));}
  put(geometry,surface,tint,at=atOrigin,size=unit,rot) {
    this.b.put(this.root,this.m[surface],geometry,tint,this.point(at),size,this.orient(rot));
  }
  box(surface,tint,at,size,r=0,rot) {
    this.b.box(this.root,this.m[surface],tint,this.point(at),size,r,this.orient(rot));
  }
  egg(surface,tint,at,radii,rot) {
    this.b.egg(this.root,this.m[surface],tint,this.point(at),radii,this.orient(rot));
  }
  rod(surface,tint,a,b,r,r2=r,sides=9) {
    this.b.rod(this.root,this.m[surface],tint,this.point(a),this.point(b),r,r2,sides);
  }
  pipe(surface,tint,points,r,steps=points.length*2,sides=7,closed=false) {
    this.b.tube(this.root,this.m[surface],tint,points.map(p=>this.point(p)),r,steps,sides,closed);
  }
  turned(surface,tint,at,profile,segments=18,rot) {
    const g=new THREE.LatheGeometry(profile.map(([x,y])=>new THREE.Vector2(x,y)),segments);
    this.put(g,surface,tint,at,unit,rot);
  }
  ring(surface,tint,at,major,wire,rot,segments=32) {
    this.put(new THREE.TorusGeometry(major,wire,6,segments),surface,tint,at,unit,rot);
  }
}

function imageMap(art,url,space,repeat=false) {
  const img=new Image(),stub=document.createElement('canvas');stub.width=stub.height=2;
  const texture=art.texture(stub,repeat);texture.colorSpace=space;
  let cancelled=false;
  const cancel=()=>{cancelled=true;};
  texture.addEventListener('dispose',cancel);img.src=url;
  texture.userData.ready=img.decode().then(()=>{
    if(cancelled)return;
    texture.removeEventListener('dispose',cancel);texture.dispose();
    texture.source=new THREE.TextureSource(img);texture.needsUpdate=true;
  });
  return texture;
}

// Atlas tiles have padded edges, including on the tightly curved bottle labels.
const tileUv=(tile,u,v)=>[(tile%4+.012+u*.976)/4,1-(Math.floor(tile/4)+.012+(1-v)*.976)/4];
function patch(f,tile,at,w,h,rotation,region=[0,0,1,1]) {
  const g=grid(1,1,(u,v)=>[(u-.5)*w,(v-.5)*h,0],{uv:(u,v)=>tileUv(tile,region[0]+u*region[2],region[1]+v*region[3])});
  f.put(g,'print','#ffffff',at,unit,rotation);
}
function quadLoop(f,surface,tint,cx,y,cz,w,d,r) {
  const x=w/2,z=d/2,b=Math.min(.037,w*.09,d*.09);
  const corners=[[-x+b,-z],[x-b,-z],[x,-z+b],[x,z-b],[x-b,z],[-x+b,z],[-x,z-b],[-x,-z+b]];
  for(let i=0;i<8;i++){
    const a=corners[i],c=corners[(i+1)%8];
    f.rod(surface,tint,[cx+a[0],y,cz+a[1]],[cx+c[0],y,cz+c[1]],r,r,6);
  }
}

function bench(f,width,sport=false) {
  const iron=sport?'#416d65':'#495c50',wood=sport?'#c0a581':'#dec8a0';
  for(const x of [-width*.37,width*.37]){
    f.box('alloy','#74796e',[x,.026,.005],[.15,.05,.61],.017);
    for(const z of [-.23,.23]) {
      f.rod('metal',iron,[x,.050,z],[x,.418,z*.69],.036,.032,9);
      f.rod('alloy','#aaa69a',[x+.049,.048,z],[x+.049,.061,z],.014,.014,6);
    }
    f.pipe('metal',iron,[[x,.42,.28],[x,.395,.20],[x,.395,-.18],[x,.45,-.277],[x,.78,-.34],[x,.90,-.37]],.033,14);
    if(!sport)f.pipe('metal',iron,[[x,.425,.20],[x,.62,.205],[x,.684,.14],[x,.685,-.164],[x,.62,-.263],[x,.51,-.262]],.022,16);
  }
  f.rod('metal',iron,[-width*.38,.236,-.15],[width*.38,.236,-.15],.025);
  for(let i=0;i<5;i++){
    const z=(i-2)*.105, y=.466+.024*(i===0);
    f.box('wood',i%2?wood:'#cdb78e',[0,y,z],[width,.047,.095],.011);
    for(const x of [-width*.37,width*.37])f.rod('alloy','#88877c',[x,y+.024,z],[x,y+.027,z],.008,.008,8);
  }
  for(let j=0;j<3;j++){
    const y=.568+j*.137,z=-.277-j*.035;
    f.box('wood',wood,[0,y,z],[width,.111,.043],.010,[-.21,0,0]);
    for(const x of [-width*.37,width*.37])f.egg('alloy','#989386',[x,y,z+.024],[.009,.009,.005]);
  }
}

function thermos(f,at,tint) {
  const t=f.child(at);
  t.turned('metal',tint,atOrigin,[[0,0],[.062,0],[.074,.019],[.074,.232],[.071,.253],[.050,.269],[.045,.293]]);
  t.turned('alloy','#9b9f94',[0,.285,0],[[.045,0],[.048,.009],[.048,.039],[.036,.045],[0,.045]]);
  t.pipe('metal',tint,[[.067,.115,0],[.11,.112,0],[.135,.137,0],[.132,.215,0],[.108,.226,0],[.068,.223,0]],.010);
  for(const y of [.044,.062,.193])t.ring('alloy','#aba695',[0,y,0],.074,.0023,[Math.PI/2,0,0],22);
}

function newspaper(f,at,folded=false) {
  const n=f.child(at,folded?[-.06,-.14,-.025]:[-.06,.02,0]);
  const w=folded?.31:.65,h=folded?.24:.43;
  const point=(u,v)=>[(u-.5)*w,.016*Math.sin(v*3.6)+.037*Math.abs(u-.5)+.034*Math.exp(-Math.abs(u-.5)*18),
    (.5-v)*h];
  for(let i=0;i<3;i++) {
    const g=grid(12,5,(u,v)=>{const p=point(u,v);p[0]+=.002*i;p[1]+=.0025*i;p[2]+=.002*i;return p;},
      {uv:(u,v)=>tileUv(0,folded?u*.50:u,v)});
    n.put(g,i===2?'print':'paper',i===2?'#ffffff':'#d3cbb2');
  }
}

function readingBench(f) {
  const seat=f.child([-.05,0,.015]);bench(seat,2.77);
  newspaper(seat,[-.75,.510,-.008],true);
  thermos(seat,[.92,.493,-.04],'#956448');
  // The glasses are separate slender rims resting on the folded paper.
  const glasses=seat.child([-.70,.552,-.03],[Math.PI/2,.05,.18]);
  for(const x of [-.029,.029])glasses.ring('metal','#4a4038',[x,0,0],.022,.0019,null,16);
  glasses.rod('metal','#4a4038',[-.011,.006,0],[.011,.006,0],.0018);
  for(const x of [-.05,.05])glasses.rod('metal','#4a4038',[x,0,0],[x,.075,.009],.0015);
}

function readingStand(f) {
  const green='#48695b',brass='#9d8c6b';
  for(const x of [-.52,.52]){
    f.box('stone','#c6c1ac',[x,.053,-.065],[.26,.106,.51],.022);
    f.rod('metal',green,[x,.095,-.082],[x,1.52,-.082],.028,.029,10);
    f.rod('metal',green,[x,.68,-.082],[x,.855,.22],.018);
  }
  const desk=f.child([0,.92,.048],[.22,0,0]);
  desk.box('wood','#e2ceab',atOrigin,[1.26,.055,.61],.017);
  desk.box('alloy',brass,[0,.03,.292],[1.27,.037,.025],.006);
  newspaper(desk,[.10,.032,.0]);
  for(const x of [-.21,.415])desk.rod('alloy','#afad93',[x,.087,-.17],[x,.083,.20],.0035);
  f.box('metal',green,[0,1.376,-.103],[1.27,.21,.044],.015);
  patch(f,1,[0,1.379,-.075],1.16,.157);
  f.box('metal',green,[0,1.568,-.026],[1.38,.045,.46],.014,[.09,0,0]);
  f.rod('alloy',brass,[-.69,1.532,.203],[.69,1.532,.203],.012);
  for(const x of [-.38,.38])f.rod('metal',green,[x,.20,.08],[x,.59,.18],.017);
  for(let i=0;i<4;i++)f.rod('metal',green,[-.42,.25+i*.09,.10+i*.022],[.42,.25+i*.09,.10+i*.022],.009);
  for(let j=0;j<3;j++){
    const rot=[.22,0,(j-1)*.065];
    f.turned('paper','#c7b99a',[(j-1)*.156,.227,.085],[[.035,0],[.039,.39],[.034,.394],[.027,.388],[.027,.34]],13,rot);
  }
}

function mudguard(f,x,y,r,paint) {
  const sheet=grid(27,4,(u,v)=>{
    const a=.08*Math.PI+u*.91*Math.PI, cross=(v-.5)*.090,rad=r+.014-.018*(2*v-1)**2;
    return [x+Math.cos(a)*rad,y+Math.sin(a)*rad,cross];
  });
  f.put(sheet,'metal',paint);
  for(const side of [-1,1])f.rod('alloy','#aaa899',[x,y,side*.041],
    [x-r*.80,y+r*.58,side*.040],.0035,.0035,5);
}

function wheel(f,x,r,tint) {
  const axle=f.child([x,r,0]);
  axle.ring('rubber','#343936',atOrigin,r-.023,.023,null,40);
  axle.ring('alloy','#bec0ad',atOrigin,r-.048,.010,null,38);
  for(const side of [-1,1]) {
    axle.ring('rubber',tint,[0,0,side*.014],r-.033,.004,null,38);
    axle.rod('alloy','#a3aaa1',[0,0,0],[0,0,side*.061],.025,.019,12);
    for(let i=0;i<12;i++){
      const a=(i+(side>0?.5:0))*tau/12;
      const end=[Math.cos(a)*(r-.051),Math.sin(a)*(r-.051),side*.003];
      axle.rod('alloy','#c0c1b7',[Math.cos(a+.85)*.024,Math.sin(a+.85)*.024,side*.040],end,.0026,.0020,5);
    }
  }
  axle.box('metal','#ce9e54',[r*.56,r*.42,.008],[.064,.022,.010],.005,[0,0,.65]);
}

function basket(f,x,y,w,d,h,wicker=false) {
  const rail=wicker?'#946b45':'#526762',light=wicker?'#b28b60':'#7c8880';
  for(let i=0;i<=(wicker?6:3);i++) {
    const v=i/(wicker?6:3);
    quadLoop(f,wicker?'wood':'metal',i%2?light:rail,x,y+h*v,0,w*(.76+.24*v),d*(.74+.26*v),i===0||v===1?.011:.0055);
  }
  for(const side of [-1,1]) {
    for(let j=0;j<7;j++){
      const t=j/6-.5;
      f.rod('metal',rail,[x+w*.75*t,y,side*d*.365],[x+w*t,y+h,side*d*.495],.005,.005,5);
    }
    for(let j=0;j<5;j++){
      const t=j/4-.5;
      f.rod('metal',rail,[x+side*w*.37,y,d*.74*t],[x+side*w*.49,y+h,d*t],.005,.005,5);
    }
  }
  for(let i=-2;i<=2;i++)f.rod('metal',rail,[x+i*w*.13,y,-d*.35],[x+i*w*.13,y,d*.35],.006,.006,5);
}

function bike(f,{electric=false,childSeat=false,wicker=false,color='#577f77'}={}) {
  const r=electric?.280:.333, rear=electric?-.55:-.572,front=electric?.526:.573;
  const metal='#aab3a6',dark='#353c39',cream='#d6c9a7',crank=[-.055,.294,0];
  wheel(f,rear,r,electric?'#63685e':'#b4a88c');wheel(f,front,r,cream);
  mudguard(f,rear,r,r,electric?color:cream);mudguard(f,front,r,r,color);
  f.pipe('metal',color,[[rear,r,0],[-.29,.302,0],crank,[.09,.357,0],
    [.30,.570,0],[.401,.770,0]],electric?.044:.030,17,10);
  f.pipe('metal',color,[[.38,.744,0],[.26,.532,0],[.10,.445,0],[-.087,.442,0],[-.208,.515,0]],electric?.032:.018,15,9);
  f.rod('metal',color,crank,[-.235,.756,0],.030,.024);
  f.rod('alloy',metal,[-.227,.72,0],[-.261,.827,0],.018,.018);
  for(const side of [-1,1]){
    f.rod('metal',color,[rear,r,side*.051],[-.216,.708,side*.025],.012,.010);
    f.rod('metal',color,[rear,r,side*.054],[-.051,.29,side*.052],.015,.012);
    f.pipe('metal',color,[[.397,.703,side*.025],[.455,.598,side*.063],[front-.034,r+.073,side*.065],[front,r,side*.057]],.015,9);
  }
  // Raised return grips, bell, working brake cables and separate levers.
  f.rod('alloy',metal,[.393,.74,0],[.382,.968,0],.023,.017);
  f.pipe('alloy',metal,[[.274,1.00,-.267],[.38,.992,-.203],[.433,.958,-.102],[.39,.953,0],
    [.433,.958,.102],[.38,.992,.203],[.274,1.00,.267]],.013,19);
  for(const side of [-1,1]){
    f.rod('rubber',dark,[.343,.993,side*.223],[.254,1.002,side*.275],.019,.021);
    f.rod('alloy','#b8b9a8',[.365,.978,side*.214],[.298,.968,side*.273],.006);
    f.pipe('rubber','#444a42',[[.368,.97,side*.206],[.465,.889,side*.142],[.492,.823,side*.113],[.420,.710,side*.060],[.477,.545,side*.044]],.0036,12,5);
  }
  f.egg('alloy',metal,[.36,1.017,.181],[.032,.024,.032]);
  const saddle=grid(15,6,(u,v)=>{
    const x=(u-.52)*.27,z=(v-.5)*(.20-.14*u+.040*Math.sin(Math.PI*u));
    return [x,.032*(1-(2*v-1)**2)+.017*Math.cos(u*4),z];
  });
  f.put(saddle,'rubber','#514b41',[-.285,.837,0]);f.egg('rubber','#49473e',[-.280,.832,0],[.140,.033,.085]);
  f.ring('alloy',metal,[crank[0],crank[1],.064],.081,.009,null,26);
  for(const side of [-1,1]){
    const x=crank[0]+side*.097,y=crank[1]+side*.103;
    f.rod('alloy','#939b8f',[crank[0],crank[1],side*.069],[x,y,side*.078],.012,.011);
    f.box('rubber',dark,[x,y,side*.116],[.065,.029,.079],.006);
    f.box('metal','#c19d58',[x+.034,y,side*.116],[.004,.010,.056]);
  }
  f.pipe('metal',electric?color:'#78877c',[[rear-.018,r+.049,.072],[-.34,.377,.077],[-.041,.379,.077],[.021,.331,.077]],.026,10);
  for(const side of [-1,1]){
    f.rod('alloy',metal,[rear,r,side*.061],[rear-.10,r*2+.105,side*.092],.009);
    f.rod('alloy',metal,[-.26,.709,side*.030],[rear-.27,r*2+.11,side*.095],.008);
  }
  quadLoop(f,'alloy',metal,rear-.061,r*2+.096,0,.46,.205,.011);
  if(electric) {
    f.box('metal','#546763',[-.56,r*2+.064,0],[.40,.085,.165],.019);
    f.box('rubber',dark,[-.752,r*2+.063,0],[.034,.065,.140],.012);
    f.egg('metal',color,[.063,.403,0],[.180,.074,.067],[0,0,.57]);
    f.box('rubber','#515e57',[.377,.988,.015],[.072,.034,.064],.009,[0,0,.14]);
  }
  if(childSeat){
    f.box('metal','#677e75',[rear-.075,r*2+.18,0],[.267,.080,.247],.023);
    f.box('rubber','#b49e77',[rear-.206,r*2+.313,0],[.052,.247,.241],.021,[0,0,.14]);
    for(const side of [-1,1])f.pipe('metal','#68776a',[[rear+.06,.71,side*.12],[rear+.075,.58,side*.148],[rear+.148,.53,side*.147]],.016,8);
  }
  const basketX=front-.024,basketY=r*2+.055;
  basket(f,basketX,basketY,.34,.305,.208,wicker);
  for(const side of [-1,1])f.rod('alloy',metal,[front,r+.02,side*.057],[basketX+.09,basketY,side*.118],.007);
  f.egg('alloy',metal,[front+.149,basketY-.016,0],[.048,.044,.048]);
  f.egg('glass','#e9dba9',[front+.185,basketY-.012,0],[.022,.033,.035]);
  f.egg('metal','#963e34',[rear-.284,r*2+.101,0],[.012,.025,.022]);
  f.rod('alloy','#787d72',[-.30,.32,.05],[-.383,.027,.17],.009);
  // U-lock passes around a seat stay and a rear spoke. A coiled cable is hung off the rack.
  f.pipe('rubber','#444b45',[[rear+.11,.38,.071],[rear+.12,.455,.085],[rear+.072,.505,.079],
    [rear-.006,.494,.067],[rear-.033,.434,.070],[rear-.020,.383,.074]],.010,16,7);
  f.box('metal','#b19353',[rear+.047,.384,.074],[.16,.028,.029],.006);
  for(let i=0;i<3;i++)f.ring('rubber','#525548',[rear-.087+i*.014,r*2+.035,.103],.055,.005,[.14,.32,0],16);
}

function rack(f,cx,y,z,w,high=.63) {
  for(const x of [cx-w/2,cx+w/2])f.box('alloy','#8b9184',[x,y+.015,z],[.14,.03,.095],.009);
  f.pipe('alloy','#929d91',[[cx-w/2,y+.025,z],[cx-w/2,y+high-.16,z],[cx-w/2+.045,y+high-.036,z],
    [cx-w/2+.16,y+high,z],[cx+w/2-.16,y+high,z],[cx+w/2-.045,y+high-.036,z],[cx+w/2,y+high-.16,z],[cx+w/2,y+.025,z]],.023,22);
}

function cyclePocket(f) {
  f=f.child(atOrigin,[0,Math.PI,0]);
  // A low wall at the rear of the cycle pocket, with coping, drainage slots and rack feet.
  f.box('stone','#b6b5a0',[0,.37,-.827],[4.85,.74,.22],.025);
  for(let i=0;i<7;i++)f.box('stone',i%3?'#c3c2b1':'#bbbcae',[(i-3)*.686,.755,-.825],[.671,.075,.296],.014);
  for(const x of [-1.78,-.10,1.71])f.box('metal','#59655a',[x,.154,-.708],[.15,.059,.015],.008);
  for(const x of [-2.30,0,2.30]){
    f.box('alloy','#828f83',[x,.798,-.818],[.142,.025,.129],.007);
    f.rod('metal','#546f63',[x,.796,-.818],[x,2.255,-.818],.036,.032,10);
    f.pipe('alloy','#a2aca0',[[x,2.19,-.89],[x,2.32,-.50],[x,2.36,-.12],[x,2.34,.33],[x,2.15,.89]],.019,18);
    f.rod('metal','#647b6e',[x,1.72,-.81],[x,2.278,.51],.019);
  }
  const canopy=grid(110,8,(u,v)=>[(u-.5)*4.91,2.36-.19*(2*v-1)**2+.012*Math.sin(88*Math.PI*u),-.935+1.85*v]);
  f.put(canopy,'shade','#77968d');
  for(const z of [-.929,.914])f.box('metal','#617a70',[0,2.153,z],[4.94,.067,.042],.008);
  f.box('metal','#58776b',[1.58,2.041,.906],[1.16,.222,.030],.014);
  patch(f,13,[1.58,2.041,.927],1.10,.177);
  rack(f,-1.18,0,-.11,1.04,.56);rack(f,1.03,0,-.15,.98,.58);
  bike(f.child([-1.19,.005,.066],[.095,.15,0]),{color:'#4f8177',wicker:true});
  bike(f.child([.96,.004,.13],[.075,Math.PI-.20,0]),{electric:true,color:'#875952'});
}

function chessCorner(f) {
  const z=-.12,shade='#af8152',rib='#605f4f';
  f.turned('stone','#acafa0',[0,0,z],[[0,0],[.23,.010],[.238,.054],[.20,.107],[.046,.127],[0,.127]]);
  f.rod('alloy','#9a9c83',[0,.107,z],[0,2.453,z],.022,.018,11);
  f.turned('alloy','#888f7d',[0,1.74,z],[[.023,0],[.04,.031],[.037,.084],[.021,.11]],13);
  for(let i=0;i<8;i++){
    const a=i*tau/8;
    const panel=grid(8,6,(u,v)=>{
      const angle=a+u*tau/8, scallop=Math.sin(u*Math.PI);
      const rr=v*(1.155-.052*scallop);
      return [rr*Math.cos(angle),2.456-.382*v**1.45-.069*v*v*scallop,z+rr*Math.sin(angle)];
    });
    f.put(panel,'awn',i%2?shade:'#cfab77');
    const dx=Math.cos(a),dz=Math.sin(a);
    f.pipe('alloy',rib,[[0,2.434,z],[dx*.40,2.37,z+dz*.40],[dx*.80,2.244,z+dz*.80],[dx*1.15,2.062,z+dz*1.15]],.008,10,5);
    f.rod('alloy',rib,[0,1.810,z],[dx*.57,2.315,z+dz*.57],.007,.005,6);
    f.egg('alloy',rib,[dx*1.153,2.059,z+dz*1.153],[.014,.025,.014]);
  }
  f.egg('metal','#73694f',[0,2.464,z],[.035,.036,.035]);
  const table=f.child([0,0,.425]);
  table.turned('stone','#a6a593',atOrigin,[[.204,0],[.236,.036],[.216,.12],[.122,.18],[.112,.55],[.171,.643]],18);
  table.box('stone','#c9c9b5',[0,.676,0],[.91,.069,.76],.025);
  table.box('wood','#dab98a',[0,.724,0],[.602,.027,.635],.009);
  patch(table,14,[0,.739,0],.578,.613,[-Math.PI/2,0,0]);
  // A game already in progress; the river and palace lines remain visible.
  const game=[[0,4,0],[1,3,0],[2,6,2],[3,2,3],[4,0,1],[5,3,4],[6,8,5],[6,4,3],
    [8,4,9],[9,5,9],[10,2,7],[11,5,6],[12,8,8],[13,2,5],[14,4,5],[14,0,6]];
  for(const [glyph,col,row] of game){
    const x=-.258+col*.0634,y=.739,zz=-.274+row*.0603;
    table.turned('wood','#e3c492',[x,y,zz],[[.020,0],[.024,.003],[.024,.012],[.022,.015],[0,.015]],14);
    const top=new THREE.CircleGeometry(.022,16),uv=top.attributes.uv;
    for(let i=0;i<uv.count;i++)uv.setXY(i,...tileUv(15,((glyph%4)+uv.getX(i))/4,(3-Math.floor(glyph/4)+uv.getY(i))/4));
    table.put(top,'print','#ffffff',[x,y+.0153,zz],unit,[-Math.PI/2,0,0]);
  }
  thermos(table,[.364,.710,-.21],'#a05a42');
  for(const side of [-1,1]){
    const stool=f.child([side*.83,0,.43],[0,side*.08,0]);
    for(const a of [-1,1])for(const b of [-1,1])stool.rod('wood','#ad9b79',[a*.155,.018,b*.139],[a*.115,.415,b*.101],.022,.020,7);
    stool.rod('wood','#ab9773',[-.14,.19,0],[.14,.19,0],.017);
    for(let j=0;j<3;j++)stool.box('wood','#ddcba5',[0,.434,(j-1)*.102],[.37,.045,.095],.009);
  }
}

function hanging(f,at,w,h,tile,type,yaw=0) {
  const g=grid(24,13,(u,v)=>{
    const down=1-v, side=Math.abs(2*u-1);
    let span=1;
    if(type==='shirt')span=v>.78?.80+.2*(1-v)/.22:v>.55?1.12:.69;
    const x=(u-.5)*w*span;
    const folds=.036*Math.sin(u*Math.PI*7+.45*down)+.018*Math.sin(12*down+4*u);
    const y=-down*h-.050*down*Math.sin(Math.PI*u)+.022*side*down;
    return [x,y,folds*(.35+.65*down)+.044*down*down];
  },{uv:(u,v)=>tileUv(tile,u,v)});
  const body=f.child(at,[0,yaw,0]);body.put(g,'fabric','#ffffff');
  for(const x of [-w*.35,w*.35]){
    body.box('wood','#dbc599',[x,.013,.013],[.018,.079,.022],.003,[.15,0,x*.08]);
    body.rod('alloy','#9b9c89',[x-.011,.014,.014],[x+.011,.014,.014],.005);
  }
}

function hamper(f,at,w,d,h) {
  const b=f.child(at);
  for(let j=0;j<9;j++){
    const v=j/8;
    quadLoop(b,'wood',j%3?'#c7ac7b':'#b3986e',0,.042+v*h,0,w*(.82+.18*v),d*(.84+.16*v),j===8?.012:.008);
  }
  for(const sign of [-1,1])for(let i=0;i<8;i++){
    const x=(i/7-.5)*w;
    b.rod('wood','#cbb68a',[x*.82,.034,sign*d*.419],[x,h+.048,sign*d*.495],.006,.006,5);
  }
  for(const side of [-1,1])b.pipe('wood','#d2bb8f',[[-w*.19,h+.033,side*d*.49],
    [-w*.16,h+.135,side*d*.51],[w*.16,h+.135,side*d*.51],[w*.19,h+.033,side*d*.49]],.011,12);
}

function drying(f) {
  const d=f.child([-.13,0,-.015],[0,.055,0]),tube='#a4ada1';
  for(const x of [-1.14,1.14]) {
    for(const sign of [-1,1]){
      d.rod('alloy',tube,[x,.035,sign*.59],[x,1.48,-sign*.37],.019,.017,9);
      d.egg('rubber','#57635b',[x,.026,sign*.59],[.034,.026,.044]);
    }
    d.rod('alloy','#929d8f',[x,1.478,-.386],[x,1.478,.386],.022);
    d.egg('metal','#617e72',[x,.902,0],[.035,.042,.046]);
  }
  for(const z of [-.36,-.14,.16,.36])d.rod('alloy',tube,[-1.32,1.476,z],[1.32,1.476,z],.013);
  hanging(d,[-.75,1.487,-.33],.70,.82,7,'towel');
  hanging(d,[.12,1.482,-.34],.70,.67,9,'shirt',.045);
  hanging(d,[.81,1.481,.16],.54,.51,8,'towel',-.055);
  for(const x of [-.81,-.46,.63])d.rod('metal','#84775c',[x,1.466,.335],[x+.015,1.533,.365],.008);
  hamper(d,[.95,0,-.36],.63,.38,.32);
  d.turned('metal','#9cb9ad',[-.98,0,.246],[[.104,0],[.15,.012],[.201,.076],[.219,.132],[.218,.142],[.203,.141],[.184,.083],[.125,.024],[0,.020]]);
  d.ring('metal','#465d56',[-.98,.14,.246],.213,.007,[Math.PI/2,0,0]);
}

function chainFence(f,length,height,sections,damaged) {
  const rail='#637c71',z=-.035,postHeight=height-.055,meshTop=height-.15,bottom=.18;
  const bay=(length-.24)/sections,left=-(length-.24)/2;
  for(let i=0;i<=sections;i++) {
    const x=left+i*bay;
    f.box('stone','#b0b1a1',[x,.061,z],[.205,.122,.235],.014);
    f.rod('metal',i%3===1?'#768575':rail,[x,.082,z],[x,postHeight,z],.034,.031,11);
    f.egg('alloy','#8a9486',[x,postHeight,z],[.035,.022,.035]);
    for(const y of [.25,meshTop-.08]){
      f.ring('alloy','#959e8f',[x,y,z],.035,.004,[Math.PI/2,0,0],14);
      f.box('metal','#818b78',[x+.029,y,z+.025],[.040,.025,.02],.002);
    }
    if(i===sections)continue;
    for(const y of [bottom-.036,meshTop+.014])f.rod('metal',rail,[x,y,z],[x+bay,y,z],.019,.019,8);
    const xmin=x+.04,xmax=x+bay-.04, span=xmax-xmin, rise=meshTop-bottom;
    const step=.158, slope=1.13;
    for(const sign of [-1,1]) {
      // Clip each continuous strand to its bay. The middle bows away from the post.
      const low=sign===1?-span*slope:0,high=sign===1?rise:rise+span*slope;
      for(let offset=Math.floor(low/step)*step;offset<high;offset+=step){
        const x1=THREE.MathUtils.clamp((0-offset)/(sign*slope),0,span);
        const x2=THREE.MathUtils.clamp((rise-offset)/(sign*slope),0,span);
        const a=Math.min(x1,x2),b=Math.max(x1,x2);if(b-a<.012)continue;
        const sample=u=>{
          const v=offset+sign*slope*u, bow=Math.sin(Math.PI*u/span)*Math.sin(Math.PI*v/rise);
          return [xmin+u,bottom+v-(damaged?.034:.012)*bow,
            z+.017+(damaged&&i===1?.087:.034)*bow+sign*.003];
        };
        const p=sample(a),m=sample((a+b)/2),q=sample(b);
        const tint=damaged&&i===1&&offset<.69?'#8a7963':'#8a9787';
        f.rod('wire',tint,p,m,.0039,.0039,4);f.rod('wire',tint,m,q,.0039,.0039,4);
      }
    }
    if(i===1 && damaged){
      for(let j=0;j<5;j++){
        const xx=x+.38+j*.134;
        f.pipe('wire','#96764d',[[xx,.579,z+.092],[xx+.03,.654,z+.132],[xx+.093,.674,z+.078],[xx+.119,.740,z+.079]],.006,5,5);
      }
    }
  }
}

function sideFence(f) {
  chainFence(f,7.80,1.63,3,true);
  // The reversible score leaves hang from real rings on the spectator side.
  const sign=f.child([2.29,1.18,.075]);
  sign.box('metal','#586c61',atOrigin,[.84,.43,.064],.010);
  patch(sign,10,[0,0,.036],.78,.36);
  for(const x of [-.31,-.11,.11,.31])sign.ring('alloy','#ada78c',[x,.222,.011],.029,.004,[0,Math.PI/2,0],12);
  hanging(f,[-2.30,1.534,.015],.60,.50,7,'towel',.015);
}

function ball(f,at) {f.egg('ball','#ffffff',at,[.120,.120,.120],[.29,.51,-.19]);}

function drink(f,at,tint='#91b2ac') {
  const b=f.child(at);
  b.turned('bottle',tint,atOrigin,[[0,.003],[.025,0],[.034,.012],[.036,.046],[.032,.061],[.035,.070],[.034,.150],[.031,.173],[.017,.189],[.014,.211]]);
  const label=grid(17,1,(u,v)=>{
    const angle=u*tau;return [.0354*Math.sin(angle),.075+v*.056,.0354*Math.cos(angle)];
  },{uv:(u,v)=>tileUv(6,u,v)});
  b.put(label,'print','#ffffff');
  b.turned('metal','#537e92',[0,.200,0],[[.017,0],[.017,.023],[.014,.025],[0,.025]],12);
  for(const y of [.045,.052,.145])b.ring('glass','#a9c2bd',[0,y,0],.033,.0019,[Math.PI/2,0,0],16);
}

function sidelineBench(f) {
  const s=f.child([-.20,0,-.09],[0,Math.PI,0]);
  bench(s,2.69,true);drink(s,[.76,.492,.08]);drink(s,[.94,.492,-.015],'#aac3ba');
  const towel=grid(14,7,(u,v)=>{
    const z=-.22+v*.494,fall=Math.max(0,(v-.76)/.24);
    return [(u-.5)*.41,.504+.014*Math.cos(u*18)-fall*.142,z-.08*fall];
  },{uv:(u,v)=>tileUv(7,u,v)});
  s.put(towel,'fabric','#ffffff',[-.63,0,0],unit,[0,.19,0]);
  ball(f,[1.34,.120,.36]);
  const bag=f.child([1.31,.152,-.05],[.02,.19,.04]);
  bag.egg('rubber','#536b69',atOrigin,[.218,.153,.133]);
  for(const xx of [-.082,.082])bag.pipe('rubber','#9aab8a',[[xx,-.101,.087],[xx,.069,.115],[xx,.131,.058],[xx,.137,-.066],[xx,-.09,-.08]],.014,11);
  bag.pipe('rubber','#394c4b',[[-.09,.10,.014],[-.067,.21,.023],[.067,.21,.023],[.09,.10,.014]],.010,12);
}

function sportCorral(f) {
  f=f.child([0,0,0],[0,Math.PI/2,0]);
  for(const x of [-.62,.62])for(const z of [-.24,.24]){
    f.ring('rubber','#474b40',[x,.080,z],.057,.017,null,18);
    f.rod('alloy','#90998b',[x,.087,z],[x,.184,z],.014);
    f.rod('metal','#547469',[x,.185,z],[x,.868,z],.020);
  }
  for(const y of [.19,.40,.62,.86])quadLoop(f,'metal','#61877a',0,y,0,1.27,.51,.012);
  for(let j=0;j<8;j++)for(const side of [-1,1])f.rod('wire','#a1a797',[(j-3.5)*.15,.19,side*.245],[(j-3.5)*.15,.856,side*.251],.004,.004,5);
  for(let j=0;j<5;j++)f.rod('metal','#779283',[(j-2)*.245,.198,-.236],[(j-2)*.245,.198,.236],.008);
  for(const x of [-.42,-.12,.16,.435])ball(f,[x,.325,x*.15]);
  for(const x of [-.31,.22])ball(f,[x,.525,-x*.15]);
  f.pipe('metal','#4e7264',[[.62,.78,-.24],[.74,1.02,-.24],[.79,1.063,-.16],[.79,1.063,.16],[.74,1.02,.24],[.62,.78,.24]],.019,14);
  f.box('metal','#597067',[0,.936,-.233],[.64,.35,.027],.011);
  patch(f,10,[0,.938,-.213],.60,.276);
}

function broom(f,at,height,rot) {
  const b=f.child(at,rot);
  b.rod('wood','#d8bc88',[0,.15,0],[0,height,0],.012,.014);
  for(let i=0;i<27;i++) {
    const t=i/26-.5, small=Math.sin(i*12.78), z=.026*Math.cos(i*2.4);
    b.pipe('fibre',i%3?'#bdaa77':'#9f8e65',[[t*.266,.021+.011*small,z],
      [t*.20,.108,z*.83],[t*.069,.224,z*.6],[t*.026,.31+small*.023,z*.35]],.0037,5,5);
  }
  for(const y of [.209,.232,.252])b.rod('metal','#897a56',[-.039,y,.006],[.039,y,.006],.006);
}

function wateringCan(f,at) {
  const c=f.child(at,[0,-.19,0]),green='#738a75';
  c.turned('metal',green,atOrigin,[[.061,.007],[.116,0],[.138,.027],[.141,.180],[.129,.219],[.082,.242],[.069,.242],[.070,.222],[.119,.206]]);
  for(const y of [.035,.17])c.ring('alloy','#9caa95',[0,y,0],.139,.0038,[Math.PI/2,0,0],24);
  c.pipe('metal',green,[[-.07,.208,0],[-.15,.25,0],[-.172,.364,0],[-.134,.410,0],[-.045,.393,0],[.064,.255,0]],.014,15);
  c.rod('metal',green,[.11,.062,0],[.292,.234,0],.053,.022,14);
  c.rod('alloy','#a79972',[.289,.234,0],[.331,.269,0],.020,.060,15);
  for(let i=0;i<9;i++){
    const a=i*tau/9;
    c.egg('rubber','#586255',[.332-.018*Math.sin(a),.273+.024*Math.sin(a),.04*Math.cos(a)],[.0037,.0037,.0037]);
  }
}

function plant(f,at,r,height,variant=0) {
  const p=f.child(at),potH=r*(variant?1.37:1.48),tint=variant?'#9b7860':'#b08469';
  p.turned('pot',tint,atOrigin,[[.52*r,0],[.69*r,.018],[.73*r,.051],[.91*r,potH*.76],[r,potH*.82],
    [r*1.045,potH*.86],[r*1.05,potH*.98],[r,potH],[.91*r,potH],[.89*r,potH*.87]],20);
  p.turned('fibre','#665b44',[0,potH*.9,0],[[0,0],[r*.90,0],[r*.895,.008],[0,.013]],15);
  p.ring('pot','#ccb299',[0,potH*.77,0],.924*r,.005,[Math.PI/2,0,0],22);
  const blade=grid(4,8,(u,v)=>{
    const w=Math.max(.003,Math.sin(v*Math.PI)**.73);
    return [(u-.5)*w,v,.12*Math.abs(2*u-1)*w-.24*v*v];
  });
  for(let i=0;i<(variant?14:19);i++){
    const a=i*2.39996+variant, k=.49+.51*Math.abs(Math.sin(i*2.67+.7)), leafH=(height-potH)*k;
    const bx=Math.cos(a)*r*.27,bz=Math.sin(a)*r*.27;
    const branch=p.child([bx,potH*.92,bz],[0,a,0]);
    const lean=variant?.29+.27*k:.47+.47*k;
    branch.put(blade,'green',['#789368','#71895f','#8e9e68','#648168'][i%4],[0,leafH*.13,0],
      [leafH*(variant?.22:.36),leafH*.89,leafH*.41],[lean,0,.11*Math.cos(i)]);
    branch.rod('green','#7f8b5c',[0,0,0],[0,leafH*.22,.032],.005,.0035,5);
  }
}

function watering(f) {
  const g=f.child([0,0,.015],[0,.10,0]),green='#5a7967',hose='#657760';
  // The tap is on a freestanding rendered pier at the vine bed, with a runnel under the bib.
  g.box('stone','#bab8a5',[-.66,.49,-.34],[.34,.98,.34],.019);
  g.box('stone','#cdcab7',[-.66,1.008,-.34],[.40,.06,.40],.017);
  g.pipe('alloy','#927f5b',[[-.66,.72,-.15],[-.66,.72,.012],[-.66,.672,.043]],.021,9);
  g.rod('metal','#9f775e',[-.725,.785,-.046],[-.595,.785,-.046],.010);
  g.rod('alloy','#9e9578',[-.66,.715,-.046],[-.66,.786,-.046],.011);
  g.box('stone','#a29f8b',[-.65,.029,.032],[.61,.058,.55],.015);
  for(let i=0;i<7;i++)g.box('alloy','#707c70',[-.81+i*.051,.066,.05],[.026,.014,.30],.002);
  for(const side of [-1,1]){
    g.pipe('metal',green,[[.28,.031,side*.197],[.14,.031,side*.197],[-.03,.32,side*.197],[.17,.49,side*.197],[.36,.032,side*.197]],.017,15);
    g.ring('metal',green,[.11,.425,side*.154],.245,.010,null,29);
    for(let j=0;j<5;j++){
      const a=j*tau/5;
      g.rod('metal',green,[.11,.425,side*.154],[.11+.232*Math.cos(a),.425+.232*Math.sin(a),side*.154],.008);
    }
  }
  g.rod('alloy','#9ba294',[.11,.425,-.21],[.11,.425,.25],.021);
  const coil=[];
  for(let i=0;i<=78;i++) {
    const a=i/78*tau*7,rad=.172+.008*Math.sin(a*1.3);
    coil.push([.11+rad*Math.cos(a),.425+rad*Math.sin(a),-.130+i/78*.260]);
  }
  g.pipe('rubber',hose,coil,.014,112,7);
  g.pipe('rubber',hose,[[.283,.425,.13],[.34,.18,.24],[.43,.017,.36],[.74,.017,.380],[.87,.018,.22],[.68,.019,.095]],.015,19);
  g.rod('alloy','#ac995f',[.69,.021,.096],[.593,.021,.099],.019,.013);
  wateringCan(g,[-.50,.066,.122]);plant(g,[.81,0,-.18],.15,.48,1);
  broom(g,[-.91,0,-.34],1.47,[-.16,.07,-.084]);
  g.box('wood','#c8baa0',[-.65,.40,-.159],[.30,.17,.014],.006);patch(g,12,[-.65,.40,-.147],.28,.132);
  for(const x of [-.91,.86]){
    g.rod('wood','#c6b68b',[x,.03,-.57],[x,1.76,-.57],.027,.024);
    g.rod('metal',green,[x,.89,-.56],[x,1.10,-.27],.012);
  }
  g.box('wood','#cfb88e',[-.025,1.111,-.43],[1.88,.054,.314],.009);
  g.rod('wood','#d0bd94',[-1.01,1.75,-.567],[.99,1.75,-.567],.024,.022);
  hanging(g,[.51,1.715,-.531],.415,.545,8,'towel',.035);
  for(let j=0;j<3;j++)g.turned('pot',j%2?'#ab7d59':'#a78369',[-.708+j*.253,1.14,-.43],
    [[.059,0],[.064,.008],[.092,.124],[.101,.13],[.101,.153],[.09,.155],[.085,.13]],15);
  g.pipe('fibre','#ad9b73',[[-.19,1.758,-.52],[-.162,1.6,-.505],[-.14,1.43,-.48]],.005,7,5);
  g.box('wood','#beab85',[-.14,1.35,-.478],[.042,.175,.03],.008,[.08,0,-.14]);
  g.turned('alloy','#8f9c90',[-.13,1.254,-.477],[[.005,0],[.034,.053],[.025,.087],[.006,.107]],8);
}

function handcart(f,maintenance) {
  const tint=maintenance?'#637b6e':'#6f827a',w=maintenance?.66:.48,deck=maintenance?.97:.67;
  for(const side of [-1,1]) {
    const z=side*(w*.5+.035);
    f.ring('rubber','#42483f',[0,.177,z],.145,.030,null,23);
    f.ring('alloy','#8b968b',[0,.177,z+.004],.117,.009,null,23);
    for(let i=0;i<5;i++){
      const a=i*Math.PI/5;
      f.rod('alloy','#909a8d',[-.116*Math.cos(a),.177-.116*Math.sin(a),z],
        [.116*Math.cos(a),.177+.116*Math.sin(a),z],.0055,.0055,6);
    }
    f.rod('metal',tint,[-deck*.52,.25,side*w*.44],[deck*.54,.25,side*w*.44],.021);
    f.pipe('metal',tint,[[deck*.21,.25,side*w*.44],[deck*.51,.34,side*w*.44],
      [deck*.78,.71,side*w*.44],[deck*.88,.73,side*w*.44]],.014,10);
    f.rod('rubber','#444c42',[deck*.78,.71,side*w*.44],[deck*.89,.735,side*w*.44],.022);
    f.rod('metal',tint,[deck*.42,.26,side*w*.44],[deck*.45,.028,side*w*.44],.012);
  }
  for(let i=0;i<5;i++)f.box('wood','#cbbb98',[0,.287,(i-2)*w*.19],[deck,.04,w*.174],.008);
  if(maintenance) {
    for(const side of [-1,1]) {
      for(const x of [-deck*.46,deck*.46])f.rod('metal',tint,[x,.28,side*w*.46],[x,.59,side*w*.46],.013);
      for(const y of [.385,.525])f.box('wood','#bca982',[0,y,side*w*.46],[deck,.093,.030],.007);
    }
  }
}

function maintenanceCart(f) {
  const cart=f.child([-.28,0,-.10],[0,-.12,0]);handcart(cart,true);
  const bin=cart.child([-.19,.312,0]);
  bin.turned('alloy','#9caa9b',atOrigin,[[.105,0],[.119,.02],[.151,.247],[.153,.267],[.138,.270],[.133,.242]],20);
  bin.pipe('alloy','#a9ada0',[[-.143,.231,0],[-.122,.369,0],[0,.426,0],[.122,.369,0],[.143,.231,0]],.005,16);
  broom(cart,[.20,.307,.07],.99,[-.13,0,-.28]);
  cart.box('metal','#72857b',[.009,.335,-.069],[.22,.037,.22],.014,[.12,0,-.20]);
  cart.rod('wood','#cebc93',[.016,.358,-.073],[.245,1.024,-.130],.009);
  const tarp=grid(16,6,(u,v)=>[(u-.5)*.42,.50+.020*Math.sin(u*19+v)-.23*Math.max(0,(v-.58)/.42),.15+v*.22]);
  cart.put(tarp,'rubber','#687a6a',[.014,0,0]);
}

function parcel(f,at,w,h,d,rotation=0) {
  const p=f.child(at,[0,rotation,0]);
  p.box('paper','#b59669',[0,h/2,0],[w,h,d],.008);
  p.box('tape','#baab85',[0,h+.002,0],[w*.18,.004,d+.001]);
  p.box('tape','#baab85',[0,h*.72,d/2+.001],[w*.18,h*.56,.004]);
  p.box('paper','#786646',[w*.25,h+.002,0],[w*.48,.003,.004]);
  patch(p,4,[w*.18,h+.005,-d*.08],w*.37,d*.47,[-Math.PI/2,0,.03]);
  patch(p,4,[-w*.23,h*.56,d/2+.004],w*.24,h*.42);
}

function parcelLockers(f) {
  const rack=f.child([-.13,0,-.16]),caseTone='#547a73',light='#a5b8ac';
  const w=2.76,left=-w*.5,pitch=w/5,face=.318;
  rack.box('stone','#a7ada0',[0,.060,0],[2.89,.12,.84],.022);
  // A common back, returns and shelves give the open compartment a real cavity.
  rack.box('metal',caseTone,[0,.993,-.294],[w,1.75,.052],.012);
  for(let c=0;c<=5;c++)rack.box('metal',caseTone,[left+c*pitch,1.0,0],[.031,1.76,.64],.008);
  for(const y of [.146,1.85])rack.box('metal',caseTone,[0,y,0],[w+.035,.042,.655],.009);
  let number=0;
  for(let c=0;c<5;c++){
    const x=left+(c+.5)*pitch,heights=c===2?[.42,.49,.77]:c%2?[.55,.52,.61]:[.37,.37,.43,.51];
    let y=.151;
    for(let row=0;row<heights.length;row++) {
      const h=heights[row],cy=y+h/2,open=c===3&&row===1,terminal=c===2&&row===2;
      rack.box('metal','#748e81',[x,y,.014],[pitch-.016,.022,.594],.003);
      const door=rack.child([x-pitch*.464,cy,face],open?[0,-.90,0]:null),dw=pitch*.94;
      const color=terminal?caseTone:[light,'#afbeb0','#aebcaf','#9eafa4'][(c+row)%4];
      door.box('metal',color,[dw/2,0,0],[dw-.012,h-.026,.034],.009);
      if(open){
        door.box('metal','#8b9e92',[dw*.50,0,-.023],[dw*.82,h-.101,.021],.005);
        parcel(rack,[x+.026,y+.015,.045],.339,.197,.335,-.055);
      }
      if(terminal){
        door.box('rubber','#283b3c',[dw/2,.021,.024],[dw*.71,h*.76,.032],.016);
        patch(door,3,[dw/2,.024,.043],dw*.63,h*.65);
      }else{
        const n=number++%16;
        patch(door,5,[dw*.22,h*.29,.019],.112,.053,null,[(n%4)/4,(3-Math.floor(n/4))/4,.25,.25]);
        door.box('rubber','#425651',[dw*.79,.004,.020],[.085,.046,.008],.007);
        door.rod('alloy','#bac3b4',[dw*.79-.029,.008,.030],[dw*.79+.029,.008,.030],.007,.007,7);
        for(const off of [-1,1])door.rod('alloy','#aab4a5',[.011,off*h*.31-.026,.015],[.011,off*h*.31+.026,.015],.008);
        if(row===0)for(let i=0;i<3;i++)door.box('rubber','#72877c',[dw*.29+i*.057,-h*.30,.018],[.035,.009,.006],.001);
      }
      y+=h;
    }
  }
  rack.box('metal',caseTone,[0,1.98,.02],[w+.071,.23,.68],.019);
  patch(rack,2,[0,1.988,.37],2.16,.159);
  // Rolled sheet, downturned fascia, gutter, triangular stays and a drain elbow.
  for(const x of [-1.44,1.44]){
    rack.rod('metal',caseTone,[x,.104,-.31],[x,2.43,-.31],.031,.026);
    rack.rod('metal',caseTone,[x,1.96,-.30],[x,2.325,.50],.019);
    rack.rod('metal',caseTone,[x,2.445,-.35],[x,2.31,.61],.021);
  }
  const roof=grid(120,3,(u,v)=>[(u-.5)*3.10,2.447-.131*v+.015*Math.cos(u*28*Math.PI),-.46+v*1.19]);
  rack.put(roof,'roof','#90a69b');
  rack.box('metal','#5e7a71',[0,2.298,.73],[3.13,.077,.049],.011);
  rack.pipe('metal','#95a398',[[1.50,2.285,.72],[1.50,2.18,.72],[1.51,2.08,.44],
    [1.52,2.04,-.18],[1.52,1.93,-.27],[1.52,.22,-.27],[1.56,.131,-.23]],.027,20);
  for(const y of [.58,1.50])rack.ring('alloy','#969c90',[1.52,y,-.27],.028,.005,[Math.PI/2,0,0],14);
  parcel(f,[-1.35,.01,.520],.42,.225,.32,.09);
  plant(f,[1.59,0,.34],.193,.78,1);
}

function homeCycles(f) {
  const bikeSpot=f.child([-.57,.006,-.11],[.097,Math.PI-.15,0]);
  bike(bikeSpot,{color:'#576b75',childSeat:true});
  rack(f,-.66,0,-.22,1.17,.55);
  const dolly=f.child([1.01,0,.05],[0,-.25,0]);handcart(dolly,false);
  parcel(dolly,[-.049,.311,.01],.53,.27,.40,.01);
  parcel(dolly,[-.065,.581,-.033],.38,.19,.29,-.027);
  dolly.pipe('rubber','#67614c',[[-.26,.33,.205],[-.24,.57,.17],[-.21,.78,.128],[.107,.78,.115],[.14,.56,.19],[.20,.32,.20]],.005,14,5);
  plant(f,[-1.46,0,-.45],.142,.49);
}

function floweringPot(f,at,r,petals) {
  plant(f,at,r,r*3.05);
  const h=r*1.48;
  const petal=grid(2,3,(u,v)=>[(u-.5)*Math.max(.055,Math.sin(v*Math.PI)*1.19),.19*v*v+.06*Math.abs(u-.5),v]);
  for(let i=0;i<4;i++){
    const a=i*2.40,x=at[0]+Math.cos(a)*r*.68,z=at[2]+Math.sin(a)*r*.61,y=at[1]+h+r*(1.25+.27*Math.sin(i*1.5));
    f.rod('green','#6f8154',[at[0],at[1]+h*.9,at[2]],[x,y,z],.004,.003,5);
    for(let j=0;j<10;j++){
      const b=j*2.40,rr=.054*Math.sqrt((j+.5)/10),xx=x+rr*Math.cos(b),zz=z+rr*Math.sin(b),yy=y+.034*(1-rr/.06);
      for(let k=0;k<3;k++){
        const c=b+k*tau/3;
        f.put(petal,'petal',petals[(i+j+k)%petals.length],[xx,yy,zz],[.025,.021,.025],[-.18,c,0]);
      }
    }
  }
}

function herbStand(f) {
  const p=f.child(atOrigin,[0,-Math.PI/2,0]),green='#5e7665';
  for(const x of [-1.15,.15,1.15]){
    p.pipe('metal',green,[[x,.026,.32],[x,.37,.32],[x,.415,.23],[x,.415,-.12],[x,.785,-.15],[x,.81,-.50],[x,.031,-.50]],.015,18);
  }
  for(const [y,z] of [[.425,.11],[.818,-.32]])for(let i=-1;i<=1;i++)
    p.box('wood','#b1ab88',[0,y,z+i*.101],[2.49,.034,.088],.006);
  for(const x of [-.96,-.45,.04])p.rod('wood','#b4a577',[x,.10,-.55],[x+.072,1.58,-.55],.011,.008,7);
  for(let j=0;j<5;j++)p.rod('wood','#b4a577',[-1.01,.75+j*.156,-.53],[.19,.75+j*.156,-.53],.008,.006,6);
  floweringPot(p,[-.96,.444,.10],.169,['#b98997','#d7a1ab','#c8999f']);
  plant(p,[-.43,.444,.12],.125,.49,1);plant(p,[.32,.444,.12],.167,.53);
  floweringPot(p,[.90,.444,.13],.172,['#a48bab','#b997b7','#9d87a6']);
  plant(p,[-.76,.837,-.33],.179,.64,1);plant(p,[-.12,.837,-.33],.136,.49);
  floweringPot(p,[.62,.837,-.33],.148,['#c9827b','#c99686','#d39886']);
  plant(p,[1.29,0,.367],.130,.35,1);
}

function surfaces(kit) {
  const {art}=kit;
  const color=url=>imageMap(art,url,THREE.SRGBColorSpace),data=url=>imageMap(art,url,THREE.NoColorSpace);
  const print=color(printURL), wood=color(slatURL);
  const woodN=data(slatNormalURL), woodR=data(slatRoughnessURL);
  const leather=color(ballURL), pebble=data(ballReliefURL);
  const pending=[print,wood,woodN,woodR,leather,pebble].map(t=>t.userData.ready);
  kit.root.userData.assetsReady=Promise.all([kit.root.userData.assetsReady,...pending]);
  const make=(name,props)=>{
    const m=art.keepMaterial(new THREE.MeshStandardMaterial({vertexColors:true,...props}));
    m.name=name;return m;
  };
  const cement=kit.material.plaster;
  return {
    metal:make('旧烤漆与搪瓷',{roughness:.52,metalness:.31,side:THREE.DoubleSide}),
    alloy:make('锌钢与轮圈',{roughness:.38,metalness:.66}),
    wire:make('修补铁丝',{roughness:.67,metalness:.42}),
    rubber:make('轮胎与帆布',{roughness:.91,side:THREE.DoubleSide}),
    fibre:make('竹篾与土',{roughness:.99}),paper:make('纸页与牛皮纸箱',{roughness:.92,side:THREE.DoubleSide}),
    tape:make('封箱带',{roughness:.41}),
    wood:make('磨旧木条',{map:wood,normalMap:woodN,normalScale:new THREE.Vector2(.40,.40),roughnessMap:woodR,roughness:1.0}),
    stone:make('灰泥与水泥',{map:cement.map,normalMap:cement.normalMap,normalScale:new THREE.Vector2(.34,.34),roughnessMap:cement.roughnessMap,roughness:1.03}),
    print:make('纸墨与铭牌',{map:print,roughness:.74,side:THREE.DoubleSide}),
    fabric:make('晒干的棉布',{map:print,roughness:.98,side:THREE.DoubleSide}),
    bottle:make('水瓶',{transparent:true,opacity:.68,depthWrite:false,roughness:.23,metalness:.12}),
    ball:make('旧篮球',{map:leather,bumpMap:pebble,bumpScale:.0018,roughness:.88}),
    glass:make('灯罩与透明边',{roughness:.22,metalness:.22}),
    green:make('盆栽叶片',{roughness:.76,side:THREE.DoubleSide}),
    petal:make('花瓣',{roughness:.93,side:THREE.DoubleSide}),
    pot:make('陶盆',{roughness:.84}),roof:make('压型雨篷',{roughness:.48,metalness:.35,side:THREE.DoubleSide}),
    shade:make('旧透光棚板',{roughness:.37,metalness:.10,transparent:true,opacity:.79,depthWrite:false,side:THREE.DoubleSide}),
    awn:make('晒旧伞布',{roughness:.94,side:THREE.DoubleSide}),
  };
}

const fixtures={
  'cycle-pocket':cyclePocket, drying, bench:readingBench, reading:readingStand,
  chess:chessCorner,'ball-corral':sportCorral, courtside:sidelineBench,
  sideline:sideFence, backstop:f=>chainFence(f,11.75,2.72,4,true),
  maintenance:maintenanceCart, watering, parcels:parcelLockers, 'home-cycles':homeCycles,'herb-stand':herbStand,
};

export function buildCourtyardLife(kit,course) {
  const sites=course.blocks.filter(b=>b.style==='courtLife' && b.id.startsWith('courtLife-'));
  if(!sites.length)return;
  const m=surfaces(kit),builder=solidBuilder(kit.art),groups=[];
  for(const site of sites) {
    const draw=fixtures[site.id.slice('courtLife-'.length)];
    if(!draw)continue;
    const group=new THREE.Group();group.name=site.id;group.userData.blockId=site.id;
    group.position.set(site.x,-.022,site.z);kit.root.add(group);
    draw(new Fixture(builder,group,m));groups.push(group);
  }
  builder.finish();
  for(const group of groups) {
    for(const mesh of group.children) {
      // Slender link wire is visible through its gaps. Posts and rails cast the
      // structural shadow without re-rasterising every 4 mm wire on each ride frame.
      mesh.castShadow=mesh.material!==m.wire && mesh.material!==m.bottle && mesh.material!==m.shade;
      mesh.geometry.computeBoundingSphere();
    }
  }
  return {ready:kit.root.userData.assetsReady};
}
