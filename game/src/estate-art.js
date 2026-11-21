import * as THREE from 'three';
import { buildGround, curbStones, estateScans } from './estate-ground.js';
import { estateKit } from './estate-kit.js';
import { homes, market, wall, gateHardware, skyline } from './estate-buildings.js';
import { preparePlants, tree, garden, pergola, groundCover, secondaryTree } from './estate-garden.js';
import { basketball, bicycleShed, guardBooth, noticeBoard } from './estate-landmarks.js';
import { dressGatehouse } from './gatehouse-art.js';
import { buildMarketLife } from './market-life.js';
import { buildCourtyardLife } from './courtyard-life.js';
import { dressStreetEdges } from './street-fittings.js';
import { estateSunDirection, setEstateDaylight } from './estate-lighting.js';

function eveningSky(art,root){
  const uniforms={
    cameraBasis:{value:new THREE.Matrix4()}, inverseProjection:{value:new THREE.Matrix4()},
    high:{value:new THREE.Color('#70a7d1')}, low:{value:new THREE.Color('#d8e3e6')},
    cloud:{value:new THREE.Color('#f1eee5')}, solar:{value:estateSunDirection},
  };
  const mat=art.keepMaterial(new THREE.ShaderMaterial({
    uniforms,depthTest:false,depthWrite:false,fog:false,
    vertexShader:`
      varying vec2 clipXY;
      void main(){clipXY=position.xy;gl_Position=vec4(position.xy,1.,1.);}
    `,
    fragmentShader:`
      varying vec2 clipXY;
      uniform mat4 cameraBasis, inverseProjection;
      uniform vec3 high,low,cloud,solar;
      float hash(vec2 p){return fract(sin(mod(dot(p,vec2(43.7,91.2)),6.28318))*4312.83);}
      float noise2(vec2 p){
        vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);
      }
      void main(){
        vec3 dir=normalize(mat3(cameraBasis)*(inverseProjection*vec4(clipXY,1.,1.)).xyz);
        float y=max(0.,dir.y);
        vec3 c=mix(low,high,smoothstep(-.09,.57,y));
        vec2 p=dir.xz/max(.09,y+.09)*vec2(1.25,3.1);
        float haze=noise2(p)*.63+noise2(p*2.55+4.7)*.25+noise2(p*5.3)*.12;
        c=mix(c,cloud,smoothstep(.55,.78,haze)*.46*smoothstep(.005,.12,y));
        float sun=max(0.,dot(dir,solar));
        c+=vec3(.30,.21,.12)*pow(sun,25.)+vec3(1.70,1.42,1.0)*smoothstep(.99987,.99998,sun);
        gl_FragColor=vec4(c,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  }));
  const mesh=art.mesh(root,art.keepGeometry(new THREE.PlaneGeometry(2,2)),mat);
  mesh.name='黄昏天空';mesh.renderOrder=-9;mesh.frustumCulled=false;
  mesh.onBeforeRender=(_renderer,_scene,camera)=>{
    uniforms.cameraBasis.value.copy(camera.matrixWorld);
    uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
  };
}

/** Add the campaign environment synchronously. The caller owns the scene and art lifetime. */
export function buildEstate(art, scene, course) {
  const root = new THREE.Group();
  root.name = '牛角里 · 黄昏住宅区';
  root.userData.estateEnvironment = true;
  buildGround(art, root, course);
  const kit = estateKit(art, root), posts = [];
  scene.userData.estateTexturesReady = Promise.all([estateScans(art).ready,preparePlants(kit)]);
  for (const b of course.blocks) {
    switch (b.style) {
      case 'flats': {
        const housing=kit.shell('estate-shell-'+b.id,b);
        homes(housing,b,course); housing.flush(); break;
      }
      case 'door': {
        const entrance=kit.shell('estate-building7',b);
        homes(entrance,b,course,true); entrance.flush(); break;
      }
      case 'market': market(kit,b,course); break;
      case 'booth': guardBooth(kit,b); dressGatehouse(kit,b,course); break;
      case 'gateFence': wall(kit,b); break;
      case 'gatePost': posts.push(b); break;
      case 'court': basketball(kit,b); break;
      case 'treeBed': {
        if(b.id==='forkTree'){
          const banyan=kit.shell('estate-forkTree',b);
          tree(banyan,b,true); banyan.flush();
        }else tree(kit,b);
        break;
      }
      case 'estateTree': secondaryTree(kit,b,course); break;
      case 'garden': garden(kit,b); break;
      case 'bikeShed': bicycleShed(kit,b); break;
      case 'exitSign': noticeBoard(kit,b); break;
      case 'arborFoot': break; // Paired below using the same collision centres.
      case 'courtLife':
      case 'streetFixture':
      case 'marketLife': break; // These assemblies use their own detailed meshes below.
      default: kit.frame.box('plaster',[b.x,b.h/2,b.z],[b.w,b.h,b.d],'#ac9e86');
    }
  }
  gateHardware(kit,course,posts);
  pergola(kit,course);
  groundCover(kit,course);
  curbStones(kit,course);
  skyline(kit,course);
  const street = buildMarketLife(kit,course);
  const yard = buildCourtyardLife(kit,course);
  dressStreetEdges(kit,course);
  kit.flush();
  const sun=setEstateDaylight(scene, course);
  eveningSky(art,root);
  // The first campaign frame can precede image decoding. Expose the complete
  // estate atomically, including the independently authored booth and stair maps.
  root.visible=false;
  const ready=Promise.all([scene.userData.estateTexturesReady,root.userData.assetsReady,street?.ready,yard?.ready]).then(()=>{
    root.visible=true;sun.shadow.needsUpdate=true;
  });
  root.userData.updateStreet = street?.update;
  root.userData.assetsReady=scene.userData.estateTexturesReady=ready;
  scene.add(root);
  return root;
}
