import * as THREE from 'three';
import { node } from './courier-geometry.js';
import { bindSleeveLining } from './courier-sleeve.js';

// All pose targets below are in the performer's space, in metres from the soles.
// The bind mesh has relaxed, turned-out feet and bent elbows. Preserve those
// original bone axes when aiming each pair of joints.
export function bindPerformer(space, suit, rider) {
  const mesh = suit?.getObjectByProperty('isSkinnedMesh', true);
  const joints = Object.fromEntries((mesh?.skeleton.bones ?? []).map(b => [b.name, b]));
  const kneeShapes=mesh?.morphTargetInfluences;
  const sleeveLining=bindSleeveLining(suit);
  const original = rider.mounts.rider;
  if (!mesh) space.add(original);
  const hips=joints.Hips ?? original.getObjectByName('pelvis');
  const spine=joints.Spine ?? original.getObjectByName('spine');
  const head=joints.Head ?? rider.headAnchor;
  const limbs = { arms: [], legs: [] };
  for (const [side, suffix] of [[-1, 'R'], [1, 'L']]) {
    for (const [list, names] of [[limbs.arms, ['Arm','Forearm','Hand']], [limbs.legs, ['Thigh','Shin','Foot']]]) {
      const arm = list === limbs.arms;
      const native=rider.joints[arm?'arms':'legs'][side>0?'left':'right'];
      const [upper,lower,end]=mesh?names.map(name=>joints[name+suffix]):[native.upper,native.lower,native.end];
      const offset = arm ? (mesh?[-side * .014, -.114, .044]:[0,.003,.052])
        : [0, mesh ? -.108 : -.073, mesh ? .096 : .043];
      const socket = node(end, (arm ? 'parcelGrip.' : 'sole.') + suffix, offset);
      list.push({ upper, lower, end, socket, side, toe: arm ? null : joints['Toe' + suffix],
        kneeShape: arm ? undefined : mesh?.morphTargetDictionary?.['Kneecap'+suffix],
        axis1: lower.position.clone().normalize(), axis2: end.position.clone().normalize(),
        nativeWrist: !mesh && arm, l1: lower.position.length(), l2: end.position.length() });
    }
  }
  const local = new THREE.Matrix4(), basis = new THREE.Quaternion(), endQ = new THREE.Quaternion();
  const axis = new THREE.Vector3(), bend = new THREE.Vector3(), joint = new THREE.Vector3();
  const tip = new THREE.Vector3(), handle = new THREE.Vector3(), lowerQ = new THREE.Quaternion();
  const carryLeg=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()];
  const wristCorrection = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/2);
  function aim(chain, target, orientation, pole) {
    const { upper, lower, end, socket, l1, l2 } = chain;
    local.copy(upper.parent.matrixWorld).invert().multiply(space.matrixWorld);
    basis.setFromRotationMatrix(local);
    endQ.copy(basis).multiply(orientation);
    if (chain.nativeWrist) endQ.multiply(wristCorrection);
    handle.copy(socket.position).applyQuaternion(endQ);
    axis.copy(target).applyMatrix4(local).sub(handle).sub(upper.position);
    const d = THREE.MathUtils.clamp(axis.length(), Math.abs(l1-l2)+.00001, l1+l2-.00001);
    axis.normalize();
    bend.copy(pole).applyQuaternion(basis);
    bend.addScaledVector(axis, -bend.dot(axis)).normalize();
    const along = (l1*l1-l2*l2+d*d)/(2*d);
    joint.copy(axis).multiplyScalar(along).addScaledVector(bend, Math.sqrt(Math.max(0, l1*l1-along*along)));
    tip.copy(axis).multiplyScalar(d).sub(joint);
    upper.quaternion.setFromUnitVectors(chain.axis1, joint.normalize());
    lowerQ.setFromUnitVectors(chain.axis2, tip.normalize());
    lower.quaternion.copy(upper.quaternion).invert().multiply(lowerQ);
    end.quaternion.copy(lowerQ).invert().multiply(endQ);
    if (chain.kneeShape!==undefined && kneeShapes) {
      const cosine=THREE.MathUtils.clamp((d*d-l1*l1-l2*l2)/(2*l1*l2),-1,1);
      kneeShapes[chain.kneeShape]=THREE.MathUtils.smoothstep(Math.acos(cosine),.35,1.658);
    }
  }
  function torso(pose) {
    sleeveLining?.(pose.lining);
    hips.position.set(pose.sway, pose.height - (mesh ? .9 : 0), -.022 + pose.seatShift);
    hips.rotation.set(0, -pose.twist * .48, pose.roll);
    spine.rotation.set(mesh?pose.lean*.57:pose.lean-.20, pose.twist*.58, -pose.roll*.55, 'YXZ');
    joints.Chest?.rotation.set(pose.lean*.43,pose.twist,-pose.roll*.3,'YXZ');
    joints.CollarR?.rotation.set(0,.048*pose.armDrive+.12*pose.parcelLift,.078*pose.load-.20*pose.parcelLift,'YXZ');
    joints.CollarL?.rotation.set(0,.064*pose.armDrive-.16*pose.coverReach,-.025*Math.abs(pose.armDrive)+.12*pose.coverReach,'YXZ');
    joints.Neck?.rotation.set(-pose.lean*.43+pose.nod*.4,pose.look*.43,0,'YXZ');
    head.rotation.set(-pose.lean * .28 + pose.nod * .6, pose.look * .57, -pose.roll * .2, 'YXZ');
    // The procedural standby uses the same socket contract during asset loading.
    (suit ?? original).updateWorldMatrix(true, true);
  }
  function parcelWidth(handY) {
    // Find the outside of the right trouser leg across the full height of the
    // pouch. A raised knee on a turn can lie substantially outside the hip.
    const {upper,lower,end}=limbs.legs[0];
    space.worldToLocal(upper.getWorldPosition(carryLeg[0]));
    space.worldToLocal(lower.getWorldPosition(carryLeg[1]));
    space.worldToLocal(end.getWorldPosition(carryLeg[2]));
    let width=.350;
    for (let i=0;i<2;i++) {
      const a=carryLeg[i], b=carryLeg[i+1], dy=b.y-a.y;
      const bottom=handY-.324, top=handY-.072;
      if (Math.min(a.y,b.y)>top || Math.max(a.y,b.y)<bottom) continue;
      let outside=Math.min(a.x,b.x);
      if (Math.abs(dy)>.001) {
        const xAt=y=>a.x+(b.x-a.x)*THREE.MathUtils.clamp((y-a.y)/dy,0,1);
        outside=Math.min(xAt(bottom),xAt(top));
      }
      // Trouser radius, the narrow side of the paper bag, and handle swing.
      width=Math.max(width,-outside+(i===0?.123:.099)+.079);
    }
    return width;
  }
  return { ...limbs, torso, aim, parcelWidth, dispose() {
    for (const chain of [...limbs.arms, ...limbs.legs]) chain.socket.removeFromParent();
    if (!mesh) {
      rider.mounts.seat.add(original);
      hips.position.set(0,.043,0); hips.rotation.set(0,0,0);
    }
  } };
}

// Place each support foot on the top of the visible stone, including descending
// flights. Physics uses a continuous ramp for the centre of the walker.
export function treadContact(layout, point, floorY, inset = 0) {
  const { x, d } = layout.local(point);
  let height = layout.heightAt(point, floorY);
  if (height===null) {
    // A runner can skip a tread. A shoe anticipated more than 0.32 m above the
    // hips' ramp sample lies outside the single physics-step query tolerance.
    if (Math.abs(x)>layout.halfWidth || d<0 || d>layout.depth) return floorY;
    const ratio=THREE.MathUtils.clamp((d-layout.front)/(layout.back-layout.front),0,1);
    const h=x<0?ratio*layout.rise:layout.floorHeight-ratio*layout.rise;
    height=h+Math.round((floorY-h)/layout.floorHeight)*layout.floorHeight;
  }
  if (d <= layout.front || d >= layout.back) return height;
  const width = (layout.back - layout.front) / layout.treads;
  const distance = x < 0 ? d - layout.front : layout.back - d;
  const step = Math.round(distance / width);
  if (inset > 0) {
    const safe = THREE.MathUtils.clamp(distance, (step-.5) * width + inset, (step+.5) * width - inset);
    point.z += (x < 0 ? -1 : 1) * (safe - distance);
  }
  const lower = x > 0 ? layout.rise : 0;
  const base = Math.round((height - lower - distance / width * layout.rise / layout.treads) / layout.floorHeight);
  return base * layout.floorHeight + lower + step * layout.rise / layout.treads;
}
