import * as THREE from 'three';
import gateRadiance from './assets/estate/gate-radiance.webp?url&inline';

// World-space direction from a shaded surface towards the afternoon sun.
export const estateSunDirection = new THREE.Vector3(-.96,.94,.43).normalize();

const staticLayer = 25, actorLayer = 26;

export function setEstateDaylight(scene, course) {
  let sun=scene.children.find(object=>object.isDirectionalLight);
  let sky=scene.children.find(object=>object.isHemisphereLight);
  if (!sky) { sky=new THREE.HemisphereLight(); scene.add(sky); }
  if (!sun) { sun=new THREE.DirectionalLight(); scene.add(sun,sun.target); }
  sky.color.set('#cfdfed'); sky.groundColor.set('#a59b8c'); sky.intensity=1.12;
  sun.color.set('#ffead0'); sun.intensity=3.05; sun.castShadow=true;
  const {minX,maxX,minZ,maxZ}=course.bounds;
  const extent=Math.max(maxX-minX,maxZ-minZ)*.64;
  sun.target.position.set((minX+maxX)/2,0,(minZ+maxZ)/2);
  sun.position.copy(sun.target.position).addScaledVector(estateSunDirection,230);
  Object.assign(sun.shadow.camera,{left:-extent,right:extent,top:extent,bottom:-extent,near:1,far:465});
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.mapSize.set(2048,2048);
  sun.shadow.normalBias=.052; sun.shadow.bias=-.00011;
  scene.background=new THREE.Color('#d5e1e5');
  scene.fog=new THREE.FogExp2('#cddbdc',.00235);
  return sun;
}

// Three sorts shadowed directionals stably. The campaign sun is first, the
// zero-energy light appended below supplies the detailed local depth map.
// Sample one depth per pixel except across the metre-wide handover band.
const directionalSample = 'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;';
const combinedLighting = THREE.ShaderChunk.lights_fragment_begin.replace(directionalSample,`
  #if NUM_DIR_LIGHT_SHADOWS == 2 && UNROLLED_LOOP_INDEX == 0
    if (receiveShadow && directLight.visible) {
      vec4 coord=vDirectionalShadowCoord[1];
      vec3 uvw=coord.xyz/coord.w;
      float rim=max(abs(uvw.x-.5),abs(uvw.y-.5));
      float weight=uvw.z>0.0 && uvw.z<1.0 ? 1.0-smoothstep(.445,.49,rim) : 0.0;
      float town=1.0, nearVisibility=1.0;
      if (weight<1.0) town=getShadow(directionalShadowMap[0],directionalLightShadow.shadowMapSize,
        directionalLightShadow.shadowIntensity,directionalLightShadow.shadowBias,
        directionalLightShadow.shadowRadius,vDirectionalShadowCoord[0]);
      if (weight>0.0) {
        DirectionalLightShadow local=directionalLightShadows[1];
        nearVisibility=getShadow(directionalShadowMap[1],local.shadowMapSize,local.shadowIntensity,
          local.shadowBias,local.shadowRadius,coord);
      }
      directLight.color*=mix(town,nearVisibility,weight);
    }
  #elif NUM_DIR_LIGHT_SHADOWS != 2
    ${directionalSample}
  #endif
`);

/** Owns the campaign's reflection and actor shadow pass. Call after posing the frame. */
export function createEstateLighting({scene, course, renderer, sun}) {
  sun ??= scene.children.find(object=>object.isDirectionalLight) ?? setEstateDaylight(scene,course);
  // Three builds a different material program for each point-light count.
  // Reserve the stair lamp's slot while the interior controller has it off.
  const landingLamp=scene.getObjectByName('302-landing-bulb');
  const darkSlot=landingLamp?.visible===false ? new THREE.PointLight(landingLamp.color,0,landingLamp.distance,landingLamp.decay) : null;
  if(darkSlot) {
    darkSlot.name='302-unlit-slot';darkSlot.position.copy(landingLamp.position);
    landingLamp.parent.add(darkSlot);
  }
  const previousEnvironment=scene.environment, previousIntensity=scene.environmentIntensity;
  const previousAuto=renderer.shadowMap.autoUpdate, previousLayers=sun.shadow.camera.layers.mask;
  const previousSunAuto=sun.shadow.autoUpdate, previousEnabled=renderer.shadowMap.enabled;
  const coarse=window.matchMedia('(pointer: coarse)').matches;
  const local=new THREE.DirectionalLight(0xffffff,0);
  local.name='人物与车辆的太阳投影';
  const radius=20, shadow=local.shadow, size=coarse?1024:2048;
  local.castShadow=true; shadow.autoUpdate=false;
  shadow.camera.layers.set(actorLayer);
  Object.assign(shadow.camera,{left:-radius,right:radius,top:radius,bottom:-radius,near:1,far:110});
  shadow.camera.updateProjectionMatrix(); shadow.mapSize.set(size,size);
  shadow.bias=-.00009; shadow.normalBias=.017;
  sun.shadow.camera.layers.set(staticLayer); sun.shadow.autoUpdate=false;
  renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=false;
  scene.add(local,local.target);
  const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),estateSunDirection).normalize();
  const up=new THREE.Vector3().crossVectors(estateSunDirection,right);
  const materials=new Map(), watched=new Map(), tagged=new Map();
  let disposed=false, staticDirty=true, actorDirty=true, environment=null;

  function receiver(material) {
    if (materials.has(material) || !(material.isMeshStandardMaterial || material.isMeshLambertMaterial ||
        material.isMeshPhongMaterial || material.isMeshToonMaterial)) return;
    const compile=material.onBeforeCompile, cache=material.customProgramCacheKey;
    const key=material.customProgramCacheKey();
    materials.set(material,{compile,cache});
    material.onBeforeCompile=function(shader,gl) {
      compile.call(this,shader,gl);
      shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',combinedLighting);
    };
    material.customProgramCacheKey=()=>key+'/estate-actor-shadow';
    material.needsUpdate=true;
  }

  function register(object,inEstate) {
    const fixed=inEstate || object.userData.estateEnvironment ||
      (object.parent===scene && object.isMesh && !object.isSkinnedMesh);
    if (object.isMesh) {
      const surfaces=Array.isArray(object.material)?object.material:[object.material];
      if (!tagged.has(object)) tagged.set(object,[object.layers.mask,object.castShadow,object.receiveShadow]);
      const opaque=surfaces.some(m=>m && !m.isMeshBasicMaterial && !m.isShaderMaterial &&
        !m.userData.noCast && (!m.transparent || m.alphaTest>0));
      object.layers.disable(staticLayer); object.layers.disable(actorLayer);
      if (fixed && object.castShadow) {
        object.layers.enable(staticLayer);object.layers.enable(actorLayer);staticDirty=actorDirty=true;
      }
      if (!fixed && opaque) {
        object.castShadow=true; object.receiveShadow=true; object.layers.enable(actorLayer);actorDirty=true;
      }
      if (object.receiveShadow) surfaces.forEach(receiver);
    }
    // Loading a head, a parked scooter or a replacement facade can finish after
    // the first frame. Register only the attached subtree, including skinned meshes.
    if ((object.isGroup || object.isScene || object.isBone || object.children.length) && !watched.has(object)) {
      const added=event=>register(event.child,fixed);
      const removed=()=>{if(fixed) staticDirty=true;actorDirty=true;};
      object.addEventListener('childadded',added);object.addEventListener('childremoved',removed);
      watched.set(object,{added,removed});
    }
    for(const child of object.children) register(child,fixed);
  }
  register(scene,false);

  // An offline, actor-free cube capture at the gate, encoded one stop down in
  // sRGB. Prefilter once per GL context without redrawing the city six times.
  const panorama=new Image();
  panorama.src=gateRadiance;
  function prefilter() {
    if (disposed || !panorama.naturalWidth) return;
    const generator=new THREE.PMREMGenerator(renderer), source=new THREE.Texture(panorama);
    source.colorSpace=THREE.SRGBColorSpace;source.mapping=THREE.EquirectangularReflectionMapping;
    source.needsUpdate=true;
    try {
      const next=generator.fromEquirectangular(source);
      environment?.dispose();environment=next;
      scene.environment=next.texture;scene.environmentIntensity=1.12;
      staticDirty=actorDirty=true;sun.shadow.needsUpdate=renderer.shadowMap.needsUpdate=true;
    } finally {
      source.dispose();generator.dispose();
    }
  }
  const ready=Promise.all([scene.userData.estateTexturesReady,panorama.decode()]).then(prefilter);
  const onRestore=()=>{staticDirty=actorDirty=true;prefilter();};
  renderer.domElement.addEventListener('webglcontextrestored',onRestore);
  const last=new Float64Array(18).fill(NaN), current=new Float64Array(last.length);
  let sinceUpdate=1, lastMotion=null, lastMode=null, lastPhase=null;
  function update(frame,camera,dt=0) {
    if (disposed) return;
    if (darkSlot) darkSlot.visible=!landingLamp.visible;
    const actor=frame?.actor??(frame?.travelMode==='foot'?frame.walker:frame?.bike);
    if (!actor || !Number.isFinite(actor.x) || !Number.isFinite(actor.z)) return;
    if (staticDirty) {
      sun.shadow.needsUpdate=renderer.shadowMap.needsUpdate=true;
      staticDirty=false;
    }
    const wheel=frame.bike, p=frame.pursuer;
    current.set([actor.x,actor.y??0,actor.z,actor.heading??0,wheel?.x??0,wheel?.z??0,wheel?.heading??0,
      wheel?.steer??0,wheel?.lean??0,p?.visible?p.x:0,p?.visible?p.z:0,p?.heading??0,p?.steer??0,
      p?.lean??0,frame.guard?.progress??0,frame.motion?.progress??0,frame.kick??0,Number(!!p?.visible)]);
    const motion=frame.motion?.type,mode=frame.travelMode,phase=frame.guard?.phase;
    const moving=motion!==lastMotion || mode!==lastMode || phase!==lastPhase || current.some((v,i)=>v!==last[i]);
    sinceUpdate+=Math.max(0,dt);
    // Catch the guard's breathing and the rider settling after braking, even at rest.
    if (!actorDirty && ((!moving && (frame.paused || sinceUpdate<.16)) || (coarse && sinceUpdate<1/30 && dt>0))) return;
    sinceUpdate=0; actorDirty=false;
    last.set(current);lastMotion=motion;lastMode=mode;lastPhase=phase;
    const target=local.target.position.set(actor.x,(actor.y??0)+1,actor.z);
    const texel=2*radius/size;
    for(const axis of [right,up]) {
      const distance=target.dot(axis);
      target.addScaledVector(axis,Math.round(distance/texel)*texel-distance);
    }
    local.position.copy(target).addScaledVector(estateSunDirection,57);
    shadow.needsUpdate=renderer.shadowMap.needsUpdate=true;
  }
  function dispose() {
    if (disposed) return;
    disposed=true;
    renderer.domElement.removeEventListener('webglcontextrestored',onRestore);
    for (const [object,{added,removed}] of watched) {
      object.removeEventListener('childadded',added);object.removeEventListener('childremoved',removed);
    }
    for (const [object,[mask,casts,receives]] of tagged) {
      object.layers.mask=mask;object.castShadow=casts;object.receiveShadow=receives;
    }
    for (const [mat,{compile,cache}] of materials) {
      mat.onBeforeCompile=compile;mat.customProgramCacheKey=cache;mat.needsUpdate=true;
    }
    watched.clear();tagged.clear();materials.clear();
    darkSlot?.removeFromParent();
    local.removeFromParent();local.target.removeFromParent();shadow.dispose();
    sun.shadow.camera.layers.mask=previousLayers;sun.shadow.autoUpdate=previousSunAuto;
    renderer.shadowMap.autoUpdate=previousAuto;renderer.shadowMap.enabled=previousEnabled;
    sun.shadow.needsUpdate=renderer.shadowMap.needsUpdate=true;
    scene.environment=previousEnvironment;scene.environmentIntensity=previousIntensity;
    environment?.dispose();
  }
  return {ready,update,dispose};
}
