import { Box3 } from 'three';
import { node, solidBuilder } from './courier-geometry.js';
import { courierMaterials } from './courier-materials.js';
import { buildRider } from './courier-rider.js';
import { buildScooter } from './courier-scooter.js';

/**
 * Metres, +Y up, +Z forward, +X on the rider's left. Supply the trial's createArt().
 * Set stem.rotation.y before updatePose(frame.kick, frame.elapsed); elapsed is seconds.
 * wheels[0] is the rear, wheels[1] the steered front. Both roll about their local X.
 *
 * headAnchor is a live chin joint. A fitted replacement is its child, alongside localHead.
 * headAnchor.userData.localBounds describes the complete local head, including the raised visor.
 * Switch localHead.visible after fitting. The neck and both limb chains belong to the rider.
 * 管线挂点原点在下巴底面中央。中立骑姿下车体坐标约 (0, 1.409, 0.0005) m。
 * 含翻起面罩约为 0.232 × 0.313 × 0.270 m（宽、高、深）；精确局部范围见 localBounds。
 */
export function makeCourier(art) {
  const root=node(null,'courier'), grade=node(root,'grade'), bank=node(grade,'bank');
  const k=solidBuilder(art), m=courierMaterials(art);
  const {stem,wheels,mounts}=buildScooter(k,m,bank);
  const {rider,headAnchor,localHead,legs,arms,updatePose}=buildRider(k,m,mounts,stem);
  k.finish();
  mounts.rider=rider;
  mounts.performer=node(bank,'courierPerformer');
  mounts.performer.visible=false;
  // All head surfaces were baked in this joint's coordinates by solidBuilder.
  const bounds=new Box3();
  for(const mesh of localHead.children) {
    mesh.geometry.computeBoundingBox();
    bounds.union(mesh.geometry.boundingBox);
  }
  headAnchor.userData.localBounds={min:bounds.min.toArray(),max:bounds.max.toArray()};
  return {root,grade,bank,stem,wheels,updatePose,headAnchor,localHead,mounts,materials:m,joints:{legs,arms}};
}
