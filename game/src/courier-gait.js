import * as THREE from 'three';
import { bootBands, soleHulls } from './courier-sole-profile.js';

const { clamp, damp, lerp, smoothstep, euclideanModulo } = THREE.MathUtils;
const tau = Math.PI*2;
const vec = () => new THREE.Vector3();
const neutralZ = .075;

// The collision walker follows a ramp. Shoes follow the stone profile, including
// the 16 mm projecting, bevelled nosing in stair-interior.js.
function stoneTop(g, x, z, floor) {
  const lateral=x-g.origin.x, depth=g.origin.z-z;
  if (floor<.14 && Math.abs(lateral)<g.doorHalf && depth>=-.44 && depth<=.003) {
    return lerp(.003,.011,(depth+.44)/.443);
  }
  if (depth<0 || depth>g.depth || Math.abs(lateral)>g.halfWidth) return floor;
  const right=lateral>0, width=(g.back-g.front)/g.treads, rise=g.rise/g.treads;
  const along=right?g.back-depth:depth-g.front;
  const distance=clamp(along,0,width*g.treads);
  const offset=right?g.rise:0;
  const base=offset+Math.round((floor-offset-distance*rise/width)/g.floorHeight)*g.floorHeight;
  const index=Math.min(g.treads,Math.floor((distance+.016)/width+.5));
  if (!index) return base;
  const lip=along-(index-.5)*width, h=base+index*rise;
  if (lip<-.012) return h-.023+(lip+.016)*3.25;
  if (lip<.019) return h-.010+(lip+.012)*(.010/.031);
  return h;
}

// Each band bounds the underside of a 24 mm slice of the original boot.
// Rotate the asymmetric bounds about the actual sole socket. The maximum
// required height may come from the heel on descent or the toe on ascent.
function soleHeight(g, point, i, floor, indoor, yaw, pitch) {
  const s=Math.sin(pitch), c=Math.cos(pitch);
  const sy=Math.sin(yaw), cy=Math.cos(yaw);
  let plane=floor;
  const doorway=floor<.14 && Math.abs(point.x-g.origin.x)<g.doorHalf+.22
    && Math.abs(point.z-g.origin.z-.20)<.48;
  if (indoor || doorway) {
    const half=.223*Math.abs(cy)+.135*Math.abs(sy)+.024;
    const rear=stoneTop(g,point.x,point.z-half,floor), front=stoneTop(g,point.x,point.z+half,floor);
    plane=Math.abs(rear-front)<.00001?rear:NaN;
  }
  if (Number.isFinite(plane)) {
    let offset=-Infinity;
    for (const [z,y] of soleHulls[i]) offset=Math.max(offset,s*z-c*y);
    return plane+offset+.0015;
  }
  let required=-Infinity;
  for (const [left,right,bottom,back,front] of bootBands[i]) {
    const drop=c*bottom-Math.max(s*back,s*front);
    const a=cy*(s*bottom+c*back), b=cy*(s*bottom+c*front);
    const lo=point.z+Math.min(a,b)-Math.max(sy*left,sy*right);
    const hi=point.z+Math.max(a,b)-Math.min(sy*left,sy*right);
    const surface=Math.max(stoneTop(g,point.x,lo,floor),stoneTop(g,point.x,hi,floor));
    required=Math.max(required,surface-drop);
  }
  return required+.0015;
}

export function createCourierGait(stairs) {
  const feet=[-1,1].map(side=>({
    side, point:vec(), from:vec(), to:vec(), anchor:vec(), blendFrom:vec(),
    pitch:0, lift:0, contact:false, armed:false, announced:false, landed:false, landingY:0,
    mode:'rest', startSwing:0, stopPitch:0, stopLift:0
  }));
  const gait={feet, strength:0, run:0, phase:.27, support:0, arms:0, grade:0, brake:0, bounce:0, supportFloor:0};
  const dir=vec(), neutral=vec(), prediction=vec(), delta=vec();
  let ready=false, walking=false, courseKey='', transition=1, stopping=false, stopTime=0, stopBob=0, bearing=0;
  const top=(x,z,h,inside)=>inside?stoneTop(stairs,x,z,h):h;

  function update(space, { dx,dz,travel,speed,floor,indoor,free,stepping,off,yaw,dt,reset }) {
    for (const f of feet) f.landed=false;
    if (ready && !reset && !dt) return gait;
    const sin=Math.sin(yaw), cos=Math.cos(yaw);
    const moving=stepping && dt>0 && (speed>.045 || travel>.00012);
    const centre=space.position;
    const footCentre=(side,out)=>{
      const lateral=side*(.137+.009*gait.run);
      return out.set(centre.x+cos*lateral+sin*neutralZ,floor,centre.z-sin*lateral+cos*neutralZ);
    };
    if (!ready || reset || off<1) {
      gait.strength=0; gait.run=0; gait.phase=.27; gait.support=0; gait.arms=0;
      gait.grade=0; gait.brake=0; gait.bounce=0; gait.supportFloor=0;
      walking=false; stopping=false; courseKey=''; transition=1;
      dir.set(sin,0,cos);
      for (let i=0;i<2;i++) {
        const f=feet[i]; footCentre(f.side,f.point);
        f.point.y=soleHeight(stairs,f.point,i,floor,indoor,yaw-f.side*.135,0);
        f.anchor.copy(f.point); f.mode='rest'; f.pitch=0; f.lift=0; f.contact=true;
        f.armed=false; f.announced=false;
      }
      ready=true;
      if (off<1 || reset) return gait;
    }
    if (travel>.00001) dir.set(dx/travel,0,dz/travel);
    const blendDt=walking && !moving?0:dt;
    gait.strength=damp(gait.strength,moving?1:0,moving?18:10,blendDt);
    gait.run=damp(gait.run,moving?smoothstep(speed,2.05,4.20):0,moving?14:8,blendDt);
    const r=gait.run, depth=stairs.origin.z-centre.z;
    const onFlight=indoor && depth>stairs.front-.06 && depth<stairs.back+.06;
    const stone=moving && free && onFlight && Math.abs(dir.z)>.77;
    const ascending=(centre.x<stairs.origin.x?-dir.z:dir.z)>0;
    gait.grade=damp(gait.grade,onFlight && moving?(ascending?1:-1):0,14,blendDt);
    const tread=(stairs.back-stairs.front)/stairs.treads;
    const span=tread*(speed>2.85?2:1);
    const stride=stone?2*span:lerp(1.28,2.13,r);
    const stance=stone?lerp(.52,.30,smoothstep(speed,1.9,3.7)):lerp(.565,.355,r);
    const stoneSign=Math.sign(dir.z);
    const firstZ=stairs.origin.z-(centre.x<stairs.origin.x?stairs.front:stairs.back);
    const along=(centre.z-firstZ)*stoneSign;
    const key=stone?[centre.x<stairs.origin.x,stoneSign,span].join('/'):'flat';
    const changed=moving && key!==courseKey;
    if (changed) {
      transition=walking?0:1;
      for (const f of feet) f.blendFrom.copy(f.point);
      courseKey=key;
    }
    if (moving) {
      stopping=false; gait.brake=damp(gait.brake,0,12,dt);
      if (stone) gait.phase=euclideanModulo((along+neutralZ+stride*stance*.5)/stride,1);
      else if (!walking || changed) {
        const lead=delta.subVectors(feet[1].point,feet[0].point).dot(dir)>.015?1:0;
        const offset=delta.subVectors(feet[lead].point,footCentre(feet[lead].side,neutral)).dot(dir);
        gait.phase=(clamp(stance*.5-offset/stride,.06,stance-.05)+lead*.5)%1;
        for (const f of feet) { f.mode='rest'; f.anchor.copy(f.point); }
      } else gait.phase=(gait.phase+travel/stride)%1;
      transition=Math.min(1,transition+dt/.155);
    } else if (walking) {
      stopping=true; stopTime=0; stopBob=gait.bounce;
      // A stop keeps the weight-bearing outsole under the hips. Only the other
      // foot completes a short recovery step. Preserve that split after settling.
      const gaps=feet.map((f,i)=>f.point.y-soleHeight(stairs,f.point,i,floor,indoor,yaw-f.side*.135,f.pitch));
      bearing=Math.abs(gaps[0]-gaps[1])<.005
        ? (feet[0].contact?0:1) : (gaps[0]<=gaps[1]?0:1);
      const support=feet[bearing], fore=delta.subVectors(support.point,footCentre(support.side,neutral)).dot(dir);
      for (const [i,f] of feet.entries()) {
        f.from.copy(f.point); f.stopPitch=f.pitch; f.stopLift=f.lift;
        if (i===bearing) f.to.copy(f.point);
        else {
          footCentre(f.side,f.to).addScaledVector(dir,fore>0?-.105:.125);
          if (onFlight) {
            const line=stairs.origin.z-(centre.x<stairs.origin.x?stairs.front:stairs.back);
            f.to.z=line+Math.round((f.to.z-line)/tread)*tread;
          }
        }
        f.to.y=soleHeight(stairs,f.to,i,floor,indoor,yaw-f.side*.135,0);
      }
    }
    if (stopping) stopTime+=walking?0:dt;
    const stopT=clamp(stopTime/.245,0,1);
    if (!moving) gait.brake=stopping?Math.sin(Math.PI*stopT)*(1-stopT):0;
    for (let i=0;i<2;i++) {
      const f=feet[i], t=(gait.phase+i*.5)%1, p=f.point, footYaw=yaw-f.side*.135;
      footCentre(f.side,neutral);
      if (moving) {
        const sw=clamp((t-stance)/(1-stance),0,1);
        const loaded=t<stance;
        if (f.contact && !loaded) { f.armed=false; f.announced=false; }
        const supportT=clamp(t/stance,0,1);
        const heel=stone?(ascending?.055:.115):lerp(.19,.095,r);
        const push=stone?(ascending?.22:.11):lerp(.29,.42,r);
        f.pitch=loaded?-heel*(1-smoothstep(supportT,0,.30))+push*smoothstep(supportT,.62,1)
          :push*(1-smoothstep(sw,0,.28))-.13*Math.sin(Math.PI*sw)-heel*smoothstep(sw,.73,1);
        f.contact=loaded;
        if (stone) {
          const offset=i*span;
          const clock=(along+neutralZ+stride*stance*.5-offset)/stride;
          const startZ=firstZ+(offset+Math.floor(clock)*stride)*stoneSign;
          const endZ=startZ+stride*stoneSign;
          const startY=top(neutral.x,startZ,floor,indoor), endY=top(neutral.x,endZ,floor,indoor);
          f.landingY=loaded?startY:endY;
          const progress=sw-.68*Math.sin(tau*sw)/tau;
          p.copy(neutral); p.z=lerp(startZ,endZ,progress);
          f.lift=Math.sin(Math.PI*sw);
          const riseT=endY>startY?smoothstep(sw,0,.86):smoothstep(sw,.14,1);
          p.y=lerp(startY,endY,riseT)+f.lift*(.12+.105*r);
          f.mode='stone';
        } else if (loaded) {
          if (f.mode!=='support') f.anchor.copy(f.mode==='swing'?f.to:p);
          f.mode='support'; p.copy(f.anchor); p.y=top(p.x,p.z,floor,indoor); f.lift=0;
        } else {
          prediction.copy(neutral).addScaledVector(dir,stride*(1-t+stance*.5));
          prediction.y=top(prediction.x,prediction.z,floor,indoor);
          f.landingY=prediction.y;
          if (f.mode!=='swing') {
            f.from.copy(p); f.to.copy(prediction);
            f.startSwing=(!walking || changed)?sw:0;
          } else f.to.lerp(prediction,1-Math.exp(-23*dt));
          f.mode='swing';
          const u=clamp((sw-f.startSwing)/Math.max(.04,1-f.startSwing),0,1);
          const progress=u-.70*Math.sin(tau*u)/tau;
          f.lift=Math.sin(Math.PI*u);
          p.lerpVectors(f.from,f.to,progress);
          p.y+=f.lift*(.105+.142*r);
        }
        if (transition<1) p.lerpVectors(f.blendFrom,p,smoothstep(transition,0,1));
        // A sharp reversal can leave an old world-space footprint unreachable.
        // Limit only the excess beyond the envelope of an ordinary straight step.
        delta.subVectors(p,neutral); delta.y=0;
        const reach=lerp(.43,.49,r), length=delta.length();
        if (length>reach) { p.x-=delta.x*(1-reach/length); p.z-=delta.z*(1-reach/length); }
      } else if (stopping) {
        const fixed=i===bearing;
        const u=smoothstep(fixed?stopTime/.128:stopT,0,1);
        f.pitch=lerp(f.stopPitch,0,u); f.lift=f.stopLift*(1-u);
        p.lerpVectors(f.from,f.to,u);
        if (fixed && f.contact && stopTime>0) p.y=-Infinity;
        if (!fixed) p.y+=.033*Math.sin(Math.PI*stopT);
        f.mode='rest';
      } else {
        p.copy(neutral); p.y=top(p.x,p.z,floor,indoor);
        f.pitch=0; f.lift=0; f.contact=true;
      }
      const surface=soleHeight(stairs,p,i,floor,indoor,footYaw,f.pitch);
      p.y=Math.max(p.y,surface);
      if (!moving || !free) f.armed=false;
      // Physics ticks at 60 Hz. A repeated render of the same position must
      // retain the pending landing without dispatching a second sound.
      else if (travel>.0001 && !f.announced) {
        const atLanding=t>stance+(1-stance)*.83 && Math.abs(surface-f.landingY)<.045;
        if ((f.contact || atLanding) && p.y-surface<.0035 && f.armed) {
          f.landed=true; f.announced=true; f.armed=false;
        } else if (!f.contact && p.y-surface>.016) f.armed=true;
      }
    }
    const pulse=Math.cos(tau*(gait.phase-stance*.5));
    const sideLoad=stopping?(bearing===0?1:-1)*Math.sin(Math.PI*stopT)*.62:0;
    gait.support=damp(gait.support,moving?pulse*gait.strength:sideLoad,22,blendDt);
    // Drive the opposite shoulder from the actual lead shoe, including reversals.
    const lead=delta.subVectors(feet[0].point,feet[1].point).dot(dir);
    gait.arms=damp(gait.arms,moving?clamp(lead/lerp(.64,.78,r),-1,1)*gait.strength:0,26,blendDt);
    const strikeDistance=Math.min(gait.phase% .5,.5-gait.phase% .5);
    const compression=1-smoothstep(strikeDistance,0,.22);
    gait.bounce=moving?lerp(.017,.036,r)*gait.strength*(1-2*compression)
      :stopping?lerp(stopBob,0,smoothstep(stopT,0,1))-.020*gait.brake:0;
    gait.supportFloor=stopping?Math.min(feet[0].to.y,feet[1].to.y)-floor
      :Math.min(feet[0].point.y,feet[1].point.y)-floor;
    walking=moving;
    return gait;
  }
  return {update};
}
