import * as THREE from 'three';
import { TAU, sides, sideName, node, grid, loft, flank, sectionAt, detailUV } from './courier-geometry.js';
import { buildHead } from './courier-head.js';

const pants='#504b47';
const thighLength=.391, shinLength=.344, upperLength=.293, foreLength=.284;
const torsoRows=[
  [-.029,.148,.092,.027],[.003,.160,.096,.030],[.027,.163,.100,.034],
  [.057,.157,.099,.039],[.104,.169,.110,.045],[.191,.175,.119,.060],
  [.285,.184,.125,.083],[.360,.196,.124,.105],[.403,.209,.116,.119],
  [.435,.196,.107,.128],[.461,.156,.096,.136],[.486,.090,.076,.142],
];

function jacket(k,m,torso) {
  const { put,tube,box }=k;
  put(torso,m.jacket,loft(torsoRows,{power:.89,cols:44}));
  const surface=(x,y,back,margin)=>{
    const [,w,d,c]=sectionAt(torsoRows,y);
    const z=d*Math.pow(Math.max(.001,1-Math.abs(x/w)**(2/.89)),.89/2);
    return [x,y,c+(back?-1:1)*(z+margin)];
  };
  for(const back of [false,true]) {
    const strap=(u,v,margin=.005)=>{
      const y=-.004+.458*v, x=-.131+.263*v+(u-.5)*.036;
      return surface(x,y,back,margin);
    };
    put(torso,m.cloth,grid(5,32,(u,v)=>strap(u,v),{flip:back}), '#393336');
    for(const u of [.06,.94]) {
      const pts=[]; for(let i=0;i<=23;i++) pts.push(strap(u,i/23,.0062));
      tube(torso,m.cloth,'#63574c',pts,.0013,24,4);
    }
    const at=back?.686:.623;
    for(const [u0,v0,u1,v1] of [
      [-.09,at,1.09,at],[-.09,at+.095,1.09,at+.095],[-.09,at,-.09,at+.095],
      [1.09,at,1.09,at+.095],[-.05,at+.034,1.05,at+.034],
    ]) {
      const pts=[];
      for(let i=0;i<5;i++) pts.push(strap(THREE.MathUtils.lerp(u0,u1,i/4),
        THREE.MathUtils.lerp(v0,v1,i/4),.009));
      tube(torso,m.rubber,'#534c47',pts,.0033,6,6);
    }
  }
  for(const s of sides) {
    const hem=[];
    for(let j=0;j<16;j++) {
      const a=s*(.17+j*.17);
      hem.push([.163*Math.sin(a),.018+.003*Math.cos(6*a),.034+.101*Math.cos(a)]);
    }
    tube(torso,m.cloth,'#977239',hem,.0018,19,4);
  }
  put(torso,m.cloth,loft([[.427,.083,.063,.143],[.466,.080,.066,.143],
    [.511,.071,.061,.145],[.521,.066,.057,.147]],{cols:24}),'#393b35');
  // A hollow, fallen hood. The lowest fold hangs between the shoulder blades.
  function hood(u,v,inside=false) {
    const a=.64+(TAU-1.28)*u,c=Math.cos(a),s=Math.sin(a);
    const fullness=Math.sin(Math.PI*v), ripples=.004*Math.sin(6*a+1.7*v);
    const w=.081+.034*(1-v)+.067*fullness+ripples;
    const rear=Math.max(0,-c);
    const depth=.075+.057*(1-v)+(.052+.033*rear)*fullness;
    const bottom=.424-.092*rear+.014*Math.cos(a*2);
    const y=THREE.MathUtils.lerp(bottom,.516-.018*Math.max(0,c),v)+.011*Math.sin(3*a+v)
      +.006*Math.sin(7*a+v*3)*fullness;
    const inset=inside?.005:0;
    return [(w-inset)*s,y-(inside?.003:0),.127+(depth-inset)*c];
  }
  put(torso,m.detail,detailUV(grid(32,8,(u,v)=>hood(u,v)),4));
  put(torso,m.cloth,grid(28,4,(u,v)=>hood(u,.65+.35*v,true),{flip:true}),'#655338');
  const edge=[]; for(let i=0;i<=37;i++) edge.push(hood(i/37,1));
  tube(torso,m.cloth,'#b98538',edge,.0044,42,6);
  const seam=[]; for(let i=0;i<=12;i++) seam.push(hood(.5,i/12));
  tube(torso,m.cloth,'#b68539',seam,.0018,14,5);
  for(const u of [0,1]) {
    const pts=[]; for(let i=0;i<=9;i++) pts.push(hood(u,i/9));
    tube(torso,m.cloth,'#ad803e',pts,.003,14,5);
  }
  box(torso,m.metal,'#ad8e53',[0,.361,.231],[.007,.022,.005],.001);
}

// A sewn surface patch follows the circumference and all the folds of its sleeve or leg.
function clothPatch(k,parent,mat,rows,angle,width,low,high,color,lift=.002,bulge=0,chart) {
  const cut=[low,...rows.map(row=>row[0]).filter(y=>y>low&&y<high),high];
  const g=grid(8,cut.length-1,(u,v,j)=>{
    const y=cut[j], [,w,d,c=0]=sectionAt(rows,y),a=angle+(u-.5)*width;
    const space=lift+bulge*Math.sin(Math.PI*u)*Math.sin(Math.PI*v);
    return [(w+space)*Math.sin(a),y,c+(d+space)*Math.cos(a)];
  });
  k.put(parent,mat,chart===undefined?g:detailUV(g,chart),color);
}

function trouserLeg(k,m,bones,s) {
  const { put,tube }=k, {upper,lower,end}=bones;
  const thigh=[
    [-thighLength-.015,.044,.046,.002],[-.378,.073,.071,.000],[-.352,.081,.082,.001],
    [-.303,.078,.084,.002],[-.245,.080,.087,.000],[-.160,.087,.095,-.003],
    [-.084,.089,.099,-.008],[-.023,.081,.092,-.010],[.039,.056,.065,-.011],
  ];
  put(upper,m.detail,detailUV(loft(thigh,{cols:22}),2,s<0));
  const out=s*Math.PI/2;
  clothPatch(k,upper,m.detail,thigh,out,1.48,-.285,-.125,'#b9b5af',.003,.008,7);
  clothPatch(k,upper,m.cloth,thigh,out,1.54,-.166,-.119,'#5b554d',.010,.004);
  const hem=[];
  for(let i=0;i<=12;i++) {
    const a=out+(i/12-.5)*1.46;
    hem.push([.089*Math.sin(a),-.169,.094*Math.cos(a)]);
  }
  tube(upper,m.cloth,'#968166',hem,.0016,14,4);
  const shin=[
    [-shinLength+.025,.036,.038,-.003],[-.306,.039,.043,-.003],[-.294,.040,.045,-.002],
    [-.280,.054,.051,-.004],[-.264,.057,.052,-.006],[-.248,.052,.050,-.004],
    [-.227,.059,.056,.000],[-.192,.063,.061,-.004],[-.146,.065,.062,-.006],
    [-.107,.067,.064,-.004],[-.062,.069,.067,.001],[-.022,.072,.072,.004],
    [.015,.067,.062,.005],[.047,.036,.039,.001],
  ];
  put(lower,m.detail,detailUV(loft(shin,{cols:20}),3,s<0));
  clothPatch(k,lower,m.detail,shin,0,1.29,-.088,.006,'#b5b1a9',.003,.003,7);
  clothPatch(k,lower,m.cloth,shin,out, .075,-.271,-.056, '#947c57',.002);
  put(lower,m.cloth,loft([[-.323,.035,.038,0],[-.315,.039,.042,0],[-.292,.042,.043,0]],
    {cols:20}),'#44413c');
  shoe(k,m,end,s);
}

function shoe(k,m,foot,s) {
  const { put,tube,box }=k;
  k.egg(foot,m.cloth,'#837563',[0,.022,-.006],[.034,.045,.039]);
  const sole=[[-.087,.022,.010,-.055],[-.076,.043,.017,-.055],[-.046,.048,.019,-.055],
    [.000,.045,.016,-.057],[.042,.048,.014,-.056],[.091,.055,.016,-.057],
    [.137,.053,.015,-.054],[.162,.040,.013,-.047],[.177,.020,.008,-.038]];
  put(foot,m.rubber,loft(sole,{axis:'z',power:.54,cols:20}), '#b7a07e');
  const outsole=sole.map(([z,w,h,y])=>[z,w*.987,.0058,y-h+.004]);
  put(foot,m.rubber,loft(outsole,{axis:'z',power:.50,cols:20}), '#776b5b');
  for(const z of [-.061,-.037,.061,.085,.112,.138]) {
    for(const q of sides) {
      box(foot,m.rubber,'#695e51',[q*.022,z<.12?-.071:-.066,z],[.032,.005,.010],0,[0,q*.28,0]);
    }
  }
  const upper=[[-.081,.028,.027,-.014],[-.066,.044,.042,-.001],[-.041,.044,.047,.002],
    [-.015,.044,.049,.004],[.011,.045,.050,.005],[.047,.048,.041,-.001],
    [.083,.050,.033,-.009],[.125,.050,.024,-.018],[.151,.045,.019,-.020],[.172,.022,.009,-.027]];
  put(foot,m.cloth,loft(upper,{axis:'z',power:.84,cols:20}), '#a6957f');
  for(const q of sides) {
    put(foot,m.detail,detailUV(flank(upper,[[-.078,-.72,.55],[-.044,-.76,.82],
      [.033,-.78,.80],[.103,-.80,.72],[.150,-.68,.65],[.168,-.39,.46]],q,.84,.0028),6));
    const pts=[[-.069,.011],[-.043,.020],[-.018,.003],[.002,-.006],[.039,.015],[.073,-.001],[.100,-.018]]
      .map(([z,y])=>[q*(sectionAt(upper,z)[1]+.001),y,z]);
    tube(foot,m.cloth,'#c4af90',pts,.0017,14,4);
  }
  for(let i=0;i<4;i++) {
    const z=.009+i*.019, y=.054-i*.007;
    tube(foot,m.cloth,'#d3c0a2',[[-.026,y-.013,z],[0,y+.002,z+.007],[.025,y-.013,z+.016]],.0027,8,5);
    tube(foot,m.cloth,'#bfae91',[[.025,y-.014,z],[0,y,z+.007],[-.026,y-.014,z+.016]],.0025,8,5);
  }
  tube(foot,m.cloth,'#c5b096',[[s*.021,.050,.011],[s*.041,.054,-.004],
    [s*.043,.045,.012],[s*.021,.050,.011],[s*.032,.039,.033]],.0022,11,5);
}

function sleeve(k,m,bones,s) {
  const { put,egg,tube }=k, {upper,lower,end}=bones;
  const arm=[[-upperLength-.014,.045,.044,.001],[-.285,.060,.060,0],[-.269,.068,.064,.001],
    [-.248,.062,.062,-.003],[-.220,.066,.065,-.002],[-.168,.067,.068,-.001],
    [-.113,.072,.073,0],[-.064,.079,.078,.001],[-.019,.077,.078,0],
    [.016,.063,.068,0],[.043,.027,.038,0]];
  put(upper,m.detail,detailUV(loft(arm,{cols:22}),0,s>0));
  clothPatch(k,upper,m.cloth,arm,-s*1.48,.74,-.264,-.051,'#575245',.0032);
  const fore=[[-.172,.043,.043,0],[-.163,.048,.050,0],[-.149,.057,.056,-.002],
    [-.135,.052,.052,-.003],[-.124,.060,.057,-.002],[-.105,.061,.058,0],
    [-.086,.055,.054,.001],[-.058,.061,.060,.000],[-.020,.064,.061,.000],
    [.018,.058,.056,0],[.039,.037,.040,.001]];
  put(lower,m.detail,detailUV(loft(fore,{cols:20}),1,s>0));
  clothPatch(k,lower,m.detail,fore,s*1.87,1.14,-.075,.012,'#efdbc0',.0035,.001,7);
  put(lower,m.cloth,loft([[-.185,.039,.040,0],[-.176,.045,.046,0],[-.153,.046,.046,0]],
    {cols:20}),'#47443b');
  put(lower,m.skin,loft([[-foreLength-.011,.024,.019,0],[-.248,.026,.020,0],
    [-.206,.032,.026,0],[-.170,.037,.032,0]],{cols:20}), '#bc8c70');
  egg(end,m.rubber,'#453e3c',[0,.004,.023],[.033,.022,.041]);
  egg(end,m.cloth,'#5b5148',[0,.019,.039],[.028,.011,.027],[-.16,0,s*.11]);
  for(let i=0;i<4;i++) {
    const x=s*(i-1.5)*.0135,z=.049+.004*Math.sin(i);
    tube(end,m.rubber,'#48403a',[[x,.013,z],[x,.008,z+.014],[x,-.007,z+.020]],.0070,7,6);
    tube(end,m.skin,'#bc896a',[[x,-.006,z+.019],[x,-.016,z+.015],[x,-.020,z+.009]],.0056,6,6);
  }
  tube(end,m.rubber,'#453e38',[[-s*.023,.006,.020],[-s*.035,-.005,.028],[-s*.031,-.014,.043]],.009,9,6);
}

function chain(parent,name,labels,s,offset,l1,l2) {
  const suffix='.'+sideName(s);
  const upper=node(parent,labels[0]+suffix,offset,true);
  const lower=node(upper,labels[1]+suffix,[0,-l1,0],true);
  const end=node(lower,labels[2]+suffix,[0,-l2,0],true);
  return { name,upper,lower,end,l1,l2 };
}

// Solve in the first joint's parent space. Both rigid bone lengths are invariant;
// the pole selects the bend plane, and the wrist/ankle keeps its independent rotation.
export function limbSolver() {
  const axis=new THREE.Vector3(), bend=new THREE.Vector3(), x=new THREE.Vector3(), y=new THREE.Vector3();
  const z=new THREE.Vector3(), knee=new THREE.Vector3(), tip=new THREE.Vector3();
  const basis=new THREE.Matrix4(), upperQ=new THREE.Quaternion(), lowerQ=new THREE.Quaternion();
  function rotation(relative,out) {
    y.copy(relative).normalize().negate(); z.crossVectors(x,y).normalize();
    out.setFromRotationMatrix(basis.makeBasis(x,y,z));
  }
  return (limb,target,pole,endQ)=>{
    const {upper,lower,end,l1,l2}=limb;
    axis.copy(target).sub(upper.position);
    const d=THREE.MathUtils.clamp(axis.length(),Math.abs(l1-l2)+.0001,l1+l2-.0001);
    axis.normalize();
    bend.copy(pole).addScaledVector(axis,-pole.dot(axis)).normalize();
    const a=(l1*l1-l2*l2+d*d)/(2*d);
    knee.copy(axis).multiplyScalar(a).addScaledVector(bend,Math.sqrt(Math.max(0,l1*l1-a*a)));
    tip.copy(axis).multiplyScalar(d).sub(knee);
    x.crossVectors(bend,axis).normalize();
    if(limb.name==='arm') x.negate();
    rotation(knee,upperQ); rotation(tip,lowerQ);
    upper.quaternion.copy(upperQ);
    lower.quaternion.copy(upperQ).invert().multiply(lowerQ);
    end.quaternion.copy(lowerQ).invert().multiply(endQ);
  };
}

export function buildRider(k,m,mounts,stem) {
  const rider=node(mounts.seat,'rider'), pelvis=node(rider,'pelvis',[0,.043,0],true);
  const torso=node(pelvis,'spine',[0,.038,.008],true);
  k.put(pelvis,m.cloth,loft([[-.072,.093,.094,-.007],[-.047,.142,.121,-.004],
    [.003,.161,.122,0],[.053,.149,.109,.012],[.082,.125,.091,.017]],{power:.85}),pants);
  jacket(k,m,torso);
  k.put(torso,m.skin,loft([[.474,.067,.054,.146],[.491,.063,.053,.148],
    [.533,.049,.046,.151],[.569,.046,.044,.154],[.586,.045,.046,.158]],{cols:28}),'#b38366');
  const headAnchor=node(torso,'headAnchor',[0,.568,.161],true);
  const localHead=node(headAnchor,'localHead');
  buildHead(k,m,localHead);
  const legs={}, arms={};
  for(const s of sides) {
    const key=sideName(s);
    legs[key]=chain(pelvis,'leg',['hip','knee','ankle'],s,[s*.119,.016,-.011],thighLength,shinLength);
    arms[key]=chain(torso,'arm',['shoulder','elbow','wrist'],s,[s*.185,.411,.133],upperLength,foreLength);
    trouserLeg(k,m,legs[key],s);
    sleeve(k,m,arms[key],s);
  }

  const solve=limbSolver(), target=new THREE.Vector3(), pole=new THREE.Vector3();
  const endQ=new THREE.Quaternion(), reverse=new THREE.Quaternion(), frameQ=new THREE.Quaternion();
  const euler=new THREE.Euler(0,0,0,'YXZ');
  let lastTime, lastSide=0, start=0;
  function updatePose(kick=0,elapsed=0) {
    const t=Number.isFinite(elapsed)?elapsed:0;
    const signal=THREE.MathUtils.clamp(Number.isFinite(kick)?kick:0,-1,1), side=Math.sign(signal);
    if(lastTime===undefined || t<lastTime) { start=t; lastTime=t; lastSide=0; }
    if(side!==lastSide) start=lastTime;
    const extension=Math.min(THREE.MathUtils.smoothstep(t-start,0,.129),
      THREE.MathUtils.smoothstep(Math.abs(signal),0,1));
    lastSide=side; lastTime=t;
    const steer=stem.rotation.y, active=-side*extension, turn=Math.abs(Math.sin(steer));
    torso.position.set(-.124*Math.sin(steer)-active*.019,.038+.002*Math.sin(t*2.8),
      .008+.132*turn*turn);
    torso.rotation.set(.038+turn*.43,steer*.81,-active*.045,'YXZ');
    headAnchor.rotation.set(-.042-turn*.12,.14-steer*.25+active*.12,active*.028,'YXZ');
    torso.updateWorldMatrix(true,false);
    torso.getWorldQuaternion(reverse).invert();
    for(const s of sides) {
      const key=sideName(s), e=s===-side?extension:0, chamber=Math.sin(Math.PI*e);
      const peg=mounts.footrests[key], grip=mounts.grips[key];
      peg.getWorldPosition(target); pelvis.worldToLocal(target);
      target.x+=s*(.648*e+.037*chamber);
      target.y+=.074+.356*e+.115*chamber;
      target.z+=-.014-.187*e+.010*chamber;
      pole.set(s*(.22+.78*e),.05+.24*e,1-.45*e);
      endQ.setFromEuler(euler.set(-.015-.23*e,s*(.060+.99*e),s*(.025+.82*e),'YXZ'));
      solve(legs[key],target,pole,endQ);

      grip.getWorldQuaternion(frameQ);
      grip.localToWorld(target.set(0,.004,-.050));
      torso.worldToLocal(target);
      endQ.copy(reverse).multiply(frameQ);
      pole.set(s*.60,-1,-.31);
      solve(arms[key],target,pole,endQ);
    }
  }
  updatePose(0,0);
  return { rider,headAnchor,localHead,legs,arms,updatePose };
}
