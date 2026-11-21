import * as THREE from 'three';
import { buildHead } from './courier-head.js';
import { detailUV, grid, loft, node, sectionAt } from './courier-geometry.js';
import { limbSolver } from './courier-rider.js';

export function makeMealBag(k, m, art) {
  const bag = node(null, 'sealedMealBag');
  const fold = [
    [-.304,.091,.055,0],[-.298,.102,.066,0],[-.282,.105,.068,0],
    [-.235,.108,.069,.001],[-.167,.106,.066,-.001],[-.119,.103,.040,0],
    [-.097,.101,.015,0],[-.087,.100,.012,0],
  ];
  const fiber=document.createElement('canvas');fiber.width=fiber.height=192;
  const grain=fiber.getContext('2d'), pixels=grain.createImageData(192,192);
  let seed=313;
  for (let y=0;y<192;y++) for (let x=0;x<192;x++) {
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const streak=Math.sin(.11*x+.003*y*y/32+Math.sin(y*.053))*(.4+.6*Math.cos(y*.04));
    const value=Math.round(237+streak*7+((seed>>>20)/4095-.5)*20);
    pixels.data.set([value,value-1,value-3,255],(y*192+x)*4);
  }
  grain.putImageData(pixels,0,0);
  const stock=art.texture(fiber);
  const paper = art.keepMaterial(new THREE.MeshStandardMaterial({map:stock,bumpMap:stock,bumpScale:.00048,
    vertexColors:true,roughness:.94}));
  paper.name = 'kraft-paper';
  k.put(bag, paper, loft(fold,{cols:48,power:.27,sculpt:([x,y,z],a,t)=>{
    const pleat = Math.max(0,1-Math.abs(Math.cos(a))/.58) * .022 * Math.sin(Math.PI*t);
    return [x-Math.sign(x)*pleat, y, z+.0028*Math.sin(4*a+t*8)*Math.sin(Math.PI*t)];
  }}),'#b58755');
  for (const s of [-1,1]) {
    k.tube(bag,paper,'#997149',[[s*.102,-.294,-.053],[s*.093,-.25,-.022],
      [s*.086,-.19,-.009],[s*.090,-.125,-.006],[s*.10,-.095,-.004]],.0016,10,4);
    for (const z of [-1,1]) k.tube(bag,paper,'#a27a52',[[s*.089,-.300,z*.053],
      [s*.102,-.272,z*.060],[s*.100,-.237,z*.056],[s*.090,-.190,z*.029]],.0014,10,4);
    k.box(bag,paper,'#c59d6c',[0,-.095,s*.015],[.201,.016,.004],.001);
    const handle=[[-.057,-.102,s*.017],[-.052,-.066,s*.026],[-.043,-.029,s*.022],
      [-.022,-.005,s*.009],[0,0,s*.006],[.022,-.005,s*.009],[.043,-.029,s*.022],
      [.052,-.066,s*.026],[.057,-.102,s*.017]];
    k.tube(bag,paper,'#8c6842',handle,.0048,24,7);
    k.tube(bag,paper,'#caa472',handle.map(([x,y,z])=>[x,y+.0015,z+s*.003]),.0014,24,4);
    for (const x of [-.057,.057]) k.box(bag,paper,'#a87c4a',[x,-.102,s*.019],[.018,.014,.003]);
  }
  const label = document.createElement('canvas');
  label.width=192; label.height=256;
  const ctx=label.getContext('2d');
  ctx.fillStyle='#ae372b'; ctx.fillRect(0,0,192,256);
  ctx.strokeStyle='#e9b28b';ctx.lineWidth=4;ctx.strokeRect(8,8,176,240);
  ctx.fillStyle='#fff0d8';ctx.textAlign='center';ctx.font='bold 77px sans-serif';
  ctx.fillText('封',96,109);ctx.fillText('签',96,198);
  ctx.fillRect(36,220,120,4);
  const seal = art.keepMaterial(new THREE.MeshStandardMaterial({map:art.texture(label),roughness:.68,
    vertexColors:true,side:THREE.DoubleSide}));
  seal.name='red-security-seal';
  for (const s of [-1,1]) {
    const path=[[-.165,.068],[-.120,.043],[-.100,.019],[-.086,.014],[-.085,0]];
    k.put(bag,seal,grid(2,path.length-1,(u,v,j)=>[(u-.5)*.043+.009,path[j][0],s*(path[j][1]+.001)],
      {flip:s<0}));
  }
  const receipt=art.keepMaterial(new THREE.MeshStandardMaterial({vertexColors:true,roughness:.91}));
  k.box(bag,receipt,'#dfd0af',[-.050,-.212,.070],[.051,.065,.002]);
  for (let j=0;j<7;j++) k.box(bag,receipt,'#726856',[-.052,-.191-j*.0063,.0715],
    [j%3===0?.030:.039,.0015,.0008]);
  return bag;
}

export function makeGateGuard(k, m, art) {
  const root=node(null,'estateGuard');
  const pelvis=node(root,'hips',[0,.87,0]), chest=node(pelvis,'chest',[0,.045,0]);
  const head=node(chest,'head',[0,.553,.016]);
  head.scale.set(1.12,1.02,1.04);
  buildHead(k,m,head,'cap');
  const shirt='#9ba8a9', cloth='#47545d', cuff='#6b7c80', shoe='#42423d', skin='#b4886d';
  // Retain the photographed fold detail from the sewn-cloth charts beneath
  // the grey dye of the duty shirt and the navy dye of the trousers.
  const uniform=art.keepMaterial(m.detail.clone());
  uniform.name='duty-uniform';
  uniform.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',
      'float fold=dot(texture2D(map,vMapUv).rgb,vec3(.2126,.7152,.0722)); diffuseColor.rgb*=.46+1.45*sqrt(fold);');
  };
  k.put(chest,m.skin,loft([[.418,.070,.058,.015],[.485,.067,.057,.013],[.577,.058,.047,.017]],
    {cols:24}),skin);
  const jacket=[[.0,.157,.108,-.012],[.032,.155,.114,-.005],[.088,.16,.117,.005],
    [.16,.169,.125,.004],[.29,.181,.126,.003],[.365,.191,.123,0],[.399,.207,.112,0],
    [.427,.201,.100,0],[.450,.169,.093,-.002],[.474,.092,.072,-.006]];
  const rings=Array.from({length:32},(_,i)=>sectionAt(jacket,i*.474/31));
  k.put(chest,uniform,detailUV(loft(rings,{power:.88,cols:40,sculpt:([x,y,z],a)=>{
    const fold=.0045*Math.sin(7*a+2*y)*Math.cos(32*y+.8*Math.sin(3*a))
      +.0029*Math.sin(55*y+2.8*Math.cos(a))*Math.exp(-8*y);
    return [x+fold*Math.sin(a),y,z+fold*Math.cos(a)];
  }}),1),shirt);
  k.put(pelvis,m.cloth,loft([[-.078,.109,.079,-.022],[-.051,.142,.111,-.015],
    [.022,.154,.112,-.006],[.083,.153,.110,-.006]],{cols:28}),cloth);
  k.put(chest,m.cloth,loft([[.448,.088,.071,-.003],[.464,.084,.068,0],[.498,.072,.057,.007]],
    {cols:24}),cuff);
  {
    const {lerp}=THREE.MathUtils;
    for (const s of [-1,1]) {
      const flap=grid(6,6,(u,v)=>[s*lerp(.022+.066*u,.094+.029*u,v),
        lerp(.482-.012*u,.393+.064*u,v),lerp(.060+.007*u,.120-.031*u,v)],{flip:s>0});
      k.put(chest,m.cloth,flap,'#8d9da0');
    }
    k.put(pelvis,m.rubber,loft([[.043,.157,.115,-.006],[.077,.158,.116,-.005]],{power:.86}),'#393d39');
    k.box(pelvis,m.metal,'#9d9a86',[.003,.061,.116],[.049,.029,.011],.003);
    k.box(pelvis,m.rubber,'#393f40',[-.157,.091,-.012],[.040,.108,.064],.008);
    k.rod(pelvis,m.rubber,'#343c3a',[-.16,.135,-.026],[-.163,.235,-.03],.005);
    k.tube(chest,m.rubber,'#464c48',[[-.155,.094,.024],[-.146,.158,.074],[-.152,.254,.081],
      [-.136,.320,.101],[-.106,.360,.098]],.003,18,5);
    for (const s of [-1,1]) {
      k.box(chest,m.cloth,cuff,[s*.09,.277,.113],[.085,.079,.012],.006,[0,s*.13,0]);
      k.box(chest,m.cloth,shirt,[s*.09,.308,.122],[.087,.021,.012],.003,[0,s*.13,0]);
      k.egg(chest,m.metal,'#a39b7a',[s*.088,.307,.130],[.004,.004,.002]);
      k.box(chest,m.cloth,'#354249',[s*.145,.441,.006],[.082,.013,.052],.004,[0,0,-s*.19]);
      for (const dx of [-.017,.002]) k.box(chest,m.tape,'#b8b998',[s*(.146+dx),.45,.010],
        [.006,.006,.042],.001,[0,0,-s*.19]);
    }
    k.box(chest,m.cloth,'#3b4647',[.091,.344,.120],[.062,.016,.005],.001);
    k.box(chest,m.tape,'#c1bca1',[.091,.346,.124],[.045,.003,.002]);
    k.tube(chest,m.cloth,cuff,[[0,.043,.110],[0,.159,.132],[0,.291,.131],[0,.406,.107]],
      .0035,10,4);
    for (const [y,z] of [[.09,.12],[.16,.134],[.235,.133],[.31,.132],[.385,.117]]) {
      k.egg(chest,m.rubber,'#545d59',[.004,y,z],[.0045,.0045,.0027]);
    }
  }
  const mouth=node(head,'speakingMouth',[0,.061,.084]);
  k.egg(mouth,m.skin,'#67504b',[0,0,0],[.019,.0035,.0026]);
  const legs=[],arms=[];
  for (const side of [-1,1]) {
    function limb(parent,name,position,a,b) {
      const upper=node(parent,name+side,position), lower=node(upper,'bend'+side,[0,-a,0]);
      return {upper,lower,end:node(lower,'end'+side,[0,-b,0]),l1:a,l2:b,name,side};
    }
    const leg=limb(pelvis,'leg',[side*.101,0,-.013],.407,.386);
    k.put(leg.upper,uniform,detailUV(loft([[-.428,.055,.056,.003],[-.399,.076,.071,.002],[-.322,.079,.076,0],
      [-.23,.080,.079,-.002],[-.11,.091,.095,-.006],[-.04,.097,.105,-.006],[.042,.075,.084,-.007]],
      {cols:24}),2,side<0),cloth);
    k.put(leg.lower,uniform,detailUV(loft([[-.346,.056,.057,-.005],[-.314,.066,.064,-.007],
      [-.288,.060,.058,-.007],[-.249,.065,.068,-.009],[-.164,.070,.078,-.014],
      [-.052,.071,.071,-.001],[.028,.068,.063,0]],{cols:24}),3,side<0),cloth);
    k.put(leg.end,m.rubber,loft([[-.070,.035,.024,-.023],[-.050,.050,.041,-.015],
      [.01,.048,.051,-.004],[.066,.047,.039,-.020],[.128,.050,.027,-.036],[.173,.042,.021,-.041],
      [.187,.022,.012,-.041]],{axis:'z',cols:20}),shoe);
    k.box(leg.end,m.rubber,'#353731',[0,-.063,.051],[.093,.017,.228],.006);
    for (let j=0;j<3;j++) k.tube(leg.end,m.cloth,'#706a58',[[-.024,.036-j*.006,.012+j*.017],
      [0,.042-j*.006,.021+j*.017],[.022,.034-j*.006,.016+j*.017]],.0027,5,5);
    legs.push(leg);
    const arm=limb(chest,'arm',[side*.18,.402,.004],.292,.252);
    k.put(arm.upper,uniform,detailUV(loft([[-.249,.064,.065,0],[-.224,.068,.066,-.002],
      [-.193,.063,.066,-.003],[-.132,.069,.076,0],[-.041,.079,.080,-.001],
      [.017,.065,.066,-.004],[.038,.034,.039,-.007]],{cols:24}),0,side<0),shirt);
    k.egg(arm.upper,m.cloth,'#475960',[side*.070,-.103,.006],[.007,.038,.028]);
    k.egg(arm.upper,m.tape,'#b8a67b',[side*.077,-.097,.006],[.002,.015,.012]);
    k.put(arm.upper,m.cloth,loft([[-.252,.065,.066,0],[-.236,.066,.067,0]],{cols:20}),cuff);
    k.put(arm.upper,m.skin,loft([[-.316,.042,.047,.002],[-.287,.048,.051,.001],
      [-.223,.052,.052,0]],{cols:18}),skin);
    k.put(arm.lower,m.skin,loft([[-.257,.027,.025,.002],[-.218,.031,.027,.002],
      [-.145,.042,.035,-.002],[-.068,.051,.045,-.004],[.022,.044,.044,.003]],{cols:18}),skin);
    k.egg(arm.end,m.skin,skin,[0,-.031,.006],[.037,.054,.022]);
    for (let j=0;j<4;j++) {
      const x=(j-1.5)*.014*side, len=.053-.01*Math.abs(j-1);
      k.tube(arm.end,m.skin,skin,[[x,-.057,.006],[x*1.04,-.075,.011],
        [x*1.07,-.061-len,.022],[x*1.07,-.064-len,.030]],.0078-j*.00043,8,6);
    }
    k.tube(arm.end,m.skin,skin,[[-side*.023,-.020,.005],[-side*.041,-.043,.018],
      [-side*.046,-.059,.032]],.010,7,6);
    arm.socket=node(arm.end,'palm'+side,[0,-.075,.024]);
    arms.push(arm);
  }
  const solve=limbSolver(), target=new THREE.Vector3(), pole=new THREE.Vector3();
  const q=new THREE.Quaternion(), inv=new THREE.Quaternion(), rot=new THREE.Euler();
  const mat=new THREE.Matrix4(), offset=new THREE.Vector3();
  function reach(chain,point,pitch,poleX,poleY,poleZ) {
    const parent=chain.upper.parent;
    parent.updateWorldMatrix(true,false);
    mat.copy(parent.matrixWorld).invert().multiply(root.matrixWorld);
    inv.setFromRotationMatrix(mat.extractRotation(mat));
    // Transform positions separately since this figure may have a uniform world scale.
    parent.worldToLocal(root.localToWorld(target.copy(point)));
    q.setFromEuler(rot.set(pitch,0,0)).premultiply(inv);
    if (chain.socket) target.sub(offset.copy(chain.socket.position).applyQuaternion(q));
    pole.set(poleX,poleY,poleZ).applyQuaternion(inv);
    solve(chain,target,pole,q);
  }
  root.visible=false;
  return { root,pelvis,chest,head,mouth,legs,arms,reach };
}

export function makeAlertMark(art) {
  const root=node(null,'guardExclamation');
  // This short-lived world-space cue belongs to the guard. Gate posts sweeping
  // between the camera and his cap must not erase the alert on a narrow screen.
  const cue={transparent:true,depthTest:false,depthWrite:false,toneMapped:false,fog:false};
  const dark=art.keepMaterial(new THREE.MeshBasicMaterial({...cue,color:'#241f18'}));
  const gold=art.keepMaterial(new THREE.MeshBasicMaterial({...cue,color:'#ffca23'}));
  for (const dot of [false,true]) {
    const outline=dot?[[-.080,-.095],[.084,-.093],[.095,.073],[-.077,.087]]
      :[[-.060,-.201],[.071,-.205],[.166,.301],[-.134,.329]];
    const shape=new THREE.Shape(outline.map(p=>new THREE.Vector2(...p)));
    for (const [mat,scale,z] of [[dark,1.17,0],[gold,.91,.050]]) {
      const geo=art.keepGeometry(new THREE.ExtrudeGeometry(shape,{depth:.035,bevelEnabled:true,
        bevelSize:.012,bevelThickness:.009,bevelSegments:2,steps:1}));
      art.mesh(root,geo,mat,[0,dot?-.256:.105,z],[scale,scale,1]).renderOrder=mat===gold?91:90;
    }
  }
  root.visible=false;
  return root;
}

export function animateGuard(model, mark, scene, course, patrol, camera) {
  const { root, pelvis, chest, head, mouth, arms, legs, reach } = model;
  const booth=course.landmarks.booth, front=booth.z+booth.d/2;
  // The open duty doorway and the patrol bay share an X centreline.
  const post=new THREE.Vector3().copy(course.guardPost);
  const door=new THREE.Vector3(), seat=new THREE.Vector3(), point=new THREE.Vector3(), facing=new THREE.Quaternion();
  const driver=patrol.driver;
  const smooth=THREE.MathUtils.smoothstep, mix=THREE.MathUtils.lerp;
  scene.add(root,mark);
  let wasAboard=false;
  return (frame,time) => {
    const state=frame.guard?.phase ?? (frame.pursuer?.active?'chasing':'posted');
    const progress=frame.guard?.progress ?? 0;
    if (state==='posted' || state==='alert') wasAboard=false;
    if (state==='chasing') wasAboard=true;
    const aboard=state==='chasing' || (state==='standDown' && wasAboard);
    const board=state==='boarding'?progress:aboard?1:0;
    const seated=smooth(board,.70,1), dash=smooth(board,.015,.09)*(1-smooth(board,.62,.85));
    const alert=state==='alert'?smooth(progress,0,.25):state==='boarding'?1-smooth(progress,0,.18):0;
    if (driver) driver.visible=aboard;
    root.visible=true;
    root.scale.setScalar(.985);
    if (aboard && driver) {
      if (root.parent!==driver) driver.add(root);
      root.position.set(0,0,-.18); root.rotation.set(0,0,0);
    } else {
      if (root.parent!==scene) scene.add(root);
      seat.set(0,0,-.18); patrol.root.localToWorld(seat);
      const nearSide=Math.sign(patrol.root.worldToLocal(point.copy(post)).x)||1;
      door.set(nearSide*.72,0,-.13);patrol.root.localToWorld(door);
      const track=smooth(board,0,.76);
      root.position.lerpVectors(post,door,track);
      root.position.y=mix(post.y,door.y,smooth(root.position.z,front-.12,front+.26));
      root.position.lerp(seat,seated);
      const watch=frame.actor ?? frame.bike;
      const waiting=Math.atan2(.64,1);
      const look=Math.atan2(watch.x-post.x,watch.z-post.z);
      const run=Math.atan2(door.x-post.x,door.z-post.z);
      const angle=(a,b,t)=>a+t*Math.atan2(Math.sin(b-a),Math.cos(b-a));
      const yaw=angle(angle(waiting,look,alert*.70),run,smooth(board,.0,.16));
      root.rotation.set(0,yaw,0);
      patrol.body.getWorldQuaternion(facing);root.quaternion.slerp(facing,seated);
    }
    const wave=board*Math.PI*9, stride=Math.sin(wave)*dash;
    pelvis.position.set(.016*stride,mix(.846+.027*Math.abs(stride),.637,seated),mix(0,-.017,seated));
    chest.rotation.set(.04+.30*dash+.27*seated+.10*alert,.065*stride,-.050*alert,'YXZ');
    head.position.y=.553-.016*seated;
    head.rotation.set(-.032-.17*dash-.07*seated, .15*alert+.08*Math.sin(time*.7)*(1-alert)*(1-dash),.04*alert);
    mouth.scale.y=1+alert*(1.8+.70*Math.cos(progress*16));
    for (const leg of legs) {
      const s=leg.side, half=Math.max(0,s*Math.cos(wave));
      point.set(s*.12,.075+.20*half*dash,s*.32*stride-.025);
      point.lerp(door.set(s*.154,.309,.315),seated);
      reach(leg,point,-.13*dash*half,.15*s,.04,1);
    }
    for (const arm of arms) {
      const s=arm.side;
      point.set(s*(.233+.035*dash),.841+.11*dash,-s*.27*stride+.12+.11*dash);
      if (s<0) point.lerp(door.set(-.086,1.511,.154),alert);
      else point.lerp(door.set(.370,1.480,.403),alert);
      point.lerp(door.set(s*.164,1.007,.355),seated);
      reach(arm,point,mix(-.17-.95*dash,-1.10,seated)-alert*(s>0?2.28:2.20),
        s*(.75-.36*alert),-.55-.44*alert,-.73+.81*alert);
    }
    mark.visible=alert>.015;
    if (mark.visible) {
      head.localToWorld(mark.position.set(.025,.75,.02));
      let scale=.74+.32*smooth(alert,0,.7)+.12*Math.sin(Math.PI*alert);
      if (camera) {
        camera.getWorldPosition(point);
        // Put the glyph in front of the doorway trim along the street-side
        // sightline. Its angular size and alignment above the cap stay constant.
        const lip=front+.62;
        if (mark.position.z<lip && point.z>lip) {
          const towardEye=Math.min(.35,(lip-mark.position.z)/(point.z-mark.position.z));
          mark.position.lerp(point,towardEye);
          scale*=1-towardEye;
        }
        mark.rotation.set(0,Math.atan2(point.x-mark.position.x,point.z-mark.position.z),-.13+.025*Math.sin(wave),'YXZ');
      }
      mark.scale.setScalar(scale*(state==='boarding'?alert:1));
    }
  };
}
