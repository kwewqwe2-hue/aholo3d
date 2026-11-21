import * as THREE from 'three';
import { canvas2d, loadEstateTexture, sequence } from './estate-ground.js';
import { fullTurn, rngFor } from './estate-kit.js';
import { softPlantPositions } from './estate-planting.js';
import banyanSpray from './assets/estate/banyan-spray.webp?url&inline';
import barkColor from './assets/estate/fever_tree_bark-color.webp?url&inline';
import barkNormal from './assets/estate/fever_tree_bark-normal.webp?url&inline';
import barkRoughness from './assets/estate/fever_tree_bark-roughness.webp?url&inline';

// A spray contains bent, intersecting branchlets in 3D. Each branchlet carries
// its own pairs of leaves. The silhouette works from below as well as overhead.
function sprayAtlas(art) {
  const [canvas,g]=canvas2d(192,256), random=sequence(517);
  function leaf(x,y,angle,length,width,shade){
    g.save();g.translate(x,y);g.rotate(angle);
    g.fillStyle=shade;g.beginPath();g.moveTo(0,0);
    g.quadraticCurveTo(-width*.7,-length*.54,0,-length);
    g.quadraticCurveTo(width*.82,-length*.47,0,0);g.fill();
    g.strokeStyle='rgba(228,226,140,.38)';g.lineWidth=.7;
    g.beginPath();g.moveTo(0,0);g.lineTo(0,-length*.79);g.stroke();g.restore();
  }
  const palette=['#688148','#788e4c','#91a655','#a4b867','#597747','#82974e'];
  g.strokeStyle='#706d3d';g.lineCap='round';g.lineWidth=3;
  g.beginPath();g.moveTo(94,254);g.bezierCurveTo(73,172,107,88,96,10);g.stroke();
  for(let i=0;i<8;i++)for(const side of [-1,1]){
    const y=225-i*25+random()*10,x=91+Math.sin(i*.86)*6;
    const len=(31+31*Math.sin((i+1)*Math.PI/10))*(.84+random()*.21);
    const endX=x+side*len,endY=y-20-random()*16;
    g.lineWidth=1.7;g.beginPath();g.moveTo(x,y);g.quadraticCurveTo((x+endX)/2,y-10,endX,endY);g.stroke();
    for(let j=1;j<=4;j++){
      const v=j/4,l=16+random()*11;
      leaf(x+(endX-x)*v,y+(endY-y)*v,side*(j%2?.48:1.92),l,9+random()*4,palette[(i+j+(side+1))%palette.length]);
    }
  }
  leaf(96,29,.19,24,10,palette[3]);
  return art.texture(canvas);
}

function crownGeometry(seed,count=30,bladeScale=1,stemU=.5){
  const rand=sequence(seed), p=[],uv=[],normal=[],idx=[];
  const anchor=new THREE.Vector3(), tangent=new THREE.Vector3(), along=new THREE.Vector3(), outward=new THREE.Vector3();
  for(let i=0;i<count;i++){
    const angle=i*2.39996+rand()*.48, elevation=(i+.5)/count*1.78-.79;
    outward.set(Math.cos(angle)*Math.cos(elevation),Math.sin(elevation),Math.sin(angle)*Math.cos(elevation));
    tangent.set(-Math.sin(angle),0,Math.cos(angle));
    along.copy(outward).multiplyScalar(.58);along.y+=.16+rand()*.24;along.normalize();
    anchor.copy(outward).multiplyScalar(.16+rand()*.18);
    const width=(.31+rand()*.20)*bladeScale,height=(.43+rand()*.16)*bladeScale,first=p.length/3;
    for(let row=0;row<3;row++)for(let col=0;col<2;col++){
      const v=row/2, vertex=anchor.clone().addScaledVector(tangent,(col-stemU)*width);
      vertex.addScaledVector(along,(v-.34)*height);
      vertex.y-=.13*v*v;
      p.push(vertex.x,vertex.y,vertex.z);uv.push(col,v);
      const n=outward.clone();n.y+=.58;n.normalize();normal.push(n.x,n.y,n.z);
    }
    for(let row=0;row<2;row++){
      const a=first+row*2;idx.push(a,a+1,a+2,a+1,a+3,a+2);
    }
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geo.setAttribute('normal',new THREE.Float32BufferAttribute(normal,3));geo.setIndex(idx);return geo;
}

// One pendant or flower head shares a single mesh across the entire estate.
function blossomGeometry(hanging) {
  const rand=sequence(hanging?325:129), p=[],colors=[],idx=[];
  const n=hanging?15:8;
  for(let i=0;i<n;i++){
    const v=i/n, a=i*2.39996, r=hanging?.13*(1-v):.27*Math.sqrt(v);
    const x=Math.cos(a)*r,z=Math.sin(a)*r,y=hanging?.45-v*.93:.16*(1-v);
    const radius=(hanging?.11*(1-v*.75):.10)*(.88+rand()*.22),start=p.length/3;
    p.push(x,y+.04,z);
    const light=.76+rand()*.24; colors.push(light,light,light);
    for(let j=0;j<5;j++){
      const t=j*fullTurn/5;
      p.push(x+Math.cos(t)*radius,y-.038-rand()*.03,z+Math.sin(t)*radius);
      colors.push(light*.88,light*.88,light*.88);idx.push(start,start+1+j,start+1+(j+1)%5);
    }
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geo.setIndex(idx);geo.computeVertexNormals();return geo;
}

function banyanTrunk() {
  const p=[],idx=[],uv=[],sides=17;
  const sections=[[0,.55,0,0],[.11,.46,-.03,.04],[.26,.33,.035,.05],[.52,.27,.12,.02],[.75,.23,.075,-.06],[1,.21,-.08,-.10]];
  sections.forEach(([y,r,dx,dz],i)=>{
    for(let j=0;j<sides;j++){
      const a=j*fullTurn/sides, flute=.77+.23*Math.sin(5*a+y*3.0);
      p.push(dx+Math.cos(a)*r*flute,y,dz+Math.sin(a)*r*flute);
      uv.push(j/sides,y);
      if(i){const a0=(i-1)*sides+j,a1=(i-1)*sides+(j+1)%sides;
        idx.push(a0,a0+sides,a1,a1,a0+sides,a1+sides);}
    }
  });
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geo.setIndex(idx);geo.computeVertexNormals();return geo;
}

function barkMaterial(art) {
  const [canvas,g]=canvas2d(384,512),rnd=sequence(592);
  g.fillStyle='#b6b2a5';g.fillRect(0,0,384,512);
  for(let i=0;i<880;i++) {
    const x=rnd()*384,y=rnd()*550-40,h=8+rnd()**2*125,w=rnd()*4;
    g.strokeStyle=i%3?'rgba(62,62,52,.23)':'rgba(232,225,197,.43)';
    g.lineWidth=.55+rnd()*2.1;g.beginPath();g.moveTo(x,y);
    g.bezierCurveTo(x+w,y+h*.2,x-w*1.7,y+h*.65,x+w*.5,y+h);g.stroke();
  }
  for(let i=0;i<1350;i++) {
    g.fillStyle=i%2?'rgba(155,170,125,.42)':'rgba(68,73,59,.19)';
    g.fillRect(rnd()*384,rnd()*512,.6+rnd()*4,.5+rnd()*2);
  }
  const map=art.texture(canvas,true);
  const material=art.keepMaterial(new THREE.MeshStandardMaterial({map,roughness:.99}));
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',`
      #include <uv_vertex>
      #ifdef USE_INSTANCING
        vec2 span=vec2(length(instanceMatrix[0].xyz)*3.14,length(instanceMatrix[1].xyz));
        vMapUv=uv*max(span,vec2(.6))/vec2(1.34,2.2)+instanceMatrix[3].xz*.37;
      #endif
    `);
  };
  material.customProgramCacheKey=()=>'estate-bark';
  return material;
}

// A mature banyan spreads thin, sinuous buttresses across its root plate.
function buttressGeometry() {
  const p=[],uv=[],idx=[],colors=[];
  const stations=[[0,.96,.31,0],[.16,1,.23,.07],[.41,.52,.19,-.04],[.66,.20,.14,.10],[1,.045,.027,.16]];
  for(const [x,height,width,bend] of stations) {
    const first=p.length/3;
    for(const [h,w] of [[0,-1],[.19,-.65],[1,-.12],[.89,.23],[.18,.79],[0,1]]) {
      p.push(x,h*height,bend+w*width);uv.push(x/1.36,h*height/1.36);
      const c=.79+h*.19;colors.push(c,c*.98,c*.94);
    }
    if(first)for(let j=0;j<5;j++) {
      const a=first-6+j,b=first+j;
      idx.push(a,a+1,b,b,a+1,b+1);
    }
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geo.setIndex(idx);geo.computeVertexNormals();return geo;
}

function hedgeCore(art) {
  const geometry=art.keepGeometry(new THREE.IcosahedronGeometry(.5,1));
  const pos=geometry.attributes.position, colors=[];
  for(let i=0;i<pos.count;i++) {
    const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
    const lobe=1+.12*Math.sin(x*14+z*6)*Math.cos(y*17-z*13);
    pos.setXYZ(i,x*lobe,y*(.94+.14*Math.cos(x*11))+x*.08,z*lobe);
    const v=.59+.43*(y+.5)+.09*Math.sin(x*19+z*8);
    colors.push(v*.93,v,v*.87);
  }
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
  const [sheet,g]=canvas2d(256),rnd=sequence(1807);
  g.fillStyle='#708063';g.fillRect(0,0,256,256);
  for(let j=0;j<2000;j++) {
    const x=rnd()*256,y=rnd()*256;
    g.fillStyle=['#809366','#8a9b70','#667c5b','#738958','#99a879'][j%5];
    g.beginPath();g.ellipse(x,y,2+rnd()*5,1.2+rnd()*2,rnd()*3,0,fullTurn);g.fill();
  }
  const map=art.texture(sheet,true);map.repeat.set(3,2);
  return {geometry,material:art.keepMaterial(new THREE.MeshLambertMaterial({map,vertexColors:true}))};
}

function treeSoil(art) {
  const [c,g]=canvas2d(256),rnd=sequence(3806);
  g.fillStyle='#625a48';g.fillRect(0,0,256,256);
  for(let i=0;i<4500;i++) {
    g.fillStyle=['#4d493c','#746b53','#796c54','#6a624f','#95876b'][i%5];
    g.beginPath();g.ellipse(rnd()*256,rnd()*256,.6+rnd()*3,.4+rnd()*1.2,rnd()*3,0,fullTurn);g.fill();
  }
  const map=art.texture(c,true);map.repeat.set(9,6);
  return art.keepMaterial(new THREE.MeshStandardMaterial({map,roughness:.99}));
}

export function preparePlants(kit) {
  kit.geometry.spray=kit.art.keepGeometry(crownGeometry(1953));
  // The photographed stem starts at u=.35 on the bottom of the image.
  // With the default flipY, v=0 lies at the inward end of each curved card.
  kit.geometry.canopySpray=kit.art.keepGeometry(crownGeometry(1953,30,.94,.35));
  kit.geometry.distantSpray=kit.art.keepGeometry(crownGeometry(1953,12,1.34));
  kit.geometry.shrub=kit.art.keepGeometry(crownGeometry(643,10));
  kit.geometry.wisteria=kit.art.keepGeometry(blossomGeometry(true));
  kit.geometry.blossom=kit.art.keepGeometry(blossomGeometry(false));
  kit.geometry.trunk=kit.art.keepGeometry(banyanTrunk());
  kit.geometry.buttress=kit.art.keepGeometry(buttressGeometry());
  kit.material.bark=barkMaterial(kit.art);
  const hedge=hedgeCore(kit.art);
  kit.geometry.hedge=hedge.geometry;kit.material.hedge=hedge.material;
  kit.geometry.treePit=kit.art.keepGeometry(new THREE.CylinderGeometry(.5,.5,1,64));
  kit.material.treeSoil=treeSoil(kit.art);
  const leaves=sprayAtlas(kit.art);
  kit.material.foliage=kit.art.keepMaterial(new THREE.MeshLambertMaterial({
    map:leaves,alphaTest:.30,side:THREE.DoubleSide,
  }));
  // Thin leaves transmit yellow-green light towards a backlit viewer. Use the
  // already shadowed sun irradiance, so crowns remain cool under the awning.
  kit.material.foliage.onBeforeCompile=shader=>{
    const leafLight=THREE.ShaderChunk.lights_lambert_pars_fragment.replace(
      'vec3 irradiance = dotNL * directLight.color;',`
        float back=max(0.0,-dot(geometryNormal,directLight.direction));
        float forward=pow(max(0.0,dot(geometryViewDir,-directLight.direction)),3.0);
        vec3 irradiance=directLight.color*(vec3(dotNL)+vec3(.72,.94,.34)*back*(.32+.78*forward));
      `).replace('reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );',`
        reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
        #ifdef ESTATE_LEAF_CUTICLE
          vec3 halfDir=normalize(directLight.direction+geometryViewDir);
          float sheen=pow(max(0.0,dot(geometryNormal,halfDir)),24.0)*dotNL;
          reflectedLight.directDiffuse+=directLight.color*vec3(.032,.035,.023)*sheen;
        #endif
      `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_lambert_pars_fragment>',leafLight);
  };
  kit.material.foliage.customProgramCacheKey=()=>'estate-leaf-transmission';
  const canopy=kit.art.keepMaterial(kit.material.foliage.clone());
  canopy.map=loadEstateTexture(kit.art,banyanSpray,leaves.image,THREE.SRGBColorSpace,false);
  canopy.defines={...canopy.defines,ESTATE_LEAF_CUTICLE:1};
  canopy.color.setRGB(1.16,1.13,1.06);
  canopy.alphaToCoverage=true;
  canopy.onBeforeCompile=kit.material.foliage.onBeforeCompile;
  canopy.customProgramCacheKey=kit.material.foliage.customProgramCacheKey;
  kit.material.canopy=canopy;
  const bark=kit.art.keepMaterial(new THREE.MeshStandardMaterial({
    map:loadEstateTexture(kit.art,barkColor,'#8c8778',THREE.SRGBColorSpace),
    normalMap:loadEstateTexture(kit.art,barkNormal,'#8080ff',THREE.NoColorSpace),
    roughnessMap:loadEstateTexture(kit.art,barkRoughness,'#b8b8b8',THREE.NoColorSpace),
    normalScale:new THREE.Vector2(.63,.63),roughness:1.04,vertexColors:true,
  }));
  bark.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',`
      #include <uv_vertex>
      #ifdef USE_INSTANCING
        vMapUv*=vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));
        vNormalMapUv=vMapUv;vRoughnessMapUv=vMapUv;
      #endif
    `);
  };
  bark.customProgramCacheKey=()=>'estate-hero-bark';kit.material.heroBark=bark;
  return Promise.all([canopy.map,bark.map,bark.normalMap,bark.roughnessMap].map(texture=>texture.userData.ready));
}

const leafTones=['#afbf98','#c9d198','#cdd6a3','#b8c599','#a7bf94','#c3cfa1'];
const flowers=['#bd728b','#d78ba9','#b8a1cf','#d2b7da','#e0c474','#d7a3af'];

// An opaque inner volume, loose leaf sprays and a few heads on the outside.
// A shrub reads as one plant both at eye level and fifty metres down the road.
function lowShrub(f,x,y,z,w,h,rnd,bloom=null) {
  const yaw=rnd()*fullTurn, tone=leafTones[Math.floor(rnd()*leafTones.length)];
  f.shape('hedge','hedge',[x,y+h*.42,z],[w,h*.92,w*.83],tone,[.07,yaw,-.08]);
  for(let j=0;j<3;j++) {
    const a=yaw+j*2.29,dx=Math.cos(a),dz=Math.sin(a);
    f.shape('shrub','foliage',[x+dx*w*.28,y+h*(.52+rnd()*.2),z+dz*w*.24],
      [w*.82,h*.82,w*.75],tone,[.22,a,.13]);
    if(bloom) f.shape('blossom','leaf',[x+dx*w*.29,y+h*(.75+rnd()*.15),z+dz*w*.26],
      [.57,.68,.60],bloom,[.11,a,.13]);
  }
}

function banyanBed(kit,f,b,rnd) {
  f.shape('treePit','plaster',[0,b.h*.41,0],[b.w,b.h*.82,b.d],'#8c8b7e');
  f.shape('treePit','treeSoil',[0,b.h-.10,0],[b.w-.38,.12,b.d-.38]);
  const rx=b.w/2-.15,rz=b.d/2-.15,count=46;
  for(let i=0;i<count;i++) {
    const a=fullTurn*i/count,tx=-rx*Math.sin(a),tz=rz*Math.cos(a);
    const length=Math.hypot(tx,tz)*fullTurn/count;
    f.box('plaster',[rx*Math.cos(a),b.h-.008,rz*Math.sin(a)],[.32,.17,length-.019],
      ['#b8b7aa','#c4c0b2','#afa999','#bcb9ac'][Math.floor(rnd()*4)],[0,Math.atan2(tx,tz),0]);
  }
  for(const [angle,span,hue] of [[-.40,.88,'#ab9eb8'],[1.4,.63,'#cba4aa'],[2.94,.80,null],[4.12,.51,null]]) {
    for(let i=0;i<6;i++) {
      const a=angle+(i/5-.5)*span,w=1.15+rnd()*.63;
      const inset=.86+rnd()*.38;
      lowShrub(f,(rx-inset)*Math.cos(a),b.h-.075,(rz-inset)*Math.sin(a),w,.50+rnd()*.43,rnd,
        i%3===1?hue:null);
    }
  }
}

// Continuous taper and curvature through each crotch. UV length follows the
// path in metres so bark stays vertical on a rising root and curls along a limb.
function matureBanyan(kit,f,b,rnd) {
  const h=b.h, positions=[], normals=[], uv=[], colors=[], indices=[];
  function limb(points,radii,sides=9) {
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
    const steps=(points.length-1)*4,len=curve.getLength();
    const frames=curve.computeFrenetFrames(steps,false), first=positions.length/3,seed=rnd()*fullTurn;
    const center=new THREE.Vector3(),radial=new THREE.Vector3(),point=new THREE.Vector3();
    for(let i=0;i<=steps;i++) {
      const t=i/steps,v=t*(radii.length-1),j=Math.min(radii.length-2,Math.floor(v));
      const r=THREE.MathUtils.lerp(radii[j],radii[j+1],v-j);
      curve.getPointAt(t,center);
      for(let k=0;k<=sides;k++) {
        const a=fullTurn*k/sides,groove=.095*Math.sin(a*5+t*1.7+seed)+.048*Math.cos(a*3-t*2);
        radial.copy(frames.normals[i]).multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[i],Math.sin(a));
        point.copy(center).addScaledVector(radial,r*(1+groove));
        positions.push(point.x,point.y,point.z);normals.push(radial.x,radial.y,radial.z);
        uv.push(k/sides*fullTurn*radii[0]/1.36,t*len/1.36);
        const shade=.91+groove*.8+.07*Math.sin(a+seed);
        colors.push(shade,shade*.98,shade*.94);
        if(i && k) {
          const q=first+i*(sides+1)+k;
          indices.push(q-sides-2,q-sides-1,q-1,q-1,q-sides-1,q);
        }
      }
    }
  }
  banyanBed(kit,f,b,rnd);
  const stems=[
    [[.08,h-.13,.04],[.30,h+1,.23],[-.21,h+2.45,.38],[-.83,h+3.91,.14],[-1.18,h+5.39,-.43],[-.85,h+6.88,-1.16]],
    [[.53,h-.12,-.24],[.83,h+1.16,-.38],[.77,h+2.46,-.58],[1.29,h+3.66,-.22],[1.42,h+5.00,.47],[2.05,h+6.30,.99]]
  ];
  const girths=[[1.25,1.05,.87,.74,.53,.33],[.75,.67,.60,.51,.40,.27]];
  limb([...stems[0],[-1.71,h+7.95,-2.01],[-1.86,h+9.44,-3.28],[-2.16,h+10.23,-3.85]],
    [...girths[0],.22,.095,.025],16);
  limb([...stems[1],[2.62,h+7.30,1.68],[2.74,h+8.70,2.12],[3.46,h+9.65,2.52]],
    [...girths[1],.18,.082,.021],14);
  for(let i=0;i<10;i++) {
    const a=i*2.4+.24,dx=Math.cos(a),dz=Math.sin(a),reach=2.45+rnd()*1.9;
    f.shape('buttress','heroBark',[dx*.20,h-.08,dz*.19],[reach,1.13+rnd()*1.65,1.45],
      ['#e3decd','#eae0d0','#dfdacb'][i%3],[0,-a,0]);
    limb([[dx*.41,h+1.13,dz*.44],[dx*reach*.45,h+.38,dz*reach*.36],
      [dx*reach*.75,h+.07,dz*reach*.78],[dx*reach,h-.10,dz*reach+.22]],[.34,.23,.12,.035],8);
  }
  for(let i=0;i<11;i++) {
    const a=i*2.39996+rnd()*.53,dx=Math.cos(a),dz=Math.sin(a),cross=.58+rnd()*.9;
    const host=i%2, joint=2+(i%4), start=stems[host][joint],reach=5.4+rnd()*3.65;
    const top=6.7+(i%3)*.87+rnd()*1.75;
    const elbow=[dx*reach*.30-dz*cross,h+top*.86,dz*reach*.30+dx*cross];
    const branch=[dx*reach,h+top,dz*reach*.86];
    const girth=Math.min(.58,girths[host][joint]*.89);
    limb([start,[(start[0]+elbow[0])*.5,h+Math.max(start[1]-h+.68,top*.71),(start[2]+elbow[2])*.5],
      elbow,[dx*reach*.69+dz*.64,h+top-.53,dz*reach*.61-dx*.64],branch],
      [girth*.66,girth,girth*.78,girth*.51,girth*.31],11);
    if(i===2 || i===7) {
      const rx=elbow[0]*.79,rz=elbow[2]*.80;
      limb([elbow,[rx+.18,h+top*.59,rz-.08],[rx-.13,h+2.07,rz+.15],
        [rx,h+.42,rz+.12],[rx+.31,h-.09,rz+.24]],[.12,.11,.128,.19,.23],8);
    }
    for(let j=0;j<4;j++) {
      const az=a+(j-1.41)*.62,ex=Math.cos(az),ez=Math.sin(az),extension=2.05+rnd()*2.48;
      const tip=[branch[0]+ex*extension,branch[1]+.72+rnd()*2.13,branch[2]+ez*extension];
      limb([branch,[branch[0]+ex*extension*.43,branch[1]+.18,branch[2]+ez*extension*.47],
        [tip[0]-.34*ez,tip[1]-.66,tip[2]+.34*ex],tip],[girth*.22,girth*.23,.068,.024],7);
      const size=3.75+rnd()*2.25;
      f.shape('canopySpray','canopy',tip,[size*1.21,size*.82,size*1.15],leafTones[(i+j)%6],[rnd()*.31,az,rnd()*.20]);
      const middle=[(tip[0]+branch[0])/2,tip[1]-.69,(tip[2]+branch[2])/2];
      f.shape('canopySpray','canopy',middle,[size*.99,size*.84,size],leafTones[(i+j+3)%6],[.23,az+1.67,.14]);
    }
    if(i%3!==1) for(let j=0;j<3;j++) {
      const x=branch[0]+j*.15,z=branch[2]+j*.13,drop=1.07+rnd()*2.4;
      limb([[x,branch[1],z],[x+.07,branch[1]-.46,z+.10],[x-.11,branch[1]-drop,z+.14]],[.044,.034,.011],5);
    }
  }
  for(let i=0;i<8;i++){
    const a=i*2.40;
    f.shape('canopySpray','canopy',[Math.cos(a)*3.04,h+10.25+rnd()*1.14,Math.sin(a)*3.48],
      [5.75,3.35+rnd()*1.65,5.22],leafTones[i%6],[.25,a,.17]);
  }
  const g=kit.art.keepGeometry(new THREE.BufferGeometry());
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);
  f.shape(g,'heroBark',[0,0,0],[1,1,1],'#e6dfcf');
}

function planter(frame,b,rounded=false){
  const shape=rounded?'drum':'box',h=b.h;
  frame.shape(shape,'plaster',[0,h*.47,0],[b.w,h*.94,b.d],'#baa990');
  frame.shape(shape,'plaster',[0,h-.04,0],[b.w+.07,.14,b.d+.07],'#d1c2a3');
  frame.shape(shape,'paint',[0,h+.041,0],[Math.max(.1,b.w-.33),.056,Math.max(.1,b.d-.33)],'#686444');
}

function flowerBorder(f,b,random,rounded) {
  const perimeter=2*(b.w+b.d),n=Math.min(74,Math.max(8,Math.floor(perimeter/1.36)));
  for(let i=0;i<n;i++){
    const t=i/n*fullTurn;
    let x,z;
    if(rounded){x=Math.cos(t)*(b.w*.50-.34);z=Math.sin(t)*(b.d*.50-.34);}
    else{
      const s=i/n*perimeter, halfW=b.w/2-.37, halfD=b.d/2-.37;
      if(s<b.w){x=-halfW+s/b.w*halfW*2;z=-halfD;}
      else if(s<b.w+b.d){x=halfW;z=-halfD+(s-b.w)/b.d*halfD*2;}
      else if(s<2*b.w+b.d){x=halfW-(s-b.w-b.d)/b.w*halfW*2;z=halfD;}
      else{x=-halfW;z=halfD-(s-2*b.w-b.d)/b.d*halfD*2;}
    }
    x+=(random()-.5)*.35;z+=(random()-.5)*.35;
    if(Math.sin(i*.47+.6)<-.63) continue;
    const blossom=i%9<3?flowers[Math.floor(i/9)%flowers.length]:null;
    lowShrub(f,x,b.h+.04,z,.85+random()*.55,.43+random()*.34,random,blossom);
  }
}

export function tree(kit,b,hero=false){
  const f=kit.frame.child([b.x,0,b.z]),rng=rngFor(b);
  if(hero){matureBanyan(kit,f,b,rng);return;}
  planter(f,b,true);flowerBorder(f,b,rng,true);
  const scale=.86+rng()*.27;
  const crownWidth=1.14, h=b.h;
  const point=(x,y,z)=>[x*scale*crownWidth,h+y*scale,z*scale*crownWidth];
  const bark=['#837b69','#89816d','#776f60','#938773'];
  function branch(a,c,width,tint) {f.beam('bark',a,c,width*scale,tint,'taper');}
  const base=point(0,0,0),fork=point(-.28,2.95,.08);
  branch(base,fork,.99,bark[0]);
  for(let j=0;j<7;j++){
    const a=j*fullTurn/7+.2;
    branch(point(Math.cos(a)*1.35,.06,Math.sin(a)*1.08),point(-.10,1.18,.05),.41,bark[j%4]);
  }
  for(let i=0;i<8;i++){
    const angle=i*2.39996+rng()*.4,spread=1.81+rng()*1.52,low=i%3===0;
    const mid=point(Math.cos(angle)*spread*.57,3.62+rng()*.97,Math.sin(angle)*spread*.57);
    const end=point(Math.cos(angle)*spread,low?3.72+rng():5.48+rng()*1.94,Math.sin(angle)*spread);
    const crook=[(fork[0]+mid[0])*.5,(fork[1]+mid[1])*.5+.59,(fork[2]+mid[2])*.5+.25*Math.sin(angle)];
    branch(fork,crook,.72-i%4*.052,bark[i%4]);branch(crook,mid,.52,bark[i%4]);
    branch(mid,end,.40,bark[(i+1)%4]);
    for(let j=0;j<3;j++){
      const theta=angle+(j-1.1)*.69,reach=1.20+rng();
      const tip=[end[0]+Math.cos(theta)*reach*scale*crownWidth,end[1]+(.62+rng()*1.13)*scale,end[2]+Math.sin(theta)*reach*scale*crownWidth];
      branch(end,tip,.19,bark[(i+j)%4]);
      const size=(2.15+rng()*1.15)*scale;
      f.shape('canopySpray','canopy',tip,[size*1.27,size*.95,size*1.28],leafTones[(i+j)%6],[rng()*.38,theta,rng()*.23]);
      if(j===0) f.shape('canopySpray','canopy',[tip[0],tip[1]-.20*scale,tip[2]],
        [size*1.05,size*.91,size*1.10],leafTones[(i+3)%6],[.18,theta+1.78,.13]);
    }
  }
  for(let i=0;i<5;i++){
    const a=i*2.4;
    f.shape('canopySpray','canopy',point(Math.cos(a)*1.32,6.65+rng()*1.1,Math.sin(a)*1.53),
      [3.4*scale,2.9*scale,3.3*scale],leafTones[(i+2)%6],[0,a,0]);
  }
}

export function secondaryTree(kit,b,course) {
  const f=kit.frame.child([b.x,0,b.z]),rng=rngFor(b);
  const tall=5.8+rng()*3.9,spread=2.35+rng()*2.45;
  const lean=(rng()-.5)*.53;
  f.drum('plaster',[0,.08,0],[b.w,.16,b.d],'#b5a587');
  f.drum('paint',[0,.17,0],[b.w-.12,.05,b.d-.12],'#71694c');
  f.shape('trunk','bark',[0,.19,0],[b.w*.69,tall*.50,b.d*.68],'#82796a',[0,rng()*fullTurn,0]);
  for(let i=0;i<6;i++){
    const a=i*2.40+rng()*.47,r=spread*(.48+rng()*.35),fork=[lean,tall*(.35+rng()*.12),0];
    const joint=[Math.cos(a)*r*.50,tall*(.56+rng()*.06),Math.sin(a)*r*.50];
    const tip=[Math.cos(a)*r,tall*(.63+rng()*.28),Math.sin(a)*r];
    f.beam('bark',fork,joint,.36,'#948776','taper');f.beam('bark',joint,tip,.21,'#978878','taper');
    const shade=leafTones[Math.floor(rng()*6)];
    f.shape('canopySpray','canopy',tip,[spread*.98,spread*1.05,spread*1.05],shade,[.2,a,0]);
    f.shape('canopySpray','canopy',[tip[0]*.88,tip[1]+.42,tip[2]*1.12],[spread,spread*.88,spread],shade,[.40,a+1.73,.1]);
  }
  f.shape('canopySpray','canopy',[lean,tall,0],[spread*1.54,spread*1.17,spread*1.46],leafTones[3],[.14,rng()*fullTurn,0]);
  const gate=course.gate,fork=course.landmarks.fork,dx=fork.x-gate.x,dz=fork.z-gate.z;
  const t=((b.x-gate.x)*dx+(b.z-gate.z)*dz)/(dx*dx+dz*dz);
  const rx=gate.x+dx*t-b.x,rz=gate.z+dz*t-b.z,gap=Math.hypot(rx,rz);
  if (t<-.12 || t>1.16 || gap<7 || gap>25) return;
  // Mature roadside crowns overhang the approach. Their trunks stay in the
  // collision pits and the motorable corridor keeps more than 4 m of headroom.
  const angle=Math.atan2(rz,rx),reach=Math.min(gap-.9,12);
  for(let j=0;j<3;j++) {
    const a=angle+(j-1)*.53, height=tall*.77+1.2+rng();
    const joint=[Math.cos(a)*reach*.46,height-.58,Math.sin(a)*reach*.46];
    const tip=[Math.cos(a)*reach*.86,height+.44,Math.sin(a)*reach*.86];
    f.beam('bark',[lean,tall*.47,0],joint,.45,'#817967','taper');
    f.beam('bark',joint,tip,.26,'#928574','taper');
    for(let k=0;k<5;k++) {
      const s=2.4+k*1.27+rng()*.60, az=a+(k-2)*.69;
      const edge=[tip[0]+Math.cos(az)*s*.51,tip[1]+rng()*1.2,tip[2]+Math.sin(az)*s*.51];
      f.beam('bark',tip,edge,.12,'#8e806c','taper');
      f.shape('canopySpray','canopy',edge,[s*1.15,s*.64,s],leafTones[(j+k)%6],[.22,az,.20]);
    }
  }
}

export function garden(kit,b) {
  const f=kit.frame.child([b.x,0,b.z]),rng=rngFor(b);
  planter(f,b);flowerBorder(f,b,rng,false);
  const count=Math.min(70,Math.ceil(b.w*b.d/3.8));
  const rock=b.id==='rockGarden';
  for(let i=0;i<count;i++){
    const x=(rng()-.5)*(b.w-.65),z=(rng()-.5)*(b.d-.65),s=1.1+rng()*1.0;
    const flowersHere=Math.sin(x*.88+z*.52)>.68;
    lowShrub(f,x,b.h+.03,z,s,.49+rng()*.48,rng,flowersHere?flowers[Math.floor((x+b.w)/3)%6]:null);
  }
  if(rock){
    const material=kit.material.plaster;
    const geo=kit.art.keepGeometry(new THREE.DodecahedronGeometry(.58,0));
    f.shape(geo,material,[-.40,b.h+.95,0],[1.32,2.32,1.23],'#a69c84',[.14,.65,-.16]);
    f.shape(geo,material,[.27,b.h+1.76,.11],[.98,1.83,1.06],'#b0a68c',[-.21,.18,.35]);
  }
}

export function pergola(kit,course) {
  const sections=course.landmarks?.pergola??[],frame=kit.frame,random=sequence(1714);
  for(const section of sections) {
    const [a,b]=section.feet;
    for(const p of [a,b]){
      frame.box('plaster',[p.x,p.h/2,p.z],[p.w,p.h,p.d],'#bfad8e');
      frame.box('plaster',[p.x,.22,p.z],[p.w+.10,.44,p.d+.10],'#978d77');
      frame.box('timber',[p.x,p.h-.08,p.z],[p.w+.22,.24,p.d+.22],'#897550');
    }
    frame.beam('timber',[a.x,a.h,a.z],[b.x,b.h,b.z],.22,'#927954','box');
  }
  for(let i=1;i<sections.length;i++){
    const last=sections[i-1],next=sections[i];
    const distance=Math.hypot(last.x-next.x,last.z-next.z), slats=Math.max(2,Math.round(distance/.92));
    for(let side=0;side<2;side++){
      const a=last.feet[side],b=next.feet[side];
      frame.beam('timber',[a.x,a.h+.09,a.z],[b.x,b.h+.09,b.z],.21,'#826849','box');
    }
    for(let j=0;j<slats;j++){
      const t=j/slats, pts=[0,1].map(side=>{
        const a=last.feet[side],b=next.feet[side];
        return [a.x+(b.x-a.x)*t,a.h+.24,a.z+(b.z-a.z)*t];
      });
      frame.beam('timber',pts[0],pts[1],.14,'#9e8864','box');
      for(const side of [0,1]){
        const [x,y,z]=pts[side];
        frame.shape('spray','foliage',[x,y+.10,z],[1.55,.92,1.66],leafTones[(i+j)%6],[.14,j*.97,0]);
        for(let k=0;k<3;k++){
          const dz=(random()-.5)*.60,dx=(random()-.5)*.63,len=.52+random()*.74;
          frame.shape('wisteria','leaf',[x+dx,y-len*.4,z+dz],[1.08,len,1.08],
            ['#ad8bb6','#bd99c4','#9878ab','#d6b1cb'][(i+j+k)%4]);
        }
      }
    }
  }
}

export function groundCover(kit,course){
  const rng=sequence(733),f=kit.frame;
  for(const [x,z] of softPlantPositions(course,rng)){
    const drift=Math.sin(x*.29+.7*Math.cos(z*.21))+.69*Math.cos(z*.35-x*.13);
    if(drift<.40)continue;
    const size=1.36+rng()*.81+drift*.18;
    const hue=drift>1.28 && Math.sin(z*.48+x*.22)>.54?'#b9a6b8':null;
    lowShrub(f,x,0,z,size,.48+.26*drift+rng()*.29,rng,hue);
  }
  // Wall vines and small flowering crowns grow inside the already blocked wall.
  for(const b of course.blocks.filter(b=>b.style==='gateFence'&&Math.max(b.w,b.d)>24)){
    const alongZ=b.d>b.w,long=Math.max(b.w,b.d),step=3;
    const wallFrame=f.child([b.x,0,b.z],alongZ?Math.PI/2:0);
    for(let s=-long/2+2;s<long/2-1;s+=step){
      const side=alongZ?-1:1,z=side*(Math.min(b.w,b.d)*.5-.10), height=b.h*(.55+rng()*.53);
      wallFrame.shape('shrub','foliage',[s,height,z],[3.1,1.72,1.15],leafTones[Math.floor(rng()*6)],[.2,s,0]);
      if(Math.floor((s+long/2)/step)%5===1){
        wallFrame.beam('timber',[s-.16,b.h,z*.4],[s+.44,b.h+2.93,z*.4],.24,'#725b42','taper');
        for(let j=0;j<6;j++){
          const a=j*2.4;
          wallFrame.shape('spray','foliage',[s+Math.cos(a)*1.28,b.h+3.22+rng(),z*.4+Math.sin(a)],
            [3.42,3.50,3.24],leafTones[(j+2)%6],[.10,a,.19]);
        }
      }
    }
  }
}
