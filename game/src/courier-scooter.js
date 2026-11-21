import * as THREE from 'three';
import { buildCargo } from './courier-cargo.js';
import { TAU, sides, sideName, signedPow, node, grid, loft, rimProfile, flank, sectionAt, detailUV } from './courier-geometry.js';

const graphite = '#34353a', iron = '#53545a', alloy = '#a7a39a', rubber = '#303034';
const ivory = '#ece4d3', amber = '#e6a340';
const rearBody = [
  [-.981,.076,.032,.644],[-.936,.145,.057,.652],[-.838,.196,.080,.650],
  [-.67,.218,.108,.627],[-.45,.216,.144,.582],[-.27,.204,.164,.529],
  [-.13,.173,.134,.473],[.008,.122,.069,.419],[.083,.087,.031,.387],
];
const apron = [
  [.239,.145,.044,.327],[.313,.187,.122,.395],[.387,.194,.207,.476],
  [.458,.201,.261,.557],[.535,.215,.244,.642],[.609,.215,.193,.692],
  [.688,.181,.132,.723],[.745,.130,.078,.719],[.778,.057,.034,.697],
];

function plateYZ(points, x, thick) {
  const shape = new THREE.Shape();
  points.forEach(([y,z], i) => i ? shape.lineTo(-z,y) : shape.moveTo(-z,y));
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 3 });
  g.rotateY(Math.PI / 2); g.translate(x - thick / 2, 0, 0);
  return g;
}

function rotor() {
  const shape = new THREE.Shape();
  for (let i = 0; i <= 60; i++) {
    const a = i * TAU / 60, r = .133 - .002 * Math.cos(a * 10);
    if (i) shape.lineTo(r * Math.cos(a), r * Math.sin(a));
    else shape.moveTo(r, 0);
  }
  function drill(x, y, r) {
    const h = new THREE.Path();
    h.absarc(x, y, r, 0, TAU, true); shape.holes.push(h);
  }
  drill(0,0,.042);
  for (let i = 0; i < 20; i++) {
    const a = TAU * i / 20, r = i % 2 ? .115 : .121;
    drill(r * Math.cos(a), r * Math.sin(a), .0046);
  }
  for (let i = 0; i < 6; i++) {
    const a = TAU * i / 6;
    drill(.075 * Math.cos(a), .075 * Math.sin(a), .016);
  }
  const g = new THREE.ShapeGeometry(shape, 5);
  g.rotateY(Math.PI / 2);
  return g;
}

// Frontmost surface of the moulded leg shield at this lens point. The glass follows
// its compound curvature even at the narrow nose and at the swept outer corners.
function noseDepth(x,y) {
  const inside=z=>{
    const [,w,h,c]=sectionAt(apron,z);
    return Math.abs(x/w)**(2/.71)+Math.abs((y-c)/h)**(2/.71)<=1;
  };
  for(let i=apron.length-1;i>=0;i--) {
    const hi=apron[i][0];
    if(!inside(hi)) continue;
    if(i===apron.length-1) return hi;
    let a=hi,b=apron[i+1][0];
    for(let j=0;j<9;j++) {const mid=(a+b)/2;if(inside(mid)) a=mid;else b=mid;}
    return a;
  }
  return .608;
}

function wheel(k, m, hub, front) {
  const { put, rod } = k;
  const width = front ? .93 : 1.03;
  const tyre = [[-.077,.202],[-.083,.223],[-.083,.242],[-.074,.260],[-.057,.279],
    [-.034,.287],[0,.289],[.034,.287],[.057,.279],[.074,.260],[.083,.242],[.083,.223],[.077,.202]];
  put(hub, m.tyre, rimProfile(tyre.map(([x,r]) => [x * width,r]), 48), '#48464a');
  const well = [[-.079,.205],[-.079,.191],[-.074,.184],[-.062,.184],[-.031,.171],
    [.031,.171],[.062,.184],[.074,.184],[.079,.191],[.079,.205]];
  put(hub, m.metal, rimProfile(well.slice().reverse(), 40), '#545256');
  for (const s of sides) {
    const lip = [[.073,.184],[.081,.188],[.083,.194],[.079,.200],[.073,.201]];
    put(hub, m.metal, rimProfile((s > 0 ? lip : [...lip].reverse()).map(([x,r]) => [s*x,r]),40), '#98948b');
    const bead = [[.080,.205],[.081,.213],[.083,.217],[.083,.219]];
    put(hub, m.rubber, rimProfile((s > 0 ? bead : [...bead].reverse()).map(([x,r]) => [s*x,r]),36), '#454447');
  }
  const spoke = plateYZ([[.035,-.010],[.052,-.030],[.112,-.040],[.181,-.014],
    [.188,.014],[.129,-.003],[.089,-.006],[.055,.011]], 0, .051);
  const branch = plateYZ([[.101,-.035],[.132,-.034],[.179,-.058],[.181,-.074],
    [.160,-.069],[.119,-.049]], 0, .038);
  const facet = plateYZ([[.049,-.015],[.098,-.029],[.175,-.010],[.180,-.004],
    [.100,-.020],[.064,-.010]], 0, .0018);
  const count = front ? 6 : 5;
  for (let i = 0; i < count; i++) {
    const rot = [TAU * i / count, 0, 0];
    put(hub, m.metal, spoke, '#625f60', [0,0,0], [1,1,1], rot);
    put(hub, m.metal, branch, '#534f51', [0,0,0], [1,1,1], rot);
    for (const s of sides) put(hub, m.metal, facet, '#8b8881', [s*.026,0,0], [1,1,1], rot);
  }
  rod(hub,m.metal,iron,[-.085,0,0],[.085,0,0],front ? .049 : .083,front ? .049 : .071,20);
  for (const s of sides) rod(hub,m.metal,alloy,[s*.081,0,0],[s*.101,0,0],.031,.023,12);
  if (front) {
    put(hub,m.metal,rotor(),'#b5b0a7',[.090,0,0]);
    for (let i = 0; i < 5; i++) {
      const a = TAU*i/5, y = .052*Math.cos(a), z = .052*Math.sin(a);
      rod(hub,m.metal,graphite,[.090,y,z],[.095,y,z],.007,.007,6);
    }
  }
  rod(hub,m.rubber,rubber,[-.016,.183,.018],[-.037,.157,.015],.004);
}

function suspension(k,m,body,s) {
  const x = s*.154, bottom = new THREE.Vector3(x,.311,-.697), top = new THREE.Vector3(s*.172,.643,-.556);
  const axis = top.clone().sub(bottom).normalize();
  const across = new THREE.Vector3(1,0,0).addScaledVector(axis,-axis.x).normalize();
  const front = new THREE.Vector3().crossVectors(axis,across);
  const along = t => bottom.clone().lerp(top,t);
  k.rod(body,m.metal,iron,bottom.toArray(),along(.40).toArray(),.029,.030);
  k.rod(body,m.metal,'#ccc8bc',along(.24).toArray(),top.toArray(),.015);
  for (const t of [.30,.90]) k.rod(body,m.metal,graphite,along(t).toArray(),along(t+.054).toArray(),.043,.041,14);
  const points = [];
  for (let i = 0; i <= 90; i++) {
    const t=i/90, angle=t*TAU*5.65, radius=.033*(.85+.15*Math.sin(Math.PI*t));
    points.push(along(.35+.54*t).addScaledVector(across,radius*Math.cos(angle))
      .addScaledVector(front,radius*Math.sin(angle)).toArray());
  }
  k.tube(body,m.paint,'#edae2b',points,.0085,67,6);
  for (const end of [bottom,top]) {
    k.rod(body,m.metal,alloy,[end.x-.022,end.y,end.z],[end.x+.022,end.y,end.z],.022,.022,8);
  }
}

function runningGear(k,m,body) {
  for (const s of sides) {
    k.put(body,m.metal,plateYZ([[.26,-.76],[.32,-.78],[.39,-.51],[.41,-.22],
      [.32,-.17],[.275,-.37]],s*.112,.041),iron);
    suspension(k,m,body,s);
  }
  // Cast variator case on the left, exhaust with a separate heat shield on the right.
  const belt = [[-.872,.035,.040,.286],[-.822,.052,.077,.288],[-.723,.062,.095,.291],
    [-.576,.065,.091,.293],[-.458,.063,.073,.289],[-.322,.061,.083,.289],
    [-.216,.052,.074,.291],[-.175,.042,.035,.299]];
  k.put(body,m.metal,loft(belt,{axis:'z',power:.75,cols:18}),'#48484a',[.132,0,0]);
  for (let i = 0; i < 5; i++) {
    const z = -.57+i*.048;
    k.rod(body,m.metal,'#68676a',[.194,.271,z],[.192,.329,z+.015],.003);
  }
  for (const [y,z] of [[.34,-.735],[.245,-.76],[.34,-.44],[.251,-.27],[.33,-.26]]) {
    k.rod(body,m.metal,alloy,[.183,y,z],[.197,y,z],.008,.007,6);
  }
  k.tube(body,m.metal,'#76665b',[[-.09,.305,-.235],[-.14,.198,-.285],[-.165,.181,-.439],[-.171,.238,-.568]],.023,15);
  k.rod(body,m.metal,'#39383a',[-.161,.246,-.491],[-.183,.306,-.868],.064,.060,20);
  k.rod(body,m.metal,'#777370',[-.183,.306,-.861],[-.185,.309,-.884],.061,.051,20);
  k.rod(body,m.rubber,'#262627',[-.185,.309,-.883],[-.185,.310,-.886],.031,.032,14);
  k.put(body,m.metal,plateYZ([[.251,-.490],[.293,-.503],[.356,-.777],[.342,-.873],
    [.277,-.857],[.221,-.558]],-.221,.013),'#666366');
  for (const [y,z] of [[.267,-.551],[.311,-.804]]) {
    k.rod(body,m.metal,alloy,[-.228,y,z],[-.234,y,z],.009,.009,6);
  }
}

function chassis(k,m,body) {
  const { put, rod, tube, box } = k;
  runningGear(k,m,body);
  put(body,m.paint,loft(rearBody,{axis:'z',power:.68,cols:24}),ivory);
  const lowerSkirt = [[-.961,-.87,-.19],[-.898,-.94,-.20],[-.72,-.97,-.08],[-.53,-.97,-.11],
    [-.355,-.96,-.35],[-.21,-.95,-.59],[-.103,-.87,-.59],[.045,-.86,.12]];
  const tailPanel = [[-.937,-.14,.61],[-.897,-.17,.83],[-.72,-.09,.87],[-.53,-.10,.93],
    [-.355,-.31,.79],[-.253,-.50,.49],[-.209,-.56,.10],[-.132,-.58,-.29],[-.100,-.63,-.53]];
  for (const s of sides) {
    put(body,m.rubber,flank(rearBody,lowerSkirt,s,.68,.0054),graphite);
    put(body,m.fairing,detailUV(flank(rearBody,tailPanel,s,.68,.0055),8));
  }
  const saddle = [[-.904,.091,.021,.720],[-.864,.146,.034,.735],[-.742,.184,.043,.751],
    [-.581,.195,.048,.756],[-.405,.187,.051,.749],[-.236,.168,.046,.731],
    [-.113,.137,.044,.716],[-.038,.093,.030,.702],[-.011,.048,.014,.694]];
  put(body,m.rubber,loft(saddle,{axis:'z',power:.72,cols:28}),'#363235');
  for (const s of sides) {
    const seam = saddle.slice(1,-1).map(([z,w,h,y]) => [s*w*.974,y+h*.37,z]);
    tube(body,m.cloth,'#88725b',seam,.0026,22,5);
  }
  const floor = [[-.302,.157,.049,.310],[-.204,.224,.056,.289],[-.054,.244,.040,.270],
    [.197,.242,.043,.266],[.333,.224,.071,.282],[.444,.181,.107,.337]];
  put(body,m.rubber,loft(floor,{axis:'z',power:.29,cols:24}),'#474349');
  for (const s of sides) {
    put(body,m.paint,flank(floor,[[-.20,.35,.54],[-.08,.59,.81],[.19,.56,.80],[.33,.17,.52]],s,.29),'#d3c9b6');
    for (let i=0;i<4;i++) {
      const x=s*(.135+i*.023);
      tube(body,m.rubber,'#686363',[[x,.310,-.095],[x,.313,.030],[x,.311,.18],[x,.325,.264]],.0035,10,5);
    }
  }
  put(body,m.paint,loft(apron,{axis:'z',power:.71,cols:30}),ivory);
  const inner = [[.244,-.49,.83],[.313,-.39,.93],[.387,-.09,.95],[.458,.19,.94],
    [.535,.49,.92],[.578,.72,.91],[.612,.82,.87]];
  const shield=grid(18,20,(u,v)=>{
    const z=.243+.380*v,[,w,h,c]=sectionAt(apron,z);
    const x=(2*u-1)*w*(.88-.11*v);
    return [x,c+h*Math.pow(1-Math.abs(x/w)**(2/.71),.71/2)+.004,z-.002];
  },{flip:true});
  put(body,m.rubber,shield,'#464347');
  const cowlPanel = [[.314,-.69,-.33],[.377,-.78,-.16],[.442,-.84,.17],[.545,-.80,.53],
    [.645,-.70,.64],[.717,-.61,.57],[.754,-.51,.30]];
  for (const s of sides) {
    put(body,m.rubber,flank(apron,inner,s,.71,.0053),'#474348');
    put(body,m.fairing,detailUV(flank(apron,cowlPanel,s,.71,.0053),9));
    put(body,m.paint,flank(apron,[[.674,.055,.09],[.714,-.08,.12],[.746,-.01,.11]],s,.71,.007),amber);
    for(const lens of [false,true]) {
      const light=grid(19,4,(u,v)=>{
        const t=lens?.053+.87*u:u, x=.011+.153*t;
        const centre=.744+.055*t, half=.010+.021*Math.sin(Math.PI*t)**.66;
        const y=centre+(2*v-1)*half*(lens?.69:1);
        return [s*x,y,noseDepth(x,y)+(lens?.008:.0035)];
      },{flip:s<0});
      put(body,lens?m.lens:m.rubber,light,lens?'#eee4d5':'#373538');
    }
  }
  // A moulded inner pocket and lock are visible from the saddle.
  box(body,m.rubber,'#403e41',[0,.641,.419],[.183,.125,.034],.016,[-.29,0,0]);
  box(body,m.rubber,'#262629',[0,.692,.396],[.137,.014,.028],.006,[-.29,0,0]);
  rod(body,m.metal,alloy,[.104,.740,.423],[.104,.744,.416],.014,.014,12);
  const skirt = [[-1.057,.073,.009,.251],[-1.027,.095,.014,.325],[-.972,.106,.022,.420],
    [-.930,.118,.031,.504],[-.855,.131,.041,.554],[-.766,.123,.032,.570]];
  put(body,m.rubber,loft(skirt,{axis:'z',power:.48,cols:18}),'#414046');
  box(body,m.rubber,graphite,[0,.432,-.992],[.178,.085,.019],.008,[-.42,0,0]);
  box(body,m.paint,'#a34431',[0,.449,-1.004],[.11,.029,.010],.004,[-.42,0,0]);
  // A single wraparound lens with dark gasket and a recessed red horseshoe.
  const tailLamp = [[-.981,.050,.018,.623],[-.963,.114,.043,.628],[-.938,.144,.048,.633],
    [-.901,.164,.043,.641],[-.856,.161,.027,.651]];
  put(body,m.rubber,loft(tailLamp,{axis:'z',power:.70,cols:22}), '#382c30',[0,-.008,-.018],[1.055,1.008,1]);
  put(body,m.paint,loft(tailLamp,{axis:'z',power:.70,cols:22}),'#ab4431',[0,-.012,-.033]);
  tube(body,m.paint,'#c86751',[[-.137,.629,-.971],[-.107,.608,-.998],[0,.594,-1.013],
    [.107,.608,-.998],[.137,.629,-.971]],.006,23);
  for (const s of sides) {
    tube(body,m.metal,iron,[[s*.144,.650,-.565],[s*.199,.702,-.642],
      [s*.211,.800,-.837],[s*.202,.813,-.918]],.014,16,8);
    tube(body,m.metal,'#68615b',[[s*.162,.686,-.858],[s*.197,.784,-.959],[s*.204,.807,-.933]],.012,12,8);
    rod(body,m.metal,graphite,[s*.195,.813,-.939],[s*.195,.813,-.519],.013);
  }
  for (const z of [-.916,-.708,-.539]) rod(body,m.metal,iron,[-.202,.812,z],[.202,.812,z],.012);
}

function steering(k,m,stem) {
  const { put, rod, tube, box, egg } = k, grips = {};
  for (const s of sides) {
    rod(stem,m.metal,'#64605e',[s*.112,0,0],[s*.120,.274,-.057],.026,.029,14);
    rod(stem,m.metal,'#c2bfb8',[s*.120,.255,-.054],[s*.127,.510,-.121],.017,.019,12);
    rod(stem,m.rubber,rubber,[s*.119,.241,-.050],[s*.121,.274,-.058],.030,.027);
    rod(stem,m.metal,'#88847c',[s*.090,0,0],[s*.141,0,0],.021,.018,8);
    tube(stem,m.metal,'#625e58',[[s*.107,.149,-.030],[s*.115,.237,.015],[s*.115,.285,.097]],.006,12);
  }
  box(stem,m.metal,iron,[0,.471,-.110],[.29,.047,.058],.010);
  rod(stem,m.metal,iron,[0,.45,-.110],[0,.723,-.211],.028,.024);
  box(stem,m.metal,'#554f50',[.107,.076,-.084],[.043,.094,.054],.010,[-.48,0,0]);
  box(stem,m.metal,'#716258',[.123,.083,-.077],[.015,.047,.042],.006,[-.41,0,0]);
  tube(stem,m.rubber,'#29292b',[[.133,.098,-.099],[.146,.207,-.106],[.138,.402,-.166],
    [.143,.555,-.207],[.196,.685,-.235],[.218,.741,-.262]],.0052,21);
  const fender = grid(20,8,(u,v) => {
    const a=THREE.MathUtils.lerp(-.94,1.13,u), l=2*v-1, w=.103*(.73+.27*Math.sin(Math.PI*u));
    const r=.318-.034*l*l+.010*Math.sin(Math.PI*u);
    return [l*w,Math.cos(a)*r,Math.sin(a)*r];
  });
  put(stem,m.paint,fender,ivory);
  for (const s of sides) {
    const cheek=grid(18,3,(u,v)=>{
      const a=-.94+2.07*u, arch=Math.sin(Math.PI*u);
      const r=.284+.010*arch-v*(.010+.031*arch);
      return [s*.103*(.73+.27*arch)*(1-.07*v),Math.cos(a)*r,Math.sin(a)*r];
    },{flip:s<0});
    put(stem,m.paint,cheek,ivory);
    const edge=[];
    for(let i=0;i<=13;i++) {
      const u=i/13,a=-.94+2.07*u,r=.284+.010*Math.sin(Math.PI*u);
      edge.push([s*.103*(.73+.27*Math.sin(Math.PI*u)),Math.cos(a)*r,Math.sin(a)*r]);
    }
    tube(stem,m.rubber,'#625b54',edge,.003,18,5);
  }
  const nacelle = [[-.315,.057,.019,.733],[-.288,.088,.039,.742],[-.244,.111,.055,.748],
    [-.195,.104,.049,.749],[-.158,.062,.027,.739]];
  put(stem,m.rubber,loft(nacelle,{axis:'z',power:.66}), '#353538');
  box(stem,m.metal,'#747774',[0,.787,-.246],[.130,.014,.066],.006,[.22,0,0]);
  box(stem,m.mirror,'#a9bfad',[0,.795,-.249],[.108,.009,.049],.003,[.22,0,0]);
  for (const s of sides) {
    tube(stem,m.metal,'#6d6a65',[[s*.057,.716,-.214],[s*.137,.736,-.219],
      [s*.201,.751,-.253],[s*.251,.749,-.282],[s*.332,.741,-.306]],.0135,14,8);
    const a=[s*.230,.750,-.276], b=[s*.332,.741,-.306];
    rod(stem,m.rubber,'#373536',a,b,.018,.018,12);
    for (const t of [.10,.29,.48,.67,.86]) {
      const p=new THREE.Vector3(...a).lerp(new THREE.Vector3(...b),t);
      rod(stem,m.rubber,'#575251',p.toArray(),[p.x+s*.0025,p.y,p.z-.0008],.0187,.0187);
    }
    box(stem,m.rubber,rubber,[s*.207,.750,-.260],[.045,.054,.052],.009,[0,s*.21,0]);
    box(stem,m.paint,s>0?'#b6aaa0':'#ab5144',[s*.209,.767,-.281],[.023,.010,.009],.002);
    tube(stem,m.metal,alloy,[[s*.194,.748,-.242],[s*.206,.736,-.202],
      [s*.278,.722,-.219],[s*.342,.712,-.237]],.0051,14);
    egg(stem,m.metal,alloy,[s*.342,.712,-.237],[.008,.008,.008]);
    const grip=node(stem,'grip.'+sideName(s),[s*.278,.745,-.290]);
    grips[sideName(s)]=grip;
    tube(stem,m.metal,'#423e42',[[s*.193,.769,-.243],[s*.204,.826,-.243],
      [s*.276,.904,-.205],[s*.315,.970,-.191]],.007,18,8);
    rod(stem,m.rubber,'#343238',[s*.189,.763,-.244],[s*.207,.834,-.242],.014,.009);
    const mirror=node(stem,'mirror.'+sideName(s),[s*.343,.994,-.189]);
    mirror.rotation.set(-.12,s*.22,s*.37);
    egg(mirror,m.rubber,'#333237',[0,0,0],[.070,.042,.017]);
    const face=grid(20,4,(u,v) => {
      const a=TAU*u, r=.0001+.9999*v;
      return [.062*r*signedPow(Math.cos(a),.83),.034*r*signedPow(Math.sin(a),.83),-.021+.006*r*r];
    },{closed:true,uv:(u,v)=>[.5+.5*v*Math.cos(u*TAU),.5+.5*v*Math.sin(u*TAU)]});
    put(mirror,m.mirror,face);
  }
  return grips;
}

// These coordinates are on the textured ScooterChassis, measured from its red
// lens texels and rear mudguard. The additional fittings have their own parent.
function opticalShell(k,parent,mat,tint,cx,cy,cz,w,h,curvature=0) {
  const profile=[[.001,0],[.72,.0011],[.94,.0030],[1,.0052],[.99,.010],[.95,.013]];
  const shape=grid(w>.08?24:16,profile.length-1,(u,v,j)=>{
    const [r,depth]=profile[j],a=TAU*u;
    const dx=r*signedPow(Math.cos(a),.59),dy=r*signedPow(Math.sin(a),.62);
    const bend=.003*dx*dx+curvature*dx;
    return [cx+w*dx,cy+h*dy,cz+depth+bend];
  },{closed:true,uv:(u,v,j)=>{
    const r=profile[j][0],a=TAU*u;
    return [.5-.5*r*signedPow(Math.cos(a),.59),.5+.5*r*signedPow(Math.sin(a),.62)];
  }});
  k.put(parent,mat,shape,tint);
}

function tailHarness(k,m,body) {
  const hardware=node(body,'rearHarness'), optic=node(hardware,'centralStopOptic');
  const z=-.941;
  opticalShell(k,hardware,m.rubber,'#393538',0,.706,z+.001,.104,.023);
  opticalShell(k,hardware,m.paint,'#793329',0,.706,z-.002,.098,.019);
  opticalShell(k,optic,m.rearLight,'#fff8ef',0,.706,z-.0048,.091,.0135);
  for(const s of sides){
    k.rod(hardware,m.metal,'#91867d',[s*.098,.706,z+.003],[s*.098,.706,z-.0006],.0026,.0026,8);
    // Passive side units retain the red/amber tint of the source scooter.
    opticalShell(k,hardware,m.rubber,'#393331',s*.147,.655,-.917,.051,.022,s*.007);
    opticalShell(k,hardware,m.paint,'#b64128',s*.147,.655,-.920,.048,.018,s*.007);
    for(let j=-2;j<=2;j++) {
      const x=s*(.146+j*.013),offset=.007*(x*s-.147)/.05;
      k.tube(hardware,m.paint,'#e6774b',[[x-.002,.645,-.920+offset],
        [x,.656,-.9208+offset],[x+.001,.664,-.920+offset]],.0012,4,4);
    }
    k.tube(hardware,m.rubber,'#393538',[[s*.149,.667,-.890],[s*.146,.686,-.864],
      [s*.120,.699,-.852],[s*.102,.721,-.849]],.0036,10,6);
  }
  // The connector and P-clips are held above the wheel travel, under the carrier.
  const loom=[[.043,.710,-.913],[.049,.724,-.887],[.086,.737,-.873],
    [.106,.737,-.847],[.119,.750,-.825],[.132,.760,-.802],[.140,.757,-.762],[.149,.735,-.728]];
  k.tube(hardware,m.rubber,'#322f32',loom,.0058,20,7);
  k.box(hardware,m.rubber,'#494745',[.104,.734,-.851],[.023,.015,.035],.003,[-.40,.37,0]);
  k.box(hardware,m.paint,'#a08b68',[.105,.742,-.851],[.012,.003,.014],0,[-.40,.37,0]);
  for(const [x,y,z] of [[.075,.733,-.876],[.135,.759,-.797]]){
    k.tube(hardware,m.metal,'#817e74',[[x-.008,y+.010,z],[x-.007,y,z],[x,y-.005,z],
      [x+.008,y,z],[x+.010,y+.014,z]],.0021,8,5);
  }
  // Passive retroreflector and the two fixing screws on the inclined splashguard.
  opticalShell(k,hardware,m.rubber,'#414043',0,.497,-1.033,.051,.018);
  opticalShell(k,hardware,m.paint,'#a73d29',0,.497,-1.036,.044,.012);
  for(let j=-3;j<=3;j++) {
    const x=j*.010;
    k.tube(hardware,m.paint,'#d76b45',[[x-.004,.491,-1.036],[x,.497,-1.037],[x+.004,.503,-1.036]],
      .0012,3,4);
  }
  for(const s of sides) k.rod(hardware,m.metal,alloy,[s*.047,.497,-1.027],[s*.047,.497,-1.032],.0027,.0027,8);
  return optic;
}

export function buildScooter(k,m,bank) {
  const body=node(bank,'chassis');
  chassis(k,m,body);
  const brakeOptic=tailHarness(k,m,body);
  const stem=node(bank,'stem',[0,.289,.69]);
  const rear=node(bank,'wheel.rear',[0,.289,-.69]), front=node(stem,'wheel.front');
  wheel(k,m,rear,false); wheel(k,m,front,true);
  const grips=steering(k,m,stem);
  const seat=node(bank,'seat',[0,.767,-.19]);
  const rack=node(bank,'rack',[0,.824,-.730]), cargo=node(rack,'cargo');
  const lid=buildCargo(k,m,cargo);
  const stand=node(bank,'sideStand',[.142,.283,-.18]);
  k.rod(stand,m.metal,iron,[0,0,0],[.168,-.271,-.104],.013,.010,12);
  k.box(stand,m.rubber,'#3e3934',[.17,-.276,-.103],[.075,.014,.054],.004);
  stand.rotation.x=1.25;
  const footrests={};
  for (const s of sides) footrests[sideName(s)]=node(body,'footrest.'+sideName(s),[s*.185,.312,.085]);
  return { stem,wheels:[rear,front],mounts:{chassis:body,seat,rack,cargo,lid,stand,grips,footrests,
    get brakeLens() { return brakeOptic.children[0]; } } };
}
