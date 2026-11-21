import * as THREE from 'three';
import { facadeFrame, fullTurn, rngFor } from './estate-kit.js';
import { createStairLayout } from './stair-layout.js';
import { buildStairInterior } from './stair-interior.js';
import { dressHousing, skylineBalconies } from './estate-frontages.js';
export { updateStairInterior } from './stair-interior.js';

const stone = '#baae94', zinc = '#9b9d91', iron = '#52584c';
const washing = ['#ddd2b7','#879cad','#c77e72','#aa938d','#71887c','#c4b3a2'];
const walls = ['#c3ad92','#bdab92','#c39370','#c2b8a1','#ad987d'];

function tank(frame,x,y,z,diameter) {
  const h=diameter*1.17;
  for(const dx of [-.30,.30]) for(const dz of [-.30,.30])
    frame.box('metal',[x+dx*diameter,y+.28,z+dz*diameter],[.09,.56,.09],iron);
  const bottom=y+.50;
  frame.drum('metal',[x,bottom+h/2,z],[diameter,h,diameter],'#b5b5a8');
  frame.shape('dome','metal',[x,bottom+h,z],[diameter,.26*diameter,diameter],'#c5c1b2');
  for(let ring=0;ring<5;ring++) frame.drum('metal',[x,bottom+.12+ring*h*.21,z],
    [diameter*1.025,.055,diameter*1.025],'#777e75');
  frame.drum('metal',[x,bottom+h+.14*diameter,z],[.31,.085,.31],iron);
  frame.beam('metal',[x+diameter*.48,bottom+.29,z],[x+diameter*.85,bottom+.29,z],.09,zinc);
  frame.beam('metal',[x+diameter*.85,bottom+.29,z],[x+diameter*.85,y+.07,z],.09,zinc);
  for(const side of [-1,1]){
    frame.beam('metal',[x+side*.29,y+.03,z+diameter*.53],[x+side*.29,bottom+h+.12,z+diameter*.53],.058,iron);
  }
  for(let k=0;k<h+.4;k+=.39)
    frame.beam('metal',[x-.29,y+.35+k,z+diameter*.53],[x+.29,y+.35+k,z+diameter*.53],.046,zinc);
}

function roofLaundry(f,x,y,z,span,rng) {
  for(const side of [-1,1]){
    f.box('plaster',[x+side*span/2,y+.13,z],[.49,.26,.54],stone);
    f.drum('metal',[x+side*span/2,y+1.49,z],[.094,2.86,.094],zinc);
    f.box('metal',[x+side*span/2,y+2.83,z],[.065,.087,1.58],zinc);
  }
  for(const row of [-.57,.57]){
    const left=[x-span/2,y+2.82,z+row],mid=[x,y+2.58,z+row+.09],right=[x+span/2,y+2.82,z+row];
    f.beam('metal',left,mid,.033,iron);f.beam('metal',mid,right,.033,iron);
    const count=Math.floor(span/1.35);
    for(let i=0;i<count;i++){
      const t=(i+.5)/count,top=y+2.82-.25*Math.sin(t*Math.PI),len=.95+rng()*.67;
      f.shape(i%3===0?'shirt':'cloth','cloth',[x+(t-.5)*span,top-len/2,z+row+.10],
        [.65+rng()*.52,len,.98],washing[(i+Math.floor(rng()*4))%washing.length],[.13,rng()*.13,(rng()-.5)*.10]);
    }
  }
}

function roofGarden(f,x,y,z,width,depth,rng){
  for(let row=0;row<3;row++){
    const dz=z+row*depth/3;
    f.box('brick',[x,y+.28,dz],[width,.55,depth*.23],'#aa9170');
    f.box('paint',[x,y+.57,dz],[width-.25,.09,depth*.23-.16],'#625942');
    const count=Math.round(width/.8);
    for(let i=0;i<count;i++){
      const px=x+(i+.5)*width/count-width/2,green=i%3?'#adb57b':'#859c60';
      f.shape('shrub','foliage',[px,y+.88+rng()*.25,dz],[.94,1.04,.85],green,[0,rng()*fullTurn,0]);
    }
  }
}

function roofCanopy(f,x,y,z,w,d,open) {
  for(const sx of [-1,1])for(const sz of [-1,1]) {
    f.box('metal',[x+sx*(w/2-.14),y+1.33,z+sz*(d/2-.14)],[.105,2.66,.105],iron);
    f.box('plaster',[x+sx*(w/2-.14),y+.10,z+sz*(d/2-.14)],[.43,.21,.43],stone);
  }
  for(const side of [-1,1])f.box('timber',[x,y+2.67,z+side*(d/2-.12)],[w,.17,.17],'#877451');
  const n=Math.ceil(w/.68);
  for(let i=0;i<n;i++) f.box(open?'timber':'metal',[x+(i+.5)*w/n-w/2,y+2.83,z],
    [open?.13:w/n+.015,.11,d+.25],open?'#9a8159':i%2?'#78938d':'#92a398',[open?0:.052,0,0]);
}

function roofDetails(f,b,w,d,h,rng){
  if(w<14||d<7)return;
  const y=h+.19,variant=({building7:0,northFlats:1,southFlats:2,westFlats:3})[b.id]??0;
  // Repaired tar bays and a service path give the large roofs a usable scale.
  for(let i=0;i<5;i++){
    const x=(i-2)*w*.178;
    f.box('roof',[x,y+.008,-d*.17],[w*.169,.031,d*.54],
      ['#a69983','#aea28d','#b2a590','#aba08b','#a39782'][(variant+i)%5]);
  }
  f.box('plaster',[0,y+.051,d*.117],[w*.84,.081,.77],'#bdb29a');
  const canopyW=Math.min(12,w*.22),canopyD=Math.min(7,d*.29);
  const cx=w*(variant%2===0?-.22:.15),cz=d*.25;
  roofCanopy(f,cx,y,cz,canopyW,canopyD,variant!==2);
  roofGarden(f,cx,y,cz-canopyD*.33,canopyW*.79,canopyD*.78,rng);
  roofGarden(f,w*.31,y,d*.25,Math.min(10,w*.17),Math.min(5,d*.22),rng);
  roofLaundry(f,w*(variant%2===0?.09:-.06),y,-d*.14,Math.min(12,w*.23),rng);
  const pipes=[[-w*.38,-d*.29],[w*.09,-d*.29],[w*.09,d*.09],[w*.40,d*.09]];
  for(let k=1;k<pipes.length;k++){
    const [ax,az]=pipes[k-1],[bx,bz]=pipes[k];
    for(const offset of [0,.25])f.beam('metal',[ax,y+.23,az+offset],[bx,y+.23,bz+offset],.13,'#a0a296');
    const supports=Math.ceil(Math.hypot(bx-ax,bz-az)/3);
    for(let j=0;j<supports;j++){
      const t=j/supports;f.box('plaster',[ax+(bx-ax)*t,y+.095,az+(bz-az)*t+.12],[.44,.19,.55],'#9f977f');
    }
  }
  const shaftX=-w*.065,shaftZ=d*.36;
  f.box('brick',[shaftX,y+.74,shaftZ],[2.22,1.46,1.64],'#a18b70');
  f.box('metal',[shaftX,y+1.52,shaftZ],[2.48,.16,1.92],'#888c80');
  for(let j=0;j<5;j++)f.box('metal',[shaftX,y+.49+j*.16,shaftZ+.84],[1.56,.065,.04],'#6f746a');
  const mx=-w*.37,mz=d*.36;
  f.drum('metal',[mx,y+1.98,mz],[.081,3.95,.081],'#777c70');
  f.beam('metal',[mx-1.56,y+3.65,mz],[mx+1.56,y+3.65,mz],.052,zinc);
  for(let j=0;j<8;j++)f.box('metal',[mx-1.40+j*.39,y+3.67,mz],[.038,.036,.50+j*.13],zinc);
  for(const side of [-1,1])f.beam('metal',[mx,y+2.64,mz],[mx+side*1.68,y+.12,mz+.58],.02,iron);
  if(variant===2||variant===3){
    const rx=-w*.31,rz=d*.10,rw=Math.min(w*.20,11),rd=Math.min(d*.16,6);
    f.box('plaster',[rx,y+.98,rz],[rw,1.95,rd],'#b6a68e');
    f.box('metal',[rx,y+2.06,rz],[rw+.46,.15,rd+.36],variant===2?'#718f88':'#a1886c',[.045,0,0]);
    f.box('paint',[rx,y+.88,rz+rd/2+.03],[1.03,1.72,.08],'#626e60');
  }
}

function airConditioner(f,x,y,z) {
  f.box('metal',[x,y,z+.15],[.87,.49,.35],'#c1bca5');
  f.drum('metal',[x-.14,y,z+.338],[.35,.046,.35],'#686e64',[Math.PI/2,0,0]);
  f.shape('ring','metal',[x-.14,y,z+.364],[.31,.31,.55],'#a5a79a');
  for(let i=0;i<4;i++) f.box('metal',[x+.205,y-.10+i*.065,z+.341],[.17,.016,.016],iron);
  for(const s of [-1,1]) f.box('metal',[x+s*.31,y-.30,z+.10],[.042,.09,.40],iron);
}

function rail(f,x,y,z,width,height,bars) {
  f.box('metal',[x,y+height,z],[width,.046,.055],'#847d66');
  f.box('metal',[x,y+.13,z],[width,.037,.043],iron);
  for(let i=0;i<=bars;i++) f.box('metal',[x-width/2+i*width/bars,y+height*.52,z],[.028,height,.028],iron);
}

function balcony(f,x,base,z,width,random) {
  f.box('plaster',[x,base+.02,z+.49],[width+.34,.15,1.02],stone);
  f.box('brick',[x,base+.24,z+.92],[width+.20,.38,.13],'#a58f72');
  for(const s of [-1,1]) {
    f.box('plaster',[x+s*(width/2+.03),base+.42,z+.42],[.12,.82,.92],stone);
    f.box('metal',[x+s*width*.37,base-.16,z+.31],[.09,.15,.65],iron);
  }
  rail(f,x,base+.32,z+.97,width,.69,Math.max(5,Math.round(width*2.9)));
  if(random()<.58){
    const h=base+1.70;
    f.beam('metal',[x-width*.47,h,z+.59],[x+width*.47,h-.04,z+.68],.022,'#514d40');
    for(let i=0;i<3;i++){
      const w=.43+random()*.22,clothH=.55+random()*.34;
      f.shape(i===1?'shirt':'cloth','cloth',[x+(i-1)*width*.265,h-clothH/2-.025,z+.68],
        [w,clothH,.72],washing[Math.floor(random()*washing.length)],[.055,(random()-.5)*.25,(random()-.5)*.09]);
    }
  } else {
    for(let i=0;i<3;i++){
      const px=x+(i-1)*width*.27;
      f.shape('pot','paint',[px,base+.63,z+.77],[.26,.25,.26],i%2?'#99633e':'#b79664');
      f.shape('dome','paint',[px,base+.84,z+.77],[.37,.28+random()*.15,.31],i%2?'#687741':'#586633');
    }
  }
}

function windowBay(f,x,floorY,z,width,balconied,random,floor) {
  const height=1.54, y=floorY+1.62, w=Math.min(width*(balconied?.71:.57),2.35);
  f.box('paint',[x,y,z+.034],[w+.22,height+.20,.12],'#706d5f');
  const lit=random()<.14;
  f.box('residentialWindow',[x,y,z+.104],[w,height,.035],
    lit?['#ffeed7','#ffdfa4','#ffedd0'][Math.floor(random()*3)]:['#f1f4e9','#efeee4','#d7e4df','#e4e2d5'][Math.floor(random()*4)]);
  f.box('metal',[x,y,z+.14],[.056,height,.045],'#bbb9a4');
  f.box('metal',[x,y+height*.22,z+.14],[w,.045,.045],'#b1aa94');
  f.box('plaster',[x,y-height*.5-.08,z+.16],[w+.35,.10,.32],stone);
  if(balconied) balcony(f,x,floorY+.46,z,w+.62,random);
  else if((floor===0 || random()<.38) && w>1.1) rail(f,x,y-height/2,z+.21,w+.09,height,6);
}

export function homes(kit,b,course,delivery=false) {
  const random=rngFor(b), target=delivery?course.finish:course.landmarks?.court ?? course.gate;
  const {frame:f,width:w,depth:d}=facadeFrame(kit,b,target);
  const h=b.h, wall=walls[Math.floor(random()*walls.length)];
  const layout=delivery ? createStairLayout(course) : null;
  const portalX=layout ? f.localPoint(layout.entrance).x : 0;
  const west=layout ? portalX-layout.halfWidth-.26 : 0;
  const east=layout ? portalX+layout.halfWidth+3.20 : 0;
  const courtBack=layout ? d/2-layout.depth-4.2 : 0;
  function courseOfWall(surface,y,height,overhang,tint) {
    const right=w/2+overhang, near=d/2+overhang;
    if(!layout){
      f.box(surface,[0,y,0],[right*2,height,near*2],tint);
      return;
    }
    // Two wings and the back range enclose a small, open-to-sky light court.
    // The roof, plinth and horizontal facade bands share the same opening.
    f.box(surface,[(west-right)/2,y,0],[west+right,height,near*2],tint);
    f.box(surface,[(east+right)/2,y,0],[right-east,height,near*2],tint);
    f.box(surface,[(west+east)/2,y,(courtBack-near)/2],[east-west,height,courtBack+near],tint);
  }
  courseOfWall('plaster',h/2,h,0,wall);
  courseOfWall('brick',.39,.78,.0375,'#867a66');
  courseOfWall('roof',h+.09,.19,.195,'#aaa28b');
  const floors=Math.max(1,Math.floor((h+.30)/2.85)), unit=h/floors;
  for(let floor=1;floor<floors;floor++)
    courseOfWall('plaster',floor*unit-.055,.10,.07,'#b2a48a');
  for(const side of [-1,1]){
    f.box('plaster',[0,h+.35,side*d/2],[w+.23,.45,.21],stone);
    f.box('plaster',[side*w/2,h+.35,0],[.21,.45,d+.23],stone);
  }
  for(let side=0;side<4;side++){
    const wallFrame=f.child([0,0,0],side*Math.PI/2);
    const span=side%2?d:w,z=(side%2?w:d)/2;
    const count=Math.max(1,Math.floor(span/3.9)),spacing=span/count;
    for(let bay=0;bay<count;bay++){
      const x=(bay+.5)*spacing-span/2;
      const hasBalcony=(side%2===0 || count>3) && (bay%3===1 || count===2&&bay===0);
      for(let floor=0;floor<floors;floor++){
        if(layout&&side===0&&x>west-1.45&&x<east+1.45) continue;
        windowBay(wallFrame,x,floor*unit,z,spacing,hasBalcony&&floor>0,random,floor);
        if(!hasBalcony&&spacing>3.2&&random()<.37) airConditioner(wallFrame,x+spacing*.34,floor*unit+.79,z+.02);
      }
    }
    if(span>7) wallFrame.drum('metal',[-span/2+.36,h/2,z+.12],[.10,h,.10],'#8b8975');
  }
  dressHousing(kit,b,f,w,d,h,floors,unit,layout?{west,east}:null);
  if(layout) {
    // Visible through the stair windows: inhabited rooms across the light court.
    const sideWall=f.child([east,0,d/2],-Math.PI/2);
    for(let floor=0;floor<floors;floor++){
      for(const x of [-4.65,-9.15]) windowBay(sideWall,x,floor*unit,0,3.9,false,random,floor);
      for(const x of [west+2.15,east-2.10]) windowBay(f,x,floor*unit,courtBack,3.8,floor%2===1,random,floor);
      if(floor%2===1) airConditioner(f,east-3.80,floor*unit+.88,courtBack);
    }
    const top=3*layout.floorHeight+.18;
    f.box('plaster',[(west+east)/2,(h+top)/2,d/2-1.36],[east-west,h-top,2.72],wall);
    for(const x of [portalX-1.65,portalX+2.62]) windowBay(f,x,top,d/2,3.7,false,random,3);
    f.box('roof',[(west+east)/2,h+.09,d/2-1.36],[east-west+.12,.19,2.98],'#aaa28b');
    buildStairInterior(kit,layout);
  }
  else {
    f.box('paint',[0,1.19,d/2+.08],[1.35,2.38,.19],'#54594e');
    f.box('plaster',[0,2.52,d/2+.37],[1.96,.125,.78],stone);
  }
  const diameter=Math.min((b.id==='westFlats'?5.12:b.id==='southFlats'?4.61:4.08),d*.28,w*.19);
  if(diameter>.85) {
    tank(f,-w*.27,h+.20,-d*.16,diameter);
    if(w>19&&b.id!=='westFlats') tank(f,-w*.27+diameter*1.23,h+.20,-d*.16,diameter*.87);
  }
  if(w>9&&d>4){
    const rw=Math.min(w*.20,11.5),rd=Math.min(d*.27,6.5);
    f.box('brick',[w*.26,h+1.42,-d*.22],[rw,2.60,rd],'#ad9d80');
    f.box('roof',[w*.26,h+2.82,-d*.22],[rw+.40,.22,rd+.40],'#928570');
    f.box('metal',[w*.26-rw*.22,h+1.19,-d*.22+rd/2+.04],[1.05,2.0,.08],'#667367');
    f.box('glazing',[w*.26+rw*.16,h+1.55,-d*.22+rd/2+.04],[1.47,.88,.10],'#a7aea0');
    f.beam('metal',[-w*.25,h+.40,0],[w*.25,h+.40,0],.10,zinc);
    for(let i=0;i<3;i++){
      const x=w*.04+i*.92;f.box('timber',[x,h+.39,d*.27],[.77,.33,.62],'#856a45');
      f.shape('dome','paint',[x,h+.68,d*.27],[.91,.48,.66],i%2?'#798345':'#596b36');
    }
  }
  roofDetails(f,b,w,d,h,random);
}

function steamer(f,x,y,z,r,layers,open=false) {
  for(let i=0;i<layers;i++){
    const level=y+i*.17;
    f.drum('timber',[x,level+.08,z],[r,.155,r],'#d3a266');
    f.drum('paint',[x,level+.025,z],[r*1.015,.025,r*1.015],'#aa7842');
    f.drum('paint',[x,level+.144,z],[r*1.016,.018,r*1.016],'#e0b47d');
  }
  const top=y+layers*.17;
  if(open){
    f.drum('timber',[x,top-.012,z],[r*.86,.025,r*.86],'#947044');
    for(let j=0;j<5;j++){
      const a=j*fullTurn/5,px=x+Math.cos(a)*r*.23,pz=z+Math.sin(a)*r*.23;
      f.shape('dome','paint',[px,top+.055,pz],[r*.26,.14,r*.25],'#eedcb4');
      f.shape('dome','paint',[px+.01,top+.12,pz],[.05,.038,.045],'#ddc79e');
    }
  }else{
    f.shape('dome','timber',[x,top,z],[r*.98,.16,r*.98],'#c59152');
    f.shape('ring','metal',[x,top+.078,z],[.10,.083,.10],'#786044');
    for(const side of [-1,1])f.box('timber',[x+side*r*.18,top+.067,z],[.033,.019,r*.71],'#dac095');
  }
}

export function market(kit,b,course) {
  const {frame:f,width:w,depth:d}=facadeFrame(kit,b,course.pickup??course.gate);
  const front=d/2,h=b.h;
  const recess=Math.min(1.45,d*.26);
  f.box('brick',[0,h/2,-recess/2],[w,h,d-recess],'#a58a69');
  f.box('brick',[0,h-.48,front-recess/2],[w,.96,recess],'#af9372');
  f.box('plaster',[0,.09,front-recess/2],[w,.19,recess+.16],'#aa9a7c');
  const count=Math.max(1,Math.min(5,Math.round(w/6.8))), bay=w/count;
  const target = course.pickup ?? course.gate;
  const local = f.localPoint(target);
  const actual=Math.max(0,Math.min(count-1,Math.floor((local.x+w/2)/bay)));
  const pickupMarket=!course.landmarks?.market || course.landmarks.market.id===b.id;
  const names=['巷口早点','阿婆面馆','鲜肉生煎','广式茶点','糖水铺'];
  for(let i=0;i<count;i++){
    const x=-w/2+(i+.5)*bay, pick=pickupMarket&&i===actual;
    const back=front-recess+.10;
    f.box('brick',[x,1.55,back],[bay-.25,2.84,.14],pick?'#c6b493':'#a9a68b');
    f.box('metal',[x,2.19,back+.18],[bay*.83,.085,.36],'#807e6e');
    for(let j=0;j<6;j++){
      const sx=x+(j-2.5)*bay*.108,jar=.18+(j%3)*.064;
      f.drum('glazing',[sx,2.24+jar*.50,back+.24],[.15,jar,.15],['#a08054','#807e65','#944f37'][j%3]);
      f.drum('metal',[sx,2.24+jar,back+.24],[.156,.035,.156],zinc);
    }
    for(let k=0;k<3;k++) f.box('timber',[x+(k-1)*bay*.29,1.73,front+.18],[.10,2.98,.12],'#795536');
    const awning=Math.min(2.05,d*.28+.72), top=Math.min(h-.2,3.60);
    f.box('metal',[x,top,front+awning*.5],[bay-.10,.12,awning],pick?'#a54130':'#963d2f',[.17,0,0]);
    const strips=Math.max(6,Math.round(bay/.43));
    for(let j=0;j<strips;j++){
      const sx=x-bay*.5+(j+.5)*bay/strips;
      f.box('paint',[sx,top+.075,front+awning*.5],[bay/strips-.015,.03,awning],
        j%2?'#dcbf9e':'#b84a3a',[.17,0,0]);
      f.box('cloth',[sx,top-awning*.085-.16,front+awning*.985],[bay/strips,.34,.045],
        j%2?'#d7b397':'#a44938');
    }
    f.shape('panel',kit.sign(pick?(b.label??target.label??'红棚烧腊'):names[i],pick?'烧味 · 外卖取餐':'街坊食铺',
      pick?'#803727':'#64503b'),[x,top+.48,front+.11],[Math.min(bay-.22,5.6),.90,1]);
    f.box('metal',[x,.59,front+.57],[bay*.70,1.18,.98],'#7c7e70');
    f.box('metal',[x,1.215,front+.57],[bay*.74,.09,1.06],'#b2ad98');
    for(const side of [-1,1]){
      f.box('metal',[x+side*bay*.164,.65,front+1.075],[bay*.308,.82,.045],side<0?'#94968a':'#868b7f');
      f.box('metal',[x+side*.17,.89,front+1.103],[.17,.039,.048],'#555d52');
    }
    f.box('paint',[x,.145,front+.99],[bay*.69,.09,.12],'#52594e');
    steamer(f,x-bay*.20,1.27,front+.61,.65,3);
    steamer(f,x+.14,1.27,front+.60,.75,2,true);
    if(i%2===0||pick)steamer(f,x+bay*.20,1.27,front+.48,.57,4);
    else {
      f.drum('metal',[x+bay*.20,1.51,front+.48],[.53,.48,.53],'#bcc0ad');
      f.shape('dome','metal',[x+bay*.20,1.78,front+.48],[.57,.12,.57],'#9fa99e');
    }
    f.box('metal',[x-bay*.27,2.48,front+.31],[1.25,.22,.53],'#979889');
    f.drum('metal',[x-bay*.28,2.87,front+.27],[.17,.64,.17],'#abac9d');
    f.drum('metal',[x+bay*.16,1.28,front+.85],[.37,.072,.35],'#464c43');
    f.shape('dome','metal',[x+bay*.16,1.34,front+.84],[.41,.11,.40],'#a7aa97');
    f.box('metal',[x+bay*.17,1.085,front+1.135],[.77,.12,.065],'#72796e');
    for(const side of [-1,1])f.drum('paint',[x+bay*.17+side*.19,1.08,front+1.18],[.087,.055,.087],'#494b40',[Math.PI/2,0,0]);
    f.box('plaster',[x,.079,front+.70],[bay-.08,.16,1.68],'#c5b399');
    if(pick){
      const blade=f.child([x+bay*.42,0,front+.84],Math.PI/2);
      blade.box('metal',[0,3.36,0],[1.64,1.28,.16],'#77513b');
      const sign=kit.sign('红棚烧腊','取 餐 口','#973b29','#ffe4af');
      blade.shape('panel',sign,[0,3.36,.09],[1.57,1.20,1]);
      blade.shape('panel',sign,[0,3.36,-.09],[1.57,1.20,1],'#ffffff',[0,Math.PI,0]);
    }
    for(const s of [-1,1]){
      f.drum('metal',[x+s*(bay*.5-.17),1.52,front+awning-.12],[.057,3.04,.057],'#7e7261');
      f.shape('dome','glow',[x+s*bay*.28,2.87,front+.52],[.22,.17,.22],'#ffda96');
    }
  }
  const pitch=.102,roofY=h+.14+d*.052;
  f.box('metal',[0,roofY,0],[w+.48,.17,d+.52],'#a44838',[pitch,0,0]);
  const sheets=Math.ceil(w/1.06);
  for(let i=0;i<sheets;i++){
    const sx=(i+.5)*w/sheets-w/2;
    f.box('paint',[sx,roofY+.10,0],[w/sheets-.015,.035,d+.48],
      ['#b65442','#ae4a3a','#b95d49','#a8493b','#ae5141'][i%5],[pitch,0,0]);
    f.box('metal',[sx-w/sheets*.47,roofY+.14,0],[.052,.057,d+.48],'#c6775c',[pitch,0,0]);
  }
  for(const side of [-1,1]){
    const face=f.child([side*w/2,0,0],side*Math.PI/2);
    face.box('plaster',[0,h*.47,.05],[d-.20,h*.87,.15],'#b4a38b');
    for(let i=0;i<3;i++){
      const x=(i-1)*d*.26;
      face.box('metal',[x,2.02,.14],[1.61,1.09,.13],'#73786a');
      for(let j=0;j<6;j++)face.box('metal',[x,1.64+j*.14,.23],[1.50,.055,.065],'#9a9b8a');
    }
    face.shape('panel',kit.sign(pickupMarket?'红棚烧腊':'街坊食铺','早 点   ·   蒸 笼   ·   热 食','#8b3a2d'),[0,h-.49,.15],[Math.min(9,d*.66),1.23,1]);
  }
}

export function booth(kit,b,course) {
  const {frame:f,width:w,depth:d}=facadeFrame(kit,b,course.gate);
  const h=b.h;
  f.box('brick',[0,h/2,0],[w,h,d],'#b8a88a');
  for(const side of [0,1,3]){
    const face=f.child([0,0,0],side*Math.PI/2), span=side===0?w:d, front=(side===0?d:w)/2;
    face.box('metal',[0,h*.59,front+.036],[span*.86,h*.43,.11],'#6e7568');
    face.box('glazing',[0,h*.59,front+.109],[span*.79,h*.36,.04],side===0?'#e3c995':'#b9c1ad');
    for(let i=1;i<=3;i++)face.box('metal',[(i/4-.5)*span*.84,h*.59,front+.14],[.052,h*.39,.045],zinc);
  }
  f.box('metal',[0,h+.07,0],[w+.64,.19,d+.64],'#657c7c');
  f.box('metal',[0,h+.19,0],[w+.41,.09,d+.41],'#819492');
  f.shape('panel',kit.sign('保安岗亭','牛角里 · 门卫室','#394f46'),[0,h-.20,d/2+.08],[Math.min(w*.83,2.6),.62,1]);
  f.box('glow',[0,h-.41,d/2+.20],[.92,.067,.16],'#f2d196');
}

export function wall(kit,b) {
  const f=kit.frame.child([b.x,0,b.z],b.w>=b.d?0:Math.PI/2);
  const width=Math.max(b.w,b.d), depth=Math.min(b.w,b.d), h=b.h;
  f.box('brick',[0,h*.42,0],[width,h*.84,depth],'#b5a386');
  f.box('plaster',[0,h*.83,0],[width+.10,.14,depth+.15],stone);
  const n=Math.max(1,Math.round(width/4.3));
  for(let i=0;i<=n;i++){
    const x=(i/n-.5)*(width-Math.min(.44,width*.35));
    f.box('plaster',[x,h*.51,0],[Math.min(.48,width),h*1.02,Math.max(.48,depth+.12)],'#b8ad95');
    f.box('plaster',[x,h*1.04,0],[Math.min(.56,width+.09),.10,Math.max(.58,depth+.21)],'#cac0a8');
  }
}

export function gateHardware(kit,course,posts) {
  const gate=course.gate;
  if(!gate) return;
  for(const b of posts){
    kit.frame.box('plaster',[b.x,b.h/2,b.z],[b.w,b.h,b.d],'#b8ad91');
    kit.frame.box('plaster',[b.x,b.h+.06,b.z],[b.w+.14,.15,b.d+.14],stone);
  }
  if(!posts.length) return;
  const near=[...posts].sort((a,b)=>Math.hypot(a.x-gate.x,a.z-gate.z)-Math.hypot(b.x-gate.x,b.z-gate.z));
  const p=near[0], dx=gate.x-p.x, dz=gate.z-p.z, reach=Math.min(6.0,Math.max(2.4,Math.hypot(dx,dz)*1.45));
  const base=new THREE.Group();base.position.set(p.x,1.13,p.z);base.rotation.y=Math.atan2(-dz,dx);
  const arm=new THREE.Group();arm.name='estateGateArm';arm.rotation.z=1.24;
  const a=kit.art;
  a.box(arm,'#e8dabe',[reach/2,0,0],[reach,.15,.13]);
  for(let x=.33;x<reach-.18;x+=.8)a.box(arm,'#b94434',[x,.002,0],[.38,.159,.138]);
  a.batch(arm,true);base.add(arm);kit.root.add(base);
  kit.frame.box('metal',[p.x,1.05,p.z],[Math.max(.62,p.w),.65,Math.max(.60,p.d)],'#c79754');
}

export function skyline(kit,course) {
  const {minX,maxX,minZ,maxZ}=course.bounds;
  const f=kit.frame;
  const windowMaterial = kit.material.residentialWindow;
  const glassTints = ['#d3dfdf', '#b0c0b7', '#e1ddd0', '#b6c3bf'];
  for(let side=0;side<4;side++){
    const alongX=side%2===0, length=alongX?maxX-minX:maxZ-minZ;
    const count=Math.ceil(length/18)+3;
    for(let i=0;i<count;i++){
      const along=(i-.70)*length/(count-2),offset=12+((i*7+side*13)%23);
      const x=alongX?minX+along:(side===1?maxX+offset:minX-offset);
      const z=alongX?(side===0?minZ-offset:maxZ+offset):minZ+along;
      const block={x,z}, rng=rngFor(block), w=10+rng()*8,d=9+rng()*8;
      const floors=3+Math.floor(rng()*6),h=floors*2.88;
      const frame=f.child([x,0,z],alongX?0:Math.PI/2);
      frame.box('plaster',[0,h/2,0],[w,h,d],['#b5ad9b','#b7a48c','#b29d88'][i%3]);
      frame.box('roof',[0,h+.21,0],[w+.32,.43,d+.32],'#9e9a88');
      frame.box('plaster',[w*.20,h+.99,0],[w*.36,1.60,d*.42],'#a69d88');
      const facing=side===0||side===3?1:-1;
      const street = frame.child([0, 0, 0], facing > 0 ? 0 : Math.PI);
      const returns = [-1, 1].map(end => street.child([end * w / 2, 0, 0], end * Math.PI / 2));
      const faceZ = d / 2 + .045;
      if(offset<27)skylineBalconies(street,w,faceZ,floors,i+side);
      const windowWidth = Math.min(2.05, w * .137);
      for (let floor = 0; floor < floors; floor++) {
        const level = 1.60 + floor * 2.88;
        for (let bay = 0; bay < 4; bay++) {
          const x = (bay - 1.5) * w * .22;
          const warm = (floor * 7 + bay * 3 + i) % 11 === 0;
          const tint = warm ? '#f9c996' : glassTints[(bay + floor + i) % glassTints.length];
          street.shape('panel', windowMaterial, [x, level, faceZ], [windowWidth, 1.53, 1], tint);
          if ((bay + floor + i) % 2 === 0) {
            street.box('plaster', [x, level - .77, faceZ + .093], [windowWidth + .18, .115, .27], stone);
          }
        }
        for (const end of returns) {
          end.shape('panel', windowMaterial, [0, level - .24, .045], [1.14, 1.24, 1], '#c0cbc1');
        }
      }
      if (i % 2 === 0) {
        const pipeX = w * .432;
        street.box('metal', [pipeX, h / 2, faceZ + .07], [.11, h, .12], '#8c8e7d');
        for (let y = 1.20; y < h; y += 5.76) {
          street.box('metal', [pipeX, y, faceZ + .088], [.16, .074, .15], iron);
        }
      }
    }
  }
}
