import * as THREE from 'three';

// The existing sewn lining has 28 samples and a duplicated UV seam per ring.
// Shape its inner panels under load while retaining their topology and UVs.
export function bindSleeveLining(suit) {
  let lining;
  suit?.traverse(part=>{if(part.isSkinnedMesh && part.material.name==='SewnUnderarm')lining=part;});
  if (!lining) return null;
  const geometry=lining.geometry, p=geometry.attributes.position;
  const ring=29, torsoEnd=53*ring, sleeveEnd=torsoEnd+52*ring;
  if (p.count!==sleeveEnd+52*ring) return null;
  const targets=geometry.morphAttributes.position??=[];
  if (!targets.some(a=>a.name==='UnderarmEase')) {
    const delta=new THREE.Float32BufferAttribute(new Float32Array(p.count*3),3);
    const smooth=THREE.MathUtils.smoothstep;
    for(let start=0;start<p.count;start+=ring){
      const y=p.getY(start);
      const band=smooth(y,.106,.218)*(1-smooth(y,.481,.548));
      if(!band)continue;
      const torso=start<torsoEnd;
      let cx=0,cz=0;
      for(let k=0;k<ring-1;k++){cx+=p.getX(start+k);cz+=p.getZ(start+k);}
      cx/=ring-1;cz/=ring-1;
      for(let k=0;k<ring;k++){
        const i=start+k, x=p.getX(i)-cx, z=p.getZ(i)-cz;
        const len=Math.hypot(x,z);
        if(len<.001)continue;
        const nx=x/len, nz=z/len;
        // Fill towards the other garment panel. Leave the visible outside cap
        // and the skin at the cuff alone.
        const inward=torso?Math.abs(nx):Math.max(0,-Math.sign(cx)*nx);
        const ease=band*(torso?.022*inward*inward:.004+.019*inward);
        delta.setXYZ(i,nx*ease,0,nz*ease*.72);
      }
    }
    delta.name='UnderarmEase';geometry.morphTargetsRelative=true;targets.push(delta);
  }
  if (lining.morphTargetDictionary?.UnderarmEase===undefined) lining.updateMorphTargets();
  const index=lining.morphTargetDictionary.UnderarmEase;
  return value=>{lining.morphTargetInfluences[index]=value;};
}
