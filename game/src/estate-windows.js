import * as THREE from 'three';
import windowBays from './assets/estate/window-bays.webp?url&inline';

// One shared atlas gives each dwelling a curtain, a shutter or a room behind
// its actual sill and balcony. The stable choice is made once per mesh vertex.
export function residentialWindows(art) {
  const pixel = document.createElement('canvas');
  pixel.width = pixel.height = 2;
  const paint = pixel.getContext('2d'); paint.fillStyle = '#92a199'; paint.fillRect(0,0,2,2);
  const map = art.texture(pixel), img = new Image();
  let disposed = false;
  map.addEventListener('dispose', () => { disposed = true; });
  img.src = windowBays;
  map.userData.ready = img.decode().then(() => {
    if (!disposed) { map.image = img; map.needsUpdate = true; }
  });
  const material = art.keepMaterial(new THREE.MeshStandardMaterial({
    map, roughness:.53, metalness:.075, envMapIntensity:.59,
  }));
  material.name = '住户窗格'; material.userData.noCast = true;
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `
      #include <uv_vertex>
      #ifdef USE_MAP
        vec4 bayAnchor = vec4(0.,0.,0.,1.);
        #ifdef USE_INSTANCING
          bayAnchor = instanceMatrix * bayAnchor;
        #endif
        vec3 bayPos = (modelMatrix * bayAnchor).xyz;
        float baySlot = mod(floor(dot(bayPos, vec3(1.17,2.77,.713))), 6.);
        vec2 bayCell = vec2(mod(baySlot,3.),floor(baySlot/3.));
        vMapUv = (bayCell + clamp(vMapUv, vec2(.009), vec2(.991))) / vec2(3.,2.);
      #endif
    `);
  };
  material.customProgramCacheKey = () => 'residential-window-bays-v1';
  return material;
}
