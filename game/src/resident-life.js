import * as THREE from 'three';
import { grid, loft, node, sectionAt, solidBuilder } from './courier-geometry.js';
import { limbSolver } from './courier-rider.js';
import { marketSites, marketStaffStations } from './market-sites.js';
import { courtyardLots } from './courtyard-sites.js';
import neighbourhoodAtlas from './assets/residents/neighbours.webp?url&inline';

const { clamp, lerp, smoothstep } = THREE.MathUtils;
const turn = Math.PI * 2;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const handOffset = V(0, -.071, .017), soleOffset = V(0, -.069, .034);
const cloth = 8, denim = 9, flowers = 10, checks = 11, waybill = 12, straw = 13, paper = 14, plain = 15;
const skin = 6, hair = 7;

// Metres in the neutral rig. Widths, cuts, hair and props are specific to each person.
const wardrobe = {
  cook: { title:'红棚打包店员', face:0, height:1.68, shoulder:.213, waist:.178, hip:.166, bulk:1.12,
    cheek:1.07, chin:1.08, hair:'#332a25', skin:'#cc9b7d', shirt:'#e6d9be', pants:'#484a45', shoes:'#383b34' },
  customer: { title:'广场等餐顾客', face:1, height:1.62, shoulder:.171, waist:.135, hip:.162, bulk:.91,
    cheek:.94, chin:.91, hair:'#342820', skin:'#dfb29b', shirt:'#b75b44', pants:'#d1c6a9', shoes:'#6c5142' },
  gardener: { title:'花池养花人', face:2, height:1.54, shoulder:.174, waist:.159, hip:.172, bulk:.99,
    cheek:1.02, chin:.96, hair:'#b3aba0', skin:'#c89879', shirt:'#fcf9ed', pants:'#65555d', shoes:'#47453c' },
  player: { title:'南边线练球青年', face:3, height:1.86, shoulder:.206, waist:.144, hip:.148, bulk:1.03,
    cheek:1.01, chin:1.03, hair:'#292522', skin:'#bb8a68', shirt:'#a54633', pants:'#374554', shoes:'#e0d5be' },
  shopper: { title:'买菜归家的街坊', face:4, height:1.69, shoulder:.178, waist:.142, hip:.142, bulk:.91,
    cheek:.94, chin:.94, hair:'#97928b', skin:'#ba947a', shirt:'#b5ab8b', pants:'#57625e', shoes:'#51483d' },
  collector: { title:'七号楼取件住户', face:5, height:1.65, shoulder:.179, waist:.142, hip:.161, bulk:.95,
    cheek:.97, chin:.93, hair:'#392e29', skin:'#d5a68e', shirt:'#477c79', pants:'#546775', shoes:'#c5aa84' },
};

function rounded(k, bones, joint, tile, color, rows, width = 1, power = .89, columns = 18) {
  const rings = rows.map(([y,w,d,z = 0])=>[y,w*width,d*width,z]);
  k.put(joint,bones[tile],loft(rings,{cols:columns,power}),color);
}

// A frontal albedo chart follows the shaped cheeks, eyelids, nose and lips.
// The back of the skull, ears and hair have independent surfaces.
function sculptHead(k, m, joint, person, role) {
  const rows = [[0,.031,.034,.012],[.012,.050,.049,.011],[.029,.065,.064,.009],
    [.048,.072,.073,.006],[.071,.079,.082,.002],[.094,.083,.086,-.001],
    [.112,.084,.089,-.003],[.132,.085,.089,-.005],[.151,.086,.090,-.006],
    [.172,.087,.092,-.009],[.192,.086,.092,-.010],[.211,.080,.085,-.010],
    [.231,.058,.066,-.012],[.246,.025,.033,-.011],[.250,.001,.001,-.010]];
  const vertical = [[0,.085],[.047,.265],[.094,.385],[.132,.550],[.152,.65],[.190,.835],[.25,.989]];
  function surface(a, j) {
    const [y,w,d,z] = rows[j], front = Math.cos(a);
    const x = w*Math.sin(a)*person.cheek*lerp(person.chin,1,smoothstep(y,.009,.092));
    const bump=(xc,yc,rx,ry)=>Math.exp(-(((x-xc)/rx)**2+((y-yc)/ry)**2));
    const relief=.029*bump(0,.095,.017,.018)+.017*bump(0,.123,.013,.036)
      +.008*bump(0,.048,.031,.010)+.007*bump(0,.019,.031,.013)
      +.006*(bump(.046,.104,.025,.019)+bump(-.046,.104,.025,.019))
      -.005*(bump(.034,.133,.018,.009)+bump(-.034,.133,.018,.009));
    return [x,y,z+d*front+relief*Math.max(0,front)**2];
  }
  const edge=1.57;
  k.put(joint,m[person.face],grid(28,rows.length-1,(u,v,j)=>surface((u-.5)*2*edge,j),{
    uv:(u,v,j)=>[.5+surface((u-.5)*2*edge,j)[0]*4.72/person.cheek,sectionAt(vertical,rows[j][0])[1]],
  }));
  k.put(joint,m[skin],grid(18,rows.length-1,(u,v,j)=>surface(edge+u*(turn-2*edge),j)),person.skin);
  for (const s of [-1,1]) {
    const x=s*.084*person.cheek;
    k.egg(joint,m[skin],person.skin,[x,.097,-.004],[.014,.025,.017],[-.10,0,-s*.10]);
    k.tube(joint,m[skin],'#9d745e',[[x+s*.010,.086,.003],[x+s*.012,.094,-.007],
      [x+s*.012,.110,-.007],[x+s*.010,.113,.004]],.0021,7,4);
  }
  const bob=role==='collector', short=role==='player', silver=role==='shopper'||role==='gardener';
  function scalp(a,v) {
    const c=Math.cos(a), fringe=short?.186:.181;
    const low=lerp(bob?-.006:short?.052:.030,fringe,smoothstep(c,-.25,.78))
      +.004*Math.sin(6*a+.6)+(role==='shopper'?.012:0);
    const y=lerp(low,.252,v), r=Math.sqrt(Math.max(.0004,1-((y-.131)/.127)**2));
    const back=bob?1+.13*(1-v)*(1-smoothstep(c,-.85,.7)):1;
    return [(.092+.002*Math.cos(a*9))*person.cheek*r*Math.sin(a)*back,y,-.012+.101*r*c*back];
  }
  k.put(joint,m[hair],grid(28,8,(u,v)=>scalp((u-.5)*turn,v),{closed:true}),person.hair);
  if (!short) for (let i=0;i<14;i++) {
    const a=(i/14-.5)*turn;
    k.put(joint,m[hair],grid(3,4,(u,v)=>{
      const p=scalp(a+(u-.5)*.38*(.2+.8*v)+.16*(1-v),v*.43);
      p[0]*=1.012;p[2]*=1.014;p[1]-=(bob?.010:.005)*(1-v);return p;
    }),silver?(i%3?'#9b948a':'#c1b9ae'):person.hair);
  }
  if (role==='customer'||role==='gardener') {
    k.egg(joint,m[hair],person.hair,[.008,.097,-.116],[.051,.044,.047],[-.31,.18,0]);
    if (role==='customer') {
      k.egg(joint,m[cloth],'#855046',[.008,.093,-.137],[.034,.020,.024]);
      k.egg(joint,m[hair],person.hair,[.011,.050,-.151],[.034,.061,.025],[-.22,0,-.09]);
    }
  }
  if (role==='cook') {
    rounded(k,m,joint,cloth,'#e7e3d5',[[.154,.093,.098,-.012],[.175,.098,.104,-.013],
      [.202,.102,.109,-.012],[.228,.110,.116,-.008],[.250,.094,.095,-.008],[.260,.037,.047,-.013]],1,.80,26);
    rounded(k,m,joint,cloth,'#b2b4a3',[[.156,.095,.100,-.012],[.162,.096,.102,-.012]],1,.80,24);
    for (const s of [-1,1]) k.tube(joint,m[cloth],'#c6c6b8',[[s*.060,.178,.071],
      [s*.073,.212,.068],[s*.063,.241,.056]],.0018,8,4);
  }
  if (role==='gardener') {
    rounded(k,m,joint,straw,'#e8d8ac',[[.171,.097,.108,-.013],[.169,.156,.167,-.011],
      [.178,.168,.181,-.009],[.187,.157,.173,-.011],[.198,.099,.111,-.012],
      [.228,.098,.105,-.018],[.248,.085,.092,-.017],[.262,.045,.053,-.014]],1,.95,32);
    rounded(k,m,joint,cloth,'#78664e',[[.198,.100,.111,-.012],[.214,.098,.110,-.014]],1,.95,26);
  }
  if (role==='shopper') {
    for (const s of [-1,1]) {
      const frame=Array.from({length:17},(_,i)=>{
        const a=i/16*turn;return [s*.035+.027*Math.sin(a),.132+.018*Math.cos(a),.082-.009*s*Math.sin(a)];
      });
      k.tube(joint,m[plain],'#584f43',frame,.0027,18,5);
      k.tube(joint,m[plain],'#584f43',[[s*.059,.134,.075],[s*.082,.128,.044],[s*.089,.117,-.005]],.0025,8,4);
    }
    k.rod(joint,m[plain],'#6b6152',[-.008,.137,.084],[.008,.137,.084],.0025,.0025,6);
  }
}

function chain(parent, name, side, start, l1, l2) {
  const suffix=side>0?'.L':'.R', upper=node(parent,name+suffix,start,true);
  const lower=node(upper,(name==='arm'?'forearm':'shin')+suffix,[0,-l1,0],true);
  const end=node(lower,(name==='arm'?'hand':'shoe')+suffix,[0,-l2,0],true);
  return {name,upper,lower,end,l1,l2,side};
}

function makeTorso(k,m,person,role,chest,pelvis) {
  const sw=person.shoulder,wa=person.waist,hip=person.hip;
  const tile=role==='gardener'?flowers:role==='collector'?denim:cloth;
  const rows=[[-.035,hip,.100,-.007],[.004,hip*1.03,.111,-.005],[.030,hip*1.05,.116,-.003],
    [.066,wa*1.02,.112,0],[.143,wa,.116,.002],[.228,wa*1.04,.125,.003],
    [.313,sw*.93,.129,.004],[.381,sw*.99,.119,.002],[.410,sw,.105,-.001],
    [.438,sw*.78,.092,-.005],[.468,.075,.065,-.003]];
  const rings=Array.from({length:22},(_,i)=>sectionAt(rows,-.035+.503*i/21));
  k.put(chest,m[tile],loft(rings,{cols:26,power:.91,sculpt:([x,y,z],a)=>{
    const fold=(.0037*Math.sin(49*y+1.8*Math.cos(a*3))+.0028*Math.cos(5*a-y*8))*Math.sin(4*a+1);
    return [x+fold*Math.sin(a),y,z+fold*Math.cos(a)];
  }}),person.shirt);
  rounded(k,m,pelvis,denim,person.pants,[[-.102,hip*.67,.084,-.020],[-.074,hip*.91,.108,-.017],
    [-.010,hip,.118,-.010],[.061,hip*.96,.103,-.006]]);
  rounded(k,m,chest,skin,person.skin,[[.415,.065,.055,.001],[.472,.060,.051,.009],
    [.527,.049,.045,.013],[.572,.046,.044,.015]],person.bulk);
  const front=(x,y,lift=.004)=>{
    const [,w,d,cz]=sectionAt(rows,clamp(y,-.035,.468));
    return [x,y,cz+d*Math.pow(Math.max(.018,1-Math.abs(x/w)**2.20),.45)+lift];
  };
  function strip(y0,y1,half0,half1,color,sector=cloth,lift=.006) {
    k.put(chest,m[sector],grid(10,8,(u,v)=>front((u-.5)*2*lerp(half0,half1,v),lerp(y0,y1,v),lift)),color);
  }
  if (role==='cook') {
    k.put(chest,m[cloth],grid(12,13,(u,v)=>{
      const y=lerp(-.24,.360,v), width=y<.12?.166:lerp(.166,.111,(y-.12)/.24);
      const x=(u-.5)*2*width;
      if (y>=-.017)return front(x,y,.013);
      return [x,y,.129-.046*(x/width)**2+.005*Math.sin(3*u*Math.PI)];
    }),'#426552');
    for (const s of [-1,1]) k.tube(chest,m[cloth],'#8c5a46',[[s*.100,.354,.124],[s*.067,.422,.100],
      [s*.057,.468,.062],[s*.061,.478,0],[s*.069,.456,-.059]],.008,12,5);
    strip(.030,.099,.087,.092,'#64806a',cloth,.022);
    k.tube(chest,m[cloth],'#ac9775',[front(-.088,.098,.024),front(0,.098,.024),front(.088,.098,.024)],.002,8,4);
    for (const s of [-1,1]) k.tube(chest,m[cloth],'#89957b',[[s*.14,.142,.075],[s*.17,.133,0],
      [s*.114,.129,-.101],[0,.131,-.120]],.006,9,4);
  } else if (role==='player') {
    for (const s of [-1,1]) {
      const pts=[[s*.18,.407,.034],[s*.139,.36,.089],[s*.131,.316,.100],[s*.153,.259,.082],[s*.171,.252,.021]];
      k.tube(chest,m[cloth],'#e6d5aa',pts,.0067,14,5);
      k.tube(chest,m[cloth],'#dbb894',[[s*.155,.026,.018],[s*.144,.142,.022],[s*.161,.267,.026]],.009,9,5);
    }
    for (const depth of [1,-1]) {
      const z=depth>0?.140:-.125, ink='#eddfbe';
      k.rod(chest,m[cloth],ink,[-.030,.211,z],[-.030,.293,z],.006,.006,5);
      k.rod(chest,m[cloth],ink,[.001,.293,z],[.042,.293,z],.006,.006,5);
      k.rod(chest,m[cloth],ink,[.041,.293,z],[.012,.211,z],.006,.006,5);
    }
  } else if (role==='customer'||role==='shopper') {
    strip(-.016,.435,.043,.079,role==='customer'?'#ddd3b6':'#e4dbcd',role==='customer'?cloth:checks);
    for (const s of [-1,1]) {
      const edge=[-.016,.10,.20,.30,.397,.435].map(y=>front(s*lerp(.044,.080,(y+.016)/.451),y,.010));
      k.tube(chest,m[cloth],role==='customer'?'#9b503e':'#928667',edge,.0044,12,4);
    }
  } else {
    const edge=Array.from({length:8},(_,i)=>front(.002,-.008+i*.064,.009));
    k.tube(chest,m[cloth],role==='gardener'?'#667879':'#567b73',edge,.0035,12,4);
    for (const y of [.089,.170,.251,.329,.400]) {
      k.egg(chest,m[plain],'#b9b3a2',front(.002,y,.013),[.0042,.0045,.0022]);
    }
  }
  if (role==='collector'||role==='gardener') {
    for(const s of [-1,1]) k.put(chest,m[tile],grid(6,3,(u,v)=>front(s*.092+(u-.5)*.072,.218+v*.072,.011)),
      role==='collector'?'#648b84':person.shirt);
  }
}

function makeLeg(k,m,leg,person,role) {
  const { upper,lower,end,l1,l2,side }=leg, f=person.bulk;
  const sport=role==='player', wide=role==='customer'||role==='gardener';
  if (sport) {
    rounded(k,m,upper,skin,person.skin,[[-l1-.012,.056,.057,.009],[-.314,.069,.070,.010],
      [-.224,.075,.086,.002],[-.090,.085,.094,-.008]],f);
    rounded(k,m,upper,cloth,person.pants,[[-.255,.086,.087,.006],[-.239,.087,.089,.004],
      [-.177,.093,.091,.001],[-.065,.096,.102,-.004],[.044,.076,.086,-.009]],f,.86);
    k.tube(upper,m[cloth],'#dfcba2',[[side*.089,-.246,.013],[side*.094,-.182,.009],[side*.095,-.085,.012]],.0052,8,5);
    rounded(k,m,lower,skin,person.skin,[[-l2+.044,.037,.044,-.006],[-.244,.049,.054,-.017],
      [-.155,.065,.070,-.022],[-.082,.060,.059,-.006],[.022,.058,.056,.001]],f);
    rounded(k,m,lower,cloth,'#e2dfcb',[[-.347,.044,.046,-.009],[-.266,.046,.051,-.011],
      [-.245,.051,.057,-.014],[-.235,.050,.056,-.013]],f);
    for (const y of [-.251,-.263]) rounded(k,m,lower,cloth,'#97755c',[[y-.003,.049,.055,-.012],[y+.002,.050,.055,-.013]],f);
  } else {
    rounded(k,m,upper,denim,person.pants,[[-l1-.025,.057,.062,.006],[-l1+.005,.070,.072,.007],
      [-.310,.077,.080,.008],[-.245,.075,.084,.002],[-.154,.083,.090,-.004],
      [-.079,.089,.102,-.008],[.036,.078,.093,-.010]],f*(wide?1.06:1));
    rounded(k,m,lower,denim,person.pants,[[-.345,wide?.062:.051,.054,-.006],[-.323,.062,.060,-.010],
      [-.305,.056,.057,-.009],[-.258,.060,.060,-.009],[-.164,.065,.067,-.011],
      [-.083,.066,.066,-.005],[-.026,.069,.066,.002],[.029,.062,.062,0]],f*(wide?1.07:1));
    k.tube(lower,m[denim],person.pants,[[side*.056,-.310,-.006],[side*.060,-.226,-.005],
      [side*.065,-.140,-.001],[side*.067,-.061,.001]],.0028,8,4);
  }
  k.put(end,m[plain],loft([[-.078,.027,.022,-.041],[-.065,.046,.025,-.043],
    [-.020,.050,.024,-.044],[.052,.052,.019,-.046],[.113,.051,.018,-.044],
    [.151,.041,.016,-.040],[.163,.025,.012,-.036]],{axis:'z',cols:16,power:.64}),'#726d60');
  k.put(end,m[cloth],loft([[-.070,.028,.027,-.011],[-.051,.045,.046,-.002],[-.005,.044,.051,.004],
    [.050,.049,.041,-.006],[.097,.048,.030,-.014],[.134,.043,.020,-.023],[.154,.025,.014,-.026]],
    {axis:'z',cols:18,power:.84}),person.shoes);
  if (sport||role==='collector') for (let j=0;j<3;j++) k.tube(end,m[cloth],'#e3dac3',[[-.026,.044-j*.006,.010+j*.016],
    [0,.050-j*.006,.017+j*.016],[.028,.042-j*.006,.024+j*.016]],.0023,6,4);
}

function makeArm(k,m,arm,person,role) {
  const {upper,lower,end,l1,l2,side}=arm,f=person.bulk;
  const sport=role==='player',rolled=role==='cook'||role==='gardener',sleeve=role==='gardener'?flowers:cloth;
  const upperTile=sport?skin:sleeve, upperColor=sport?person.skin:person.shirt;
  rounded(k,m,upper,upperTile,upperColor,[[-l1-.022,.045,.047,.003],[-l1+.014,.057,.055,.001],
    [-.184,.062,.061,-.002],[-.105,.070,.069,0],[-.039,.076,.075,.001],
    [.014,.058,.062,0],[.036,.031,.037,0]],f);
  rounded(k,m,lower,skin,person.skin,[[-l2-.005,.028,.022,.004],[-.198,.032,.028,.002],
    [-.130,.041,.034,-.002],[-.055,.054,.047,-.008],[.024,.047,.044,.002]],f);
  if (!sport) {
    const stop=rolled?-.102:-.208;
    rounded(k,m,lower,sleeve,person.shirt,[[stop-.012,rolled?.054:.036,.041,0],
      [stop+.006,rolled?.058:.042,.048,-.001],[stop+.037,rolled?.057:.046,.048,-.004],
      [-.022,.057,.054,-.003],[.029,.054,.051,.002]],f);
    rounded(k,m,lower,cloth,role==='cook'?'#c7bc9e':person.shirt,
      [[stop-.012,rolled?.055:.037,.043,0],[stop+.006,rolled?.059:.043,.049,-.001]],f,.84);
  }
  rounded(k,m,end,skin,person.skin,[[-.083,.022,.014,.017],[-.062,.034,.019,.012],
    [-.026,.033,.020,.007],[.012,.025,.020,0]],f,.88,14);
  for(let j=0;j<4;j++) {
    const x=(j-1.5)*.0145*side,len=.028+.013*(1-Math.abs(j-1)/3);
    k.tube(end,m[skin],person.skin,[[x,-.058,.012],[x*1.04,-.077,.015],
      [x*1.08,-.067-len,.026],[x*1.08,-.066-len,.035]],.0072-.00035*j,6,5);
  }
  k.tube(end,m[skin],person.skin,[[-side*.024,-.019,.009],[-side*.039,-.037,.021],
    [-side*.038,-.054,.037]],.009,6,5);
}

function buildBody(k,m,role) {
  const person=wardrobe[role], root=node(null,'resident-'+role);
  const base=node(root,'activity',undefined,true), pelvis=node(base,'hips',[0,.844,0],true);
  const chest=node(pelvis,'chest',[0,.044,.004],true), head=node(chest,'head',[0,.555,.014],true);
  const arms=[],legs=[],blends=new Map();
  for(const s of [-1,1]) {
    const leg=chain(pelvis,'leg',s,[s*(person.hip*.64),.005,-.010],.403,.377);
    const arm=chain(chest,'arm',s,[s*(person.shoulder-.023),.402,.006],.290,.252);
    makeLeg(k,m,leg,person,role);makeArm(k,m,arm,person,role);
    for(const limb of [arm,leg]) {
      blends.set(limb.upper,{other:limb.lower,edge:-limb.l1,end:true});
      blends.set(limb.lower,{other:limb.upper,edge:0,end:false});
    }
    arms.push(arm);legs.push(leg);
  }
  makeTorso(k,m,person,role,chest,pelvis);
  sculptHead(k,m,head,person,role);
  root.userData.activity=person.title;
  const targets=()=>[-1,1].map(s=>({side:s,point:V(),pitch:0,yaw:0,roll:0}));
  return {root,base,pelvis,chest,head,arms,legs,blends,scale:person.height/1.694,
    pose:{hands:targets(),feet:targets(),hip:V(),lean:0,twist:0,roll:0,nod:0,look:0}};
}

// Bake all rigid charts, moving props and body parts into one indexed skin.
// At the elbow and knee the two bones share a narrow band of cloth/skin.
function batchResident(actor, tags, material) {
  const {root,base,blends}=actor;
  root.updateWorldMatrix(false,true);
  const parts=[],bones=[];
  root.traverse(o=>{if(o.isMesh)parts.push(o);else if(o.isBone)bones.push(o);});
  const boneIndex=new Map(bones.map((b,i)=>[b,i]));
  const count=parts.reduce((n,p)=>n+p.geometry.attributes.position.count,0);
  const pos=new Float32Array(count*3), nor=new Float32Array(count*3), uv=new Float32Array(count*2);
  const color=new Uint8Array(count*3), joints=new Uint8Array(count*4), weights=new Uint8Array(count*4);
  const indices=[],v=V(),n=V(),normalMatrix=new THREE.Matrix3();
  let offset=0;
  for (const piece of parts) {
    const geo=piece.geometry, a=geo.attributes, target=piece.parent, blend=blends.get(target);
    const tile=tags.indexOf(piece.material), col=tile%4, row=Math.floor(tile/4);
    normalMatrix.getNormalMatrix(piece.matrixWorld);
    for (let i=0;i<a.position.count;i++) {
      const j=offset+i, y=a.position.getY(i);
      v.fromBufferAttribute(a.position,i).applyMatrix4(piece.matrixWorld).toArray(pos,j*3);
      n.fromBufferAttribute(a.normal,i).applyNormalMatrix(normalMatrix).toArray(nor,j*3);
      uv[j*2]=(col*256+2.5+251*clamp(a.uv.getX(i),0,1))/1024;
      uv[j*2+1]=1-(row*256+2.5+251*(1-clamp(a.uv.getY(i),0,1)))/1024;
      for (let c=0;c<3;c++) color[j*3+c]=Math.round(clamp(a.color.array[i*3+c],0,1)*255);
      const mix=blend ? Math.round(112*smoothstep((y-blend.edge)*(blend.end?-1:1),-.049,.022)) : 0;
      weights[j*4]=255-mix; joints[j*4]=boneIndex.get(target);
      if (mix) {weights[j*4+1]=mix;joints[j*4+1]=boneIndex.get(blend.other);}
    }
    for (const index of geo.index.array) indices.push(offset+index);
    offset+=a.position.count;
    piece.removeFromParent();geo.dispose();
  }
  const geometry=new THREE.BufferGeometry();
  for(const [name,buffer,stride,normalized] of [['position',pos,3,false],['normal',nor,3,false],
    ['uv',uv,2,false],['color',color,3,true],['skinIndex',joints,4,false],['skinWeight',weights,4,true]]) {
    geometry.setAttribute(name,new THREE.BufferAttribute(buffer,stride,normalized));
  }
  geometry.setIndex(indices);
  const mesh=new THREE.SkinnedMesh(geometry,material);
  mesh.name=root.name+'-surface';mesh.castShadow=mesh.receiveShadow=true;
  root.add(mesh);mesh.add(base);root.updateWorldMatrix(false,true);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.boundingSphere=new THREE.Sphere(V(0,.98,0),2.05);
  return mesh;
}

function neutral(actor) {
  const p=actor.pose;
  p.hip.set(0,.844,0);p.lean=.045;p.twist=0;p.roll=0;p.nod=0;p.look=0;
  for(const h of p.hands){h.point.set(h.side*.234,.824,.055);h.pitch=-.18;h.yaw=h.roll=0;}
  for(const f of p.feet){f.point.set(f.side*.119,.002,.022);f.pitch=0;f.yaw=f.side*.082;f.roll=0;}
  return p;
}

function poser() {
  const solve=limbSolver(), matrix=new THREE.Matrix4(),basis=new THREE.Quaternion(), q=new THREE.Quaternion();
  const euler=new THREE.Euler(0,0,0,'YXZ'),point=V(),handle=V(),pole=V();
  return actor=>{
    const {root,pelvis,chest,head,pose:p}=actor;
    pelvis.rotation.set(0,-p.twist*.28,p.roll*.5);
    for(let i=0;i<2;i++) {
      const leg=actor.legs[i],f=p.feet[i];q.setFromEuler(euler.set(f.pitch,f.yaw,f.roll));
      point.copy(soleOffset).applyQuaternion(q).negate().add(f.point);
      handle.copy(leg.upper.position).applyQuaternion(pelvis.quaternion);
      const dx=point.x-p.hip.x-handle.x,dz=point.z-p.hip.z-handle.z, length=leg.l1+leg.l2-.001;
      p.hip.y=Math.min(p.hip.y,point.y-handle.y+Math.sqrt(Math.max(0,length*length-dx*dx-dz*dz)));
    }
    pelvis.position.copy(p.hip);
    chest.rotation.set(p.lean,p.twist,p.roll,'YXZ');
    head.rotation.set(p.nod-.52*p.lean,p.look,-.32*p.roll,'YXZ');
    for(const [parent,chains,targets,arm] of [[pelvis,actor.legs,p.feet,false],[chest,actor.arms,p.hands,true]]) {
      parent.updateWorldMatrix(true,false);
      matrix.copy(parent.matrixWorld).invert().multiply(root.matrixWorld);
      basis.setFromRotationMatrix(matrix);
      for(let i=0;i<2;i++){
        const limb=chains[i],t=targets[i];
        q.setFromEuler(euler.set(t.pitch,t.yaw,t.roll)).premultiply(basis);
        handle.copy(arm?handOffset:soleOffset).applyQuaternion(q);
        point.copy(t.point).applyMatrix4(matrix).sub(handle);
        if(arm)pole.set(limb.side*.69,-.68,-.59);
        else pole.set(limb.side*.15,.055,1);
        solve(limb,point,pole.applyQuaternion(basis),q);
      }
    }
  };
}

const prop=(parent,name,at)=>node(parent,name,at,true);
const ease=(t,a,b)=>smoothstep(t,a,b);
const windowOf=(t,a,b,c,d)=>ease(t,a,b)*(1-ease(t,c,d));

function inActor(actor, object, out, x=0, y=0, z=0) {
  object.localToWorld(out.set(x,y,z));return actor.root.worldToLocal(out);
}

function panel(k,m,parent,tile,tint,at,w,h,rotation) {
  k.put(parent,m[tile],grid(1,1,(u,v)=>[(u-.5)*w,(v-.5)*h,0]),tint,at,[1,1,1],rotation);
}

function phone(k,m,parent) {
  k.box(parent,m[plain],'#363c3d',[0,0,0],[.077,.145,.011],.005);
  k.box(parent,m[plain],'#93b6ae',[0,.001,.006],[.065,.121,.003],.002);
  k.box(parent,m[plain],'#dfcfa8',[0,-.024,.008],[.054,.033,.001]);
  for(const y of [.030,.013,-.040])k.box(parent,m[plain],'#516d68',[-.002,y,.008],[.042,.004,.001]);
}

function shippingBox(k,m,parent) {
  k.box(parent,m[paper],'#ecd3a6',[0,.115,0],[.35,.23,.253],.006);
  k.box(parent,m[plain],'#ae875b',[0,.231,0],[.055,.003,.251]);
  for(const s of [-1,1]) {
    k.box(parent,m[plain],'#a88158',[0,.199,s*.127],[.055,.066,.003]);
    k.tube(parent,m[paper],'#987451',[[s*.169,.011,-.121],[s*.171,.113,-.124],
      [s*.169,.224,-.120]],.002,5,4);
  }
  panel(k,m,parent,waybill,'#ffffff',[.077,.233,.023],.114,.124,[-Math.PI/2,0,-.075]);
  panel(k,m,parent,waybill,'#e9e5d7',[-.075,.123,.129],.108,.080,[0,0,.035]);
}

function packingStation(k,m,actor,stations) {
  const {packer,packingPoint}=stations;
  const anchor=V(packingPoint.x-packer.x,packingPoint.y-packer.y,packingPoint.z-packer.z)
    .applyAxisAngle(V(0,1,0),packer.heading).divideScalar(actor.scale);
  const bag=prop(actor.base,'counter-bag'), carton=prop(actor.base,'meal-carton');
  const lid=prop(carton,'carton-lid',[0,.061,-.062]);
  k.box(carton,m[plain],'#d1b58a',[0,.030,0],[.150,.059,.104],.007);
  k.box(lid,m[plain],'#e8dbb1',[0,.002,.062],[.156,.016,.121],.006);
  const bagRows=[[0,.088,.047,0],[.018,.100,.059,0],[.075,.104,.060,0],[.145,.106,.059,0],[.190,.104,.054,0]];
  // Four open panels and two gussets leave the lunch box visible as it goes in.
  for (const s of [-1,1]) {
    k.put(bag,m[paper],grid(10,4,(u,v,j)=>{
      const [y,w,d]=bagRows[j];return [(u-.5)*2*w,y,s*(d+.0024*Math.sin(u*3.14)*Math.sin(v*3.14))];
    },{flip:s<0}),'#ead6ac');
    k.put(bag,m[paper],grid(8,4,(u,v,j)=>{
      const [y,w,d]=bagRows[j];return [s*(w-.014*Math.sin(Math.PI*u)*v),y,(u-.5)*2*d];
    },{flip:s>0}),'#dfc59a');
    k.tube(bag,m[paper],'#c6a77e',[[-.050,.177,s*.054],[-.048,.229,s*.048],
      [-.031,.256,s*.034],[.031,.256,s*.034],[.048,.229,s*.048],[.050,.177,s*.054]],.0042,14,5);
  }
  k.box(bag,m[paper],'#b99b72',[0,.006,0],[.186,.009,.101]);
  panel(k,m,bag,waybill,'#fcf0ce',[.034,.090,.0605],.052,.074);
  const seal=prop(bag,'packing-seal',[0,.188,.050]);
  k.box(seal,m[plain],'#ad4935',[0,-.022,.006],[.030,.047,.003]);
  k.box(seal,m[plain],'#ad4935',[0,.001,-.014],[.030,.004,.043]);
  const right=V(),left=V(),boxGrip=V();
  return (t,p)=>{
    const u=(t%7.8)/7.8;
    const close=ease(u,.065,.185),insert=ease(u,.245,.475);
    const lift=.16*windowOf(u,.165,.255,.404,.531)+.05*windowOf(u,.28,.35,.42,.55);
    // A completed bag is lifted off the worktop and lowered behind its street
    // edge for pickup. The next empty bag rises into place from below the sill.
    const pass=windowOf(u,.668,.810,.909,1);
    const lowered=windowOf(u,.795,.876,.920,1);
    bag.position.copy(anchor);
    bag.position.x+=.235*pass;
    bag.position.z+=.057*pass-.40*lowered;
    bag.position.y+=.073*windowOf(u,.675,.734,.780,.832)-.368*lowered;
    carton.position.copy(anchor);carton.position.x+=lerp(-.214,.003,insert);
    carton.position.z+=lerp(-.040,0,insert);carton.position.y+=lift+.012;
    // Once inside, the container travels with the bag. Reset below the rim.
    if(u>.535) carton.position.copy(bag.position).add(boxGrip.set(0,.013,0));
    lid.rotation.x=-1.04*(1-close);
    seal.scale.setScalar(u>.863?.0001:Math.max(.0001,ease(u,.555,.633)));
    right.copy(carton.position);right.x-=.059;right.y+=.055;
    left.copy(carton.position);left.x+=.056;left.y+=.063;
    if(u<.215) left.y+=.095*(1-close);
    const finish=ease(u,.463,.550);
    right.lerp(boxGrip.copy(bag.position).add(boxGripOffsetRight),finish);
    left.lerp(boxGrip.copy(bag.position).add(boxGripOffsetLeft),finish);
    right.y+=.041*windowOf(u,.51,.55,.60,.645);
    if(u>.735) {
      right.lerp(boxGrip.set(-.20,.89,.16),ease(u,.74,.85));
      left.lerp(boxGrip.set(.22,.88,.20),ease(u,.81,.92));
      const reset=ease(u,.925,1);
      right.lerp(boxGrip.copy(anchor).add(startingRight),reset);
      left.lerp(boxGrip.copy(anchor).add(startingLeft),reset);
    }
    p.hands[0].point.copy(right);p.hands[1].point.copy(left);
    p.hands[0].pitch=-1.13;p.hands[1].pitch=-1.23;
    p.lean=.17+.17*windowOf(u,.18,.28,.52,.64);p.twist=.10*Math.sin(u*turn)-.11*pass;
    p.nod=.26-.38*pass;p.look=.12*Math.sin(u*turn)-.32*pass;
    p.feet[0].point.z+=.076;p.feet[1].point.z-=.049;
  };
}

const boxGripOffsetRight=V(-.036,.213,.035),boxGripOffsetLeft=V(.051,.244,.021);
const startingRight=V(-.273,.067,-.040),startingLeft=V(-.158,.170,-.040);

function waitingCustomer(k,m,actor) {
  const mobile=prop(actor.arms[0].end,'customer-phone',[-.004,-.096,.018]);
  mobile.rotation.set(-.31,.07,.07);
  phone(k,m,mobile);
  const tote=prop(actor.base,'canvas-market-tote');
  k.put(tote,m[denim],loft([[-.386,.103,.044,.004],[-.371,.134,.057,0],
    [-.262,.142,.058,0],[-.145,.142,.046,0],[-.120,.134,.040,.002]],{cols:24,power:.47}),'#ced0b8');
  for (const s of [-1,1])k.tube(tote,m[cloth],'#22645d',[[-.083,-.137,s*.041],[-.073,-.069,s*.037],
    [-.035,-.008,s*.012],[.026,0,s*.009],[.065,-.053,s*.033],[.080,-.138,s*.041]],.0065,14,5);
  for(const x of [-.086,.080]) k.tube(tote,m[cloth],'#719382',[[x,-.358,.049],[x,-.268,.060],[x,-.143,.045]],.004,9,4);
  return (t,p)=>{
    const u=(t%8.2)/8.2, glance=windowOf(u,.17,.31,.67,.81), breath=Math.sin(t*2.1);
    p.hands[0].point.set(-.095,1.088+.151*glance,.264+.068*glance);
    p.hands[0].pitch=-1.73+.19*glance;p.hands[0].roll=-.11;
    p.hands[1].point.set(.265,.789+breath*.004,.063);
    p.hands[1].pitch=-.20;p.hip.x=.019*Math.sin(t*.71);
    tote.position.copy(p.hands[1].point);tote.rotation.set(.023*breath,.07,-.072);
    p.nod=.025+.38*glance;p.look=.32*(1-glance)-.08*glance;
    p.twist=.063*(1-glance);p.roll=-.038;p.feet[0].point.z+=.091;
  };
}

function waterGarden(k,m,actor) {
  const can=prop(actor.base,'watering-can');
  k.put(can,m[plain],loft([[-.151,.083,.080,0],[-.141,.122,.093,0],
    [-.114,.132,.099,0],[.054,.114,.083,.005],[.088,.098,.075,.007]],
    {cols:22,power:.88}),'#478b87');
  for(const y of [-.13,.051]) k.put(can,m[plain],loft([[y,.123,.092,.002],
    [y+.005,.123,.092,.002]],{cols:22}),'#74a5a0');
  k.tube(can,m[plain],'#547e73',[[0,.044,-.076],[0,.145,-.087],[0,.202,-.043],
    [0,.202,.041],[0,.157,.085],[0,.064,.073]],.011,18,7);
  k.rod(can,m[plain],'#659e92',[0,-.106,.067],[0,.114,.323],.043,.020,12);
  k.rod(can,m[plain],'#909d86',[0,.111,.318],[0,.139,.348],.029,.048,13);
  const water=prop(actor.base,'watering-stream');
  for (let j=0;j<4;j++) {
    const x=(j-1.5)*.009;
    k.tube(water,m[plain],j%2?'#acc7c1':'#82aeaa',[[x,0,0],[x*1.25,-.20,.030],
      [x*1.7,-.55,.031],[x*2.15,-1,.009]],.0025+.0006*(j%2),10,4);
  }
  const tip=V(),aim=V(),down=V(0,-1,0);
  return (t,p)=>{
    const u=(t%7.1)/7.1,pour=windowOf(u,.08,.29,.67,.88),sweep=.11*Math.sin(t*1.35)*pour;
    p.lean=.14+.21*pour;p.nod=.13+.19*pour;p.roll=-.05*pour;p.look=sweep;
    p.hip.y-=.041*pour;p.feet[1].point.z+=.093;p.feet[0].point.z-=.075;
    can.position.set(-.065+sweep,.861+.123*pour,.291+.050*pour);can.rotation.set(.12+.82*pour,sweep,.055,'YXZ');
    p.hands[0].point.set(0,.201,-.026).applyQuaternion(can.quaternion).add(can.position);
    p.hands[1].point.set(.092,-.054,.070).applyQuaternion(can.quaternion).add(can.position);
    p.hands[0].pitch=-1.55;p.hands[1].pitch=-1.87;
    tip.set(0,.139,.350).applyQuaternion(can.quaternion).add(can.position);
    water.position.copy(tip);aim.set(tip.x+sweep*.19,.594/actor.scale,tip.z+.134).sub(tip);
    const flow=smoothstep(pour,.59,.84);
    const length=aim.length();
    water.quaternion.setFromUnitVectors(down,aim.normalize());
    water.scale.set(Math.max(.0001,flow),Math.max(.0001,length*flow),Math.max(.0001,flow));
  };
}

function basketballDrill(k,m,actor,site) {
  const ball=prop(actor.base,'practice-ball'),r=.119/actor.scale;
  k.egg(ball,m[cloth],'#d0793f',[0,0,0],[r,r,r]);
  const radius=r+.0007;
  for(let seam=0;seam<4;seam++) {
    const line=Array.from({length:32},(_,i)=>{
      const a=i/32*turn;
      if(seam===0)return [Math.cos(a)*radius,0,Math.sin(a)*radius];
      if(seam===1)return [0,Math.cos(a)*radius,Math.sin(a)*radius];
      const x=(seam===2?1:-1)*(.51+.19*Math.cos(2*a)),circle=Math.sqrt(1-x*x);
      return [x*radius,Math.sin(a)*circle*radius,Math.cos(a)*circle*radius];
    });
    k.tube(ball,m[plain],'#403b33',line,.0026,32,5,true);
  }
  const yaw=site.yaw;
  let previousBeat=null;
  return (t,p)=>{
    const u=(t%5.7)/5.7,lead=windowOf(u,.090,.235,.61,.77),trail=windowOf(u,.245,.40,.46,.60);
    const weight=(lead+trail)*.215,shift=weight-.215;
    actor.root.position.x=site.x+Math.cos(yaw)*shift*actor.scale;
    actor.root.position.z=site.z-Math.sin(yaw)*shift*actor.scale;
    p.feet[0].point.set(-.209+.43*trail-weight,.002+.071*Math.sin(trail*Math.PI),.078);
    p.feet[1].point.set(.209+.43*lead-weight,.002+.071*Math.sin(lead*Math.PI),-.072);
    const beat=t/.76, n=Math.floor(beat), f=beat-n, side=n%2?-1:1;
    if(previousBeat!==null && n>previousBeat) site.onBounce?.(actor.root.position);
    previousBeat=n;
    const arc=4*f*(1-f), active=windowOf(f,.25,.425,.57,.74);
    ball.position.set(.352*Math.sin(beat*Math.PI),r+.662*arc,.330+.025*Math.cos(beat*Math.PI));
    ball.rotation.set(beat*.67,beat*1.93,.22*Math.sin(beat*Math.PI));
    p.hip.x=.050*Math.sin(beat*Math.PI);p.hip.y=.765+.028*arc;
    p.lean=.20+.05*(1-arc);p.twist=.09*Math.sin(beat*Math.PI);
    p.nod=.05+.12*(1-arc);p.look=.14-.16*Math.sin(beat*Math.PI);
    for (const h of p.hands) {
      h.point.set(h.side*.304,1.046+.035*arc,.215);h.pitch=-1.32;
      if(h.side===side) {
        h.point.x=lerp(h.point.x,ball.position.x,active);
        h.point.y=lerp(.909+.054*arc,ball.position.y+r+.004,active);
        h.point.z=lerp(.298,ball.position.z,active);h.pitch=-1.58+.20*(1-active);
      }
    }
  };
}

// The trolley takes its own path behind the shopper. Wheels roll along the
// paving and the handle follows the axle through the two rounded turns.
function shoppingWalk(k,m,actor,site) {
  const cart=prop(actor.base,'produce-trolley'), wheels=[];
  for (const s of [-1,1]) {
    k.rod(cart,m[plain],'#8d978c',[s*.139,.112,-.066],[s*.139,.789,.283],.011,.012,9);
    k.rod(cart,m[plain],'#9ca49a',[s*.148,.114,-.112],[s*.148,.102,.130],.009,.009,7);
    const wheel=prop(cart,'trolley-wheel'+s,[s*.183,.123,0]);
    k.put(wheel,m[plain],new THREE.TorusGeometry(.094,.028,7,20),'#494a40',[0,0,0],[1,1,1],[0,Math.PI/2,0]);
    k.rod(wheel,m[plain],'#9a9f91',[-.017,0,0],[.017,0,0],.080,.080,14);
    for(let i=0;i<4;i++)k.box(wheel,m[plain],'#62665e',[s*.019,0,0],[.005,.010,.134],0,[i*Math.PI/4,0,0]);
    wheels.push(wheel);
  }
  k.rod(cart,m[plain],'#343f3d',[-.151,.793,.286],[.151,.793,.286],.019,.019,11);
  k.rod(cart,m[plain],'#797e73',[-.187,.123,0],[.187,.123,0],.012,.012,9);
  k.put(cart,m[checks],loft([[.130,.099,.108,0],[.158,.141,.121,.012],[.244,.144,.127,.035],
    [.41,.147,.129,.097],[.535,.140,.113,.130],[.58,.137,.098,.145]],{power:.45,cols:24}),'#faf3db');
  k.tube(cart,m[cloth],'#445a52',[[-.128,.570,.066],[-.134,.382,-.022],[-.126,.168,-.081],
    [.126,.168,-.081],[.134,.382,-.022],[.128,.570,.066]],.005,16,5);
  for(let j=0;j<6;j++) {
    const x=(j-2.5)*.029, z=.117+.034*Math.sin(j);
    k.rod(cart,m[cloth],'#c5c59d',[x,.543,z],[x+.013,.664,z-.015],.009,.007,6);
    for(const side of [-1,1]) k.put(cart,m[cloth],grid(3,6,(u,v)=>{
      const w=.011*(.16+.84*Math.sin(Math.PI*v));
      return [x+.013+side*v*.056+(u-.5)*w,.646+v*(.143+.032*(j%3)),z-.013-.065*v*v];
    },{flip:side<0}),j%2?'#779063':'#5f865c');
  }
  const width=4.10,r=.58,arc=Math.PI*r,loop=2*(width+arc),up=V(0,1,0);
  const leader=V(),trailer=V(),handle=V();
  function path(distance,out) {
    let d=THREE.MathUtils.euclideanModulo(distance,loop);
    if(d<width){out.set(-width/2+d,0,-r);return Math.PI/2;}
    d-=width;
    if(d<arc){const a=d/r;out.set(width/2+r*Math.sin(a),0,-r*Math.cos(a));return Math.PI/2-a;}
    d-=arc;
    if(d<width){out.set(width/2-d,0,r);return -Math.PI/2;}
    const a=(d-width)/r;out.set(-width/2-r*Math.sin(a),0,r*Math.cos(a));return -Math.PI/2-a;
  }
  return (t,p)=>{
    const distance=t*.74,yaw=path(distance,leader),rearYaw=path(distance-.47,trailer);
    actor.root.position.set(site.x+leader.x,site.y,site.z+leader.z);actor.root.rotation.y=yaw;
    trailer.x-=.306*Math.cos(rearYaw);trailer.z+=.306*Math.sin(rearYaw);
    handle.set(leader.x-.265*Math.cos(yaw),0,leader.z+.265*Math.sin(yaw)).sub(trailer);
    cart.rotation.y=Math.atan2(handle.x,handle.z)-yaw;
    cart.position.copy(trailer).sub(leader).applyAxisAngle(up,-yaw).divideScalar(actor.scale);
    for(const wheel of wheels)wheel.rotation.x=distance/(.122*actor.scale);
    const cycle=distance/1.00, sin=Math.sin(cycle*turn);
    for(let i=0;i<2;i++) {
      const f=p.feet[i],u=(cycle+.5*i)%1,sw=clamp((u-.54)/.46,0,1);
      f.point.z+=(u<.54?.27-u:.54*(smoothstep(sw,0,1)-.5))/actor.scale;
      f.point.y+=.086*Math.sin(Math.PI*sw);f.pitch=-.16*Math.sin(Math.PI*sw);
    }
    p.hip.y-=.020+.020*Math.cos(cycle*turn*2);p.hip.x=.015*sin;p.lean=.135;p.twist=.063*sin;
    p.nod=.02+.021*Math.cos(cycle*turn*2);p.look=.115*Math.sin(t*.74);
    p.hands[1].point.set(.228,.831,.068-.144*sin);p.hands[1].pitch=-.25-.28*sin;
    inActor(actor,cart,p.hands[0].point,0,.797,.286);p.hands[0].pitch=-.84;
  };
}

function collectParcel(k,m,actor) {
  const box=prop(actor.base,'resident-waybill-box'), reader=prop(actor.arms[1].end,'pickup-code-phone',[0,-.092,.015]);
  shippingBox(k,m,box);reader.rotation.set(-.38,.09,-.08);phone(k,m,reader);
  k.tube(actor.pelvis,m[cloth],'#726854',[[.127,.063,.064],[.169,-.018,.014],[.168,-.11,-.045]],.010,10,6);
  k.box(actor.pelvis,m[denim],'#8a7658',[.161,-.133,-.049],[.071,.166,.126],.011,[.08,0,-.09]);
  return (t,p)=>{
    const u=(t%8.6)/8.6, scan=windowOf(u,.075,.25,.42,.58),settle=windowOf(u,.56,.73,.85,.994);
    // The resident reads the locker code, turns the label into the light, then
    // repositions the same parcel against her hip to carry it to the building.
    box.position.set(-.086+.025*scan,.869+.104*scan-.050*settle,.191+.065*scan);
    box.rotation.set(-.09-.22*scan,.15+.21*settle,-.08+.08*scan,'YXZ');
    p.hands[0].point.set(-.122,.021,.071).applyQuaternion(box.quaternion).add(box.position);
    p.hands[0].pitch=-1.93;
    p.hands[1].point.set(.108+.044*scan,1.075+.165*scan,.244+.115*scan);
    p.hands[1].pitch=-1.80-.16*scan;p.hands[1].roll=-.11;
    p.nod=.17+.22*scan-.16*settle;p.look=.28-.45*scan-.28*settle;
    p.lean=.074+.067*scan;p.twist=.18-.14*scan+.11*settle;p.roll=.035;
    p.feet[0].point.z+=.063;p.feet[1].point.z-=.045;
  };
}

function stationsFor(course,scene) {
  const {square,court,garden}=course.landmarks;
  const ground=scene.getObjectByName('街坊铺地')?.getWorldPosition(V()).y ?? -.025;
  const kitchen=marketStaffStations(course), furniture=marketSites(course);
  const shelter=furniture.find(b=>b.id==='market-rest-canopy');
  const parcels=course.blocks.find(b=>b.id==='courtLife-parcels') ?? courtyardLots(course).find(b=>b.id==='courtLife-parcels');
  return {
    cook:{...kitchen.packer,yaw:-kitchen.packer.heading,kitchen},
    customer:{x:shelter?shelter.x-2.91:square.x+6.74,y:ground,z:shelter?shelter.z+2.61:square.z-10.64,yaw:-.73},
    gardener:{x:garden.x-garden.w/2-.59,y:ground,z:garden.z-garden.d/2+.60,yaw:Math.PI/2},
    player:{x:court.x+3.80,y:court.h+.011,z:court.z+court.d/2-1.94,yaw:2.47},
    shopper:{x:course.landmarks.tree.x+11.85,y:ground,z:course.landmarks.tree.z+17.83,yaw:Math.PI/2},
    collector:{x:parcels.x-.69,y:ground,z:parcels.z+parcels.d/2+.43,yaw:2.45},
  };
}

const activities={
  cook:(k,m,a,s)=>packingStation(k,m,a,s.kitchen),
  customer:waitingCustomer,gardener:waterGarden,player:basketballDrill,shopper:shoppingWalk,collector:collectParcel,
};

/** Ambient campaign cast. The staff and furniture use the same metre-based sites.
 * No actor participates in collision, orders, interaction targeting or guard state.
 */
export function createResidentLife({art,scene,course,renderer,camera,onCourtBounce}) {
  const group=node(null,'街坊日常'),sites=stationsFor(course,scene),actors=[];
  sites.player.onBounce=onCourtBounce;
  const tags=Array.from({length:16},(_,i)=>new THREE.MeshBasicMaterial({name:'chart-'+i}));
  const image=new Image(),map=new THREE.Texture(image);
  map.colorSpace=THREE.SRGBColorSpace;
  map.anisotropy=Math.min(4,renderer?.capabilities?.getMaxAnisotropy?.() ?? 1);
  const rough=new Uint8Array(4*4*4);
  for(let i=0;i<16;i++){
    const pixel=((3-Math.floor(i/4))*4+i%4)*4;
    const value=i===plain?137:i===skin||i<6?202:i===hair?186:237;
    rough.set([value,value,value,255],pixel);
  }
  const roughness=new THREE.DataTexture(rough,4,4);
  roughness.magFilter=roughness.minFilter=THREE.NearestFilter;roughness.needsUpdate=true;
  const material=new THREE.MeshStandardMaterial({name:'neighbourhood-clothing-and-props',
    map,roughnessMap:roughness,vertexColors:true,roughness:1,metalness:.025});
  const finishPose=poser(), scratch={keepGeometry:g=>g,material:art.material};
  let disposed=false;
  const startTime={cook:0,customer:2.6,gardener:2.6,player:.37,shopper:1.9,collector:2.4};
  for(const [role,site] of Object.entries(sites)) {
    const builder=solidBuilder(scratch),actor=buildBody(builder,tags,role);
    const activity=activities[role](builder,tags,actor,site);
    builder.finish();
    const mesh=batchResident(actor,tags,material);
    actor.root.scale.setScalar(actor.scale);
    actor.root.position.set(site.x,site.y,site.z);actor.root.rotation.y=site.yaw;
    group.add(actor.root);
    const pose=t=>{activity(t,neutral(actor));finishPose(actor);};
    pose(startTime[role]);
    actors.push({actor,mesh,pose,time:startTime[role],pending:0});
  }
  for (const tag of tags) tag.dispose();
  group.visible=false;scene.add(group);
  image.src=neighbourhoodAtlas;
  const ready=image.decode().then(()=>{
    if(disposed)return;
    map.needsUpdate=true;group.visible=true;
  });
  const eye=V();
  function update(frame,dt=0) {
    if(disposed)return;
    const focus=frame?.actor ?? frame?.walker ?? frame?.bike;
    if(!focus)return;
    if(camera)camera.getWorldPosition(eye);else eye.set(focus.x,focus.y??0,focus.z);
    const paused=frame.paused || (frame.stage && frame.stage!=='drive');
    const delta=paused?0:clamp(Number.isFinite(dt)?dt:0,0,.25);
    for(const entry of actors) {
      const {root}=entry.actor;
      const dx=root.position.x-focus.x,dz=root.position.z-focus.z;
      const distanceSq=Math.min(dx*dx+dz*dz,root.position.distanceToSquared(eye));
      root.visible=distanceSq<74*74;
      if(!root.visible || distanceSq>50*50){entry.pending=0;continue;}
      if(!delta)continue;
      entry.pending+=delta;
      if(distanceSq>23*23 && entry.pending<1/15)continue;
      entry.time+=entry.pending;entry.pending=0;
      entry.pose(entry.time);
    }
  }
  function dispose() {
    if(disposed)return;
    disposed=true;group.removeFromParent();
    for(const {mesh} of actors){mesh.skeleton.dispose();mesh.geometry.dispose();}
    map.dispose();roughness.dispose();material.dispose();
  }
  return {ready,update,dispose};
}
