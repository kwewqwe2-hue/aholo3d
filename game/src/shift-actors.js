import * as THREE from 'three';
import { createStairLayout } from './stair-layout.js';
import { node, solidBuilder } from './courier-geometry.js';
import { bindPerformer } from './courier-performance.js';
import { createCourierGait } from './courier-gait.js';
import { animateGuard, makeAlertMark, makeMealBag, makeGateGuard } from './courier-cast.js';

const { clamp, damp, lerp, smoothstep } = THREE.MathUtils;
const vec = () => new THREE.Vector3();
const turn = (a,b,t) => a + t * Math.atan2(Math.sin(b-a), Math.cos(b-a));

/** Campaign render hook. Call after the scene has placed the bike and the patrol car.
 * The textured performer arrives with attachAholoAssets.ready. During loading the
 * local articulated character uses the same foot and hand targets.
 */
export function createShiftActors({ art, scene, course, rider, patrol, camera, onFootfall }) {
  const { mounts }=rider, space=mounts.performer, stairs=createStairLayout(course);
  const k=solidBuilder(art), bag=makeMealBag(k,rider.materials,art);
  const guard=makeGateGuard(k,rider.materials,art), mark=makeAlertMark(art);
  k.finish();
  for (const object of [guard.root,bag,mounts.cargo,rider.bank]) object.traverse(child=>{
    if (child.isMesh && !child.material.transparent) child.castShadow=true;
  });
  const updateGuard=animateGuard(guard,mark,scene,course,patrol,camera);
  const boxed=node(mounts.cargo,'parcelInBox',[0,.327,-.017]);
  const cover=mounts.lid.getObjectByName('cargoLid');
  scene.add(space); space.visible=true;
  const gaitDriver=createCourierGait(stairs);
  const previous=vec(), seat=vec(), station=vec(), world=vec(), temp=vec();
  const handle=vec(), rest=vec(), pole=vec(), nearDoor=vec(), recv=vec();
  const footPoints=[vec(),vec()];
  const euler=new THREE.Euler(0,0,0,'YXZ'), orientation=new THREE.Quaternion(), facing=new THREE.Quaternion();
  const ankleOrientation=[new THREE.Quaternion(),new THREE.Quaternion()];
  const bagFacing=new THREE.Quaternion(), inverse=new THREE.Quaternion();
  const parcelTurn=new THREE.Quaternion(), vertical=new THREE.Vector3(0,1,0);
  const lidWrist=new THREE.Quaternion(), lidSpace=new THREE.Quaternion();
  // Wrist frames in lid coordinates. The fingers hook the sewn loop from the
  // hollow side. The palm centre stays just below it, clear of the foil lining.
  const bightWrist=[new THREE.Quaternion(.60266,.35294,.61403,.36769).normalize(),
    new THREE.Quaternion(.92508,.35467,.01707,.13471).normalize()];
  const pose={height:.85,sway:0,roll:0,look:0,lean:0,twist:0,nod:0,seatShift:0};
  let suit, rig, receiver, lastTime=NaN, side=1, kick=0, disposed=false;
  let footFall=0, lastHeading=0, bagPitch=0, bagRoll=0, carryWidth=.350;

  function localPoint(object,x,y,z,out) {
    object.localToWorld(out.set(x,y,z));
    return space.worldToLocal(out);
  }
  function attachBag(parent) {
    if (bag.parent!==parent) { parent.add(bag); bag.position.set(0,0,0); }
  }
  function update(frame,dt=0) {
    if (disposed || !frame?.bike) return;
    const next=space.children.find(child=>child.name==='CourierPerformanceScene') ?? null;
    if (!rig || next!==suit) {
      rig?.dispose(); suit=next; rig=bindPerformer(space,suit,rider);
      mounts.rider.visible=!suit;
    }
    const bike=frame.bike, walker=frame.walker ?? frame.actor ?? bike;
    const type=frame.motion?.type ?? 'none', p=clamp(frame.motion?.progress ?? 0,0,1);
    const time=frame.elapsed ?? 0, step=frame.paused?0:clamp(dt,0,.15);
    const storing=type==='mount' && frame.cargo==='hand';
    const exchange=type==='takeBag'?p:storing && p<=.50?1-p/.50:null;
    const off=type==='dismount'?p:type==='mount'?1-(storing?smoothstep(p,.45,1):p):frame.travelMode==='foot'?1:0;
    const onFoot=off===1, indoor=!!walker.indoors && onFoot;
    const ground=walker.y ?? 0;
    const knock=type==='knock', giving=type==='handoff', delivered=frame.cargo==='delivered';
    const atDoor=knock||giving||delivered;
    const wx=walker.x-bike.x, wz=walker.z-bike.z;
    const lateral=wx*Math.cos(bike.heading)+wz*Math.sin(bike.heading);
    if (Math.abs(lateral)>.06) side=Math.sign(lateral);
    const seatQ=rider.bank.getWorldQuaternion(facing);
    rider.bank.localToWorld(seat.set(0,0,-.19));
    const heading=walker.heading ?? bike.heading;
    let yaw=-heading;
    const bodyToBox=exchange===null?0:smoothstep(exchange,0,.30)*(1-smoothstep(exchange,.79,1));
    const atCase=Math.max(bodyToBox,storing?smoothstep(p,.32,.42)*(1-smoothstep(p,.51,.83)):0);
    const raised=exchange===null?0:smoothstep(exchange,.44,.73);
    const bodyToDoor=knock?smoothstep(p,0,.28):giving||delivered?1:0;
    // On the bike's right the left hand reaches across the jacket to the
    // forward hinge. Step toward that hinge while unzipping the bight.
    const crossReach=exchange!==null && side<0?smoothstep(exchange,.05,.36)*(1-smoothstep(exchange,.79,.98)):0;
    rider.bank.localToWorld(station.set(side*(.47-.013*crossReach),0,-.72+.134*crossReach));
    // The game has already interpolated walker XZ during mount/dismount. Only
    // the lever arm from the vehicle origin to the seated hips is added here.
    if (off===0) space.position.copy(seat);
    else space.position.set(walker.x+(seat.x-bike.x)*(1-off),lerp(seat.y,ground,off),
      walker.z+(seat.z-bike.z)*(1-off));
    if (off>0 && off<1) {
      // The collision controller can choose a fore/aft landing in a narrow
      // parking spot. Step around the bars or carrier as the hips leave the seat.
      const fore=-wx*Math.sin(bike.heading)+wz*Math.cos(bike.heading);
      const endOn=1-smoothstep(Math.abs(lateral)/Math.max(.08,Math.abs(fore)),.15,.68);
      const arc=side*.52*Math.sin(Math.PI*off)*endOn*smoothstep(Math.abs(fore),.03,.30);
      space.position.x+=arc*Math.cos(bike.heading);space.position.z+=arc*Math.sin(bike.heading);
    }
    if (atCase) {
      space.position.lerp(station,atCase);
      yaw=turn(yaw,-bike.heading-side*(Math.PI/2+.21*raised),atCase);
    }
    if (atDoor) {
      nearDoor.set(stairs.door302.x-.37,stairs.door302.y,stairs.door302.z-.29);
      space.position.lerp(nearDoor,bodyToDoor);
      yaw=turn(yaw,Math.atan2(.37,.26),bodyToDoor);
    }
    const dx=space.position.x-previous.x,dz=space.position.z-previous.z;
    const distance=Math.hypot(dx,dz), reset=!Number.isFinite(lastTime)||time<lastTime||distance>2.4;
    if (reset) {
      kick=0;footFall=0;lastHeading=yaw;bagPitch=0;bagRoll=0;carryWidth=.350;
    }
    // Face a close interaction over a few frames when the control state turns to
    // the box/door immediately. Ordinary walk/steer orientation follows the player.
    lastHeading=!reset && (atDoor||exchange!==null)?turn(lastHeading,yaw,1-Math.exp(-24*step)):yaw;
    orientation.setFromEuler(euler.set(0,lastHeading,0,'YXZ'));
    space.quaternion.copy(seatQ).slerp(orientation,off);
    space.updateWorldMatrix(true,false);
    const free=onFoot && type==='none' && !delivered;
    const stepping=free || (onFoot && (exchange!==null||knock||giving));
    const travel=!reset && stepping?distance:0;
    const speed=free?Math.abs(walker.speed||0):stepping&&step?Math.min(2.7,travel/step):0;
    const gait=gaitDriver.update(space,{dx,dz,travel,speed,floor:ground,indoor,free,stepping,off,
      yaw:lastHeading,dt:step,reset});
    const {run,strength}=gait;
    const mountArc=Math.sin(Math.PI*off);
    const rawKick=off===0?(frame.kick||0):0;
    kick=damp(kick,rawKick,rawKick?30:21,step);
    if (Math.abs(kick)<.001) kick=0;
    const turnBar=rider.stem.rotation.y;
    for (let i=0;i<2;i++) {
      const chain=rig.legs[i], s=chain.side, target=footPoints[i];
      space.worldToLocal(target.copy(gait.feet[i].point));
      if (off<1) {
        const ext=s===-Math.sign(kick)?Math.abs(kick):0;
        localPoint(mounts.footrests[s>0?'left':'right'],s*(.660*ext),.004+.365*ext,
          -.025-.133*ext,handle);
        const land=s===side?smoothstep(off,.035,.52):smoothstep(off,.24,.94);
        const over=Math.sin(Math.PI*land);
        target.lerpVectors(handle,target,land);
        target.y+=over*(s===side?.107:.315);target.z+=over*(s===side?.035:.276);
      }
    }
    const load=free && frame.cargo==='hand'?1:0;
    footFall=damp(footFall,indoor?gait.supportFloor:0,20,step);
    pose.height=lerp(.843,.829+gait.bounce+footFall*(1-strength)
      -.018*Math.max(gait.grade,0)-.030*Math.max(-gait.grade,0),off)
      +.059*mountArc-.044*bodyToBox*(1-.85*raised);
    pose.seatShift=(1-off)*(.026+.235*Math.abs(turnBar))+off*(.018*run+.040*gait.brake);
    pose.lean=lerp(.38+.48*Math.abs(turnBar),.045+.15*run+.13*gait.grade-.13*gait.brake,off)
      +bodyToBox*(.25-.14*raised);
    pose.sway=lerp(-.08*Math.sin(turnBar)+.023*kick,-lerp(.048,.035,run)*gait.support+.008*load,off)
      +side*.052*mountArc;
    pose.twist=(1-off)*turnBar*.54-.145*gait.arms-side*.15*bodyToBox*raised;
    pose.roll=lerp(kick*.037,-.057*gait.support+.012*load,off)-side*.072*mountArc;
    pose.look=lerp(.075-turnBar*.30,.038*Math.sin(time*.74),off)-side*bodyToBox*(.14+.38*raised);
    pose.nod=bodyToBox*(.22-.24*raised)-.34*gait.bounce-(giving?.055:0);
    pose.load=load; pose.armDrive=gait.arms;
    pose.coverReach=crossReach; pose.parcelLift=bodyToBox*raised;
    pose.lining=bodyToBox*(.42+.58*raised);
    // Bound pelvis height by the actual length of each chain. The ankle is
    // behind the centre of the outsole and the hip rotates with the pelvis.
    facing.setFromEuler(euler.set(0,-pose.twist*.48,pose.roll,'XYZ'));
    for (let i=0;i<2;i++) {
      const chain=rig.legs[i],s=chain.side, ext=s===-Math.sign(kick)?Math.abs(kick):0;
      const q=ankleOrientation[i].setFromEuler(euler.set(-.016*(1-off)-ext*.23+off*gait.feet[i].pitch,
        s*(-.135+.93*ext),s*ext*.68,'YXZ'));
      if (onFoot) {
        temp.copy(chain.socket.position).applyQuaternion(q).negate().add(footPoints[i]);
        world.copy(chain.upper.position).applyQuaternion(facing);
        const dx=temp.x-world.x-pose.sway, dz=temp.z-world.z+.022-pose.seatShift;
        const reach=chain.l1+chain.l2-(free?.004:.001);
        pose.height=Math.min(pose.height,temp.y-world.y+Math.sqrt(Math.max(0,reach*reach-dx*dx-dz*dz)));
      }
    }
    rig.torso(pose);
    for (let i=0;i<2;i++) {
      const chain=rig.legs[i],s=chain.side, ext=s===-Math.sign(kick)?Math.abs(kick):0;
      pole.set(s*(.18+.9*ext),.055+ext*.28,1-.38*ext);
      rig.aim(chain,footPoints[i],ankleOrientation[i],pole);
      if (chain.toe) chain.toe.rotation.x=0;
      if (free && step>0 && gait.feet[i].landed) {
        onFootfall?.({side:s<0?'right':'left',indoors:indoor,speed});
      }
    }
    const lidOpen=exchange===null?0:smoothstep(exchange,.11,.36)*(1-smoothstep(exchange,.76,.97));
    mounts.lid.rotation.x=lidOpen*1.78;
    mounts.stand.rotation.x=1.25*(1-smoothstep(off,.29,.90));
    if ((giving||delivered) && !receiver) receiver=scene.getObjectByName('residentMealGrip');
    const passed=giving && p>=.62 || delivered;
    const holding=exchange!==null?exchange>=.48:!storing && frame.cargo==='hand' && !passed;
    for (let i=0;i<2;i++) {
      const chain=rig.arms[i],s=chain.side, carry=s<0 && (holding||giving||exchange!==null);
      const swingArm=s*gait.arms;
      // Keep the parcel below the loaded shoulder. The free elbow folds as its
      // hand comes forward, and both wrists follow the height of the rib cage.
      const handBase=free?pose.height-.829:0;
      rest.set(s*(carry?.322:.259),
        handBase+(carry?.841+.037*run+.016*swingArm:.824+.156*run+.067*swingArm),
        carry?.114+swingArm*.029:.075+.063*run+swingArm*(.211+.083*run));
      if (carry && onFoot) {
        const width=rig.parcelWidth(rest.y);
        carryWidth=Math.max(width,damp(carryWidth,width,12,step));
        rest.x=-carryWidth;
        rest.y+=clamp((carryWidth-.37)*.44,0,.069);
      }
      let pitch=carry?-.16-.065*swingArm:-.18-.54*run-.28*swingArm;
      let bight=0;
      if (off<1) {
        localPoint(mounts.grips[s>0?'left':'right'],0,.002,-.002,handle);
        const loose=s===side?smoothstep(off,.20,.73):smoothstep(off,.06,.59);
        rest.lerpVectors(handle,rest,loose);
        pitch=lerp(-1.27,pitch,loose);
      }
      if (exchange!==null) {
        const reach=smoothstep(exchange,s>0?.025:.17,s>0?.19:.48);
        if (s>0) {
          // Approach from outside the apron. Slip beneath its lower edge before
          // turning the fingers up into the sewn loop; reverse that route to let go.
          const reachCase=smoothstep(exchange,.008,.113)*(1-smoothstep(exchange,.89,.995));
          const hook=smoothstep(exchange,.155,.20)*(1-smoothstep(exchange,.76,.855));
          const x=lerp(.401,.193,smoothstep(hook,.11,.85));
          const y=lerp(.220,.298,smoothstep(hook,.62,1));
          localPoint(cover,side*x,y,lerp(-.167,-.13,hook),handle);
          bight=smoothstep(exchange,.040,.134)*(1-smoothstep(exchange,.87,.98));
          rest.lerp(handle,reachCase);
          pitch=lerp(pitch,-1.10,reachCase);
        } else {
          localPoint(boxed,0,0,0,handle);
          handle.y+=.335*smoothstep(exchange,.48,.68);
          // Pull horizontally over the lip before lowering the parcel.
          localPoint(mounts.cargo,side*.385,.692,-.060,temp);
          handle.lerp(temp,smoothstep(exchange,.67,.79));
          const lift=reach*(1-smoothstep(exchange,.79,.98));
          rest.lerp(handle,lift);
          pitch=lerp(pitch,-1.31,lift);
        }
      }
      if (knock && s>0) {
        const reach=smoothstep(p,0,.26)*(1-smoothstep(p,.81,1));
        const taps=Math.max(0,Math.cos((p-.29)*Math.PI*7));
        world.set(stairs.door302.x+.091-.13*(1-taps),ground+1.39,stairs.door302.z-.102);
        rest.lerp(space.worldToLocal(world),reach);pitch=lerp(pitch,-1.48,reach);
      }
      if (giving && s<0) {
        if (receiver) receiver.getWorldPosition(recv);
        else recv.set(stairs.door302.x+.012,ground+1.09,stairs.door302.z-.025);
        const reach=smoothstep(p,0,.43)*(1-smoothstep(p,.63,.98));
        rest.lerp(space.worldToLocal(world.copy(recv)),reach);
        pitch=lerp(pitch,-1.06,reach);
      }
      orientation.setFromEuler(euler.set(pitch,(1-off)*turnBar+s*.07,carry?s*.10:0,'YXZ'));
      if (bight>0) {
        space.getWorldQuaternion(lidSpace).invert();
        lidWrist.copy(lidSpace).multiply(cover.getWorldQuaternion(inverse)).multiply(bightWrist[side>0?1:0]);
        orientation.slerp(lidWrist,bight);
      }
      pole.set(s*.66,-.54,-.79);
      if (exchange!==null) pole.set(s*.56,-.92,-.18);
      rig.aim(chain,rest,orientation,pole);
    }
    if (passed && receiver) attachBag(receiver);
    else if (holding) attachBag(rig.arms[0].socket);
    else attachBag(boxed);
    bag.visible=holding || (passed && !!receiver) || (!passed && (frame.cargo==='box'||storing));
    if (bag.parent===boxed) bag.quaternion.identity();
    else if (bag.visible) {
      bag.parent.getWorldQuaternion(inverse).invert();
      const sway=holding?strength:0;
      let bagYaw=holding?lastHeading:-bike.heading;
      if (exchange!==null) bagYaw=turn(-bike.heading,lastHeading,smoothstep(exchange,.72,1));
      if (giving) bagYaw=turn(lastHeading,Math.PI/2,smoothstep(p,.47,.82));
      if (delivered) bagYaw=Math.PI/2;
      // The load lags the grip through foot strike and coasts briefly on release.
      const pendulum=holding?.119*gait.arms+.095*gait.brake:0;
      bagPitch=damp(bagPitch,pendulum,10,step);
      bagRoll=damp(bagRoll,holding?.055*gait.support-.020*sway:0,8,step);
      bagFacing.setFromEuler(euler.set(bagPitch,bagYaw,bagRoll,'YXZ'));
      // Turn the long side along the courier's path as the bag clears the box.
      // Unwind it into the resident's existing receiving grip during the pass.
      const lifted=exchange===null?1:smoothstep(exchange,.74,.98);
      const carried=holding?lifted*(giving?1-smoothstep(p,.37,.62):1):0;
      bagFacing.multiply(parcelTurn.setFromAxisAngle(vertical,Math.PI*.5*carried));
      bag.quaternion.copy(inverse).multiply(bagFacing);
    }
    updateGuard(frame,time);
    previous.copy(space.position);lastTime=time;
  }

  function dispose() {
    if (disposed) return;
    disposed=true; rig?.dispose();
    guard.root.removeFromParent();mark.removeFromParent();bag.removeFromParent();boxed.removeFromParent();
    if (patrol.driver) patrol.driver.visible=false;
    mounts.rider.visible=true;mounts.lid.rotation.x=0;mounts.stand.rotation.x=1.25;
    rider.bank.add(space);space.visible=false;space.position.set(0,0,0);space.quaternion.identity();
  }
  return {update,dispose};
}
