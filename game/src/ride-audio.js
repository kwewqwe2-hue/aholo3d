// All street audio is synthesized in the local Web Audio graph. A visitor can
// judge an approaching patrol by ear while keeping the next turn in sight.
export function createRideAudio(context, master, noise, pickup) {
  const motor=context.createOscillator(), overtone=context.createOscillator();
  const upper=context.createGain(), motorLevel=context.createGain(), steamLevel=context.createGain();
  const steam=context.createBufferSource(), steamFilter=context.createBiquadFilter();
  const stereo=()=>typeof context.createStereoPanner==='function'?context.createStereoPanner():context.createGain();
  const motorPan=stereo(), steamPan=stereo();
  motor.type='sine';motor.frequency.value=125;
  overtone.type='triangle';overtone.frequency.value=250;upper.gain.value=.13;
  motorLevel.gain.value=steamLevel.gain.value=0;
  motor.connect(motorLevel);overtone.connect(upper);upper.connect(motorLevel);
  motorLevel.connect(motorPan);motorPan.connect(master);
  steam.buffer=noise;steam.loop=true;
  steamFilter.type='bandpass';steamFilter.frequency.value=2250;steamFilter.Q.value=.62;
  steam.connect(steamFilter);steamFilter.connect(steamLevel);steamLevel.connect(steamPan);steamPan.connect(master);
  motor.start();overtone.start();steam.start();
  let listener=null, heading=0, active=false, lastSample=-Infinity, lastBounce=-Infinity;
  const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
  const attenuation=(distance,max)=>Math.max(0,1-distance/max)**2;
  function sideOf(point) {
    const dx=point.x-listener.x,dz=point.z-listener.z,range=Math.hypot(dx,dz);
    return clamp((-Math.cos(heading)*dx-Math.sin(heading)*dz)/Math.max(1,range),-.85,.85);
  }
  function silence() {
    if(!active)return;
    const now=context.currentTime;
    motorLevel.gain.setTargetAtTime(0,now,.035);steamLevel.gain.setTargetAtTime(0,now,.04);
    active=false;lastSample=-Infinity;
  }
  function update(frame, enabled) {
    const actor=frame.actor??frame.bike;
    if(!enabled||!actor||frame.stage!=='drive'||frame.paused||actor.indoors||document.hidden) {silence();return;}
    listener=actor;heading=Number.isFinite(frame.cameraHeading)?frame.cameraHeading:actor.heading;
    const now=context.currentTime;
    if(active && now-lastSample<.055)return;
    active=true;lastSample=now;
    const cart=frame.pursuer;
    if(cart?.active && cart.visible && frame.guard?.phase==='chasing') {
      const d=Math.hypot(cart.x-actor.x,cart.z-actor.z),speed=Math.abs(cart.speed);
      motorLevel.gain.setTargetAtTime(attenuation(d,25)*(.080+Math.min(.12,speed*.008)),now,.10);
      motor.frequency.setTargetAtTime(104+speed*9.8,now,.095);
      overtone.frequency.setTargetAtTime(209+speed*19.61,now,.085);
      motorPan.pan?.setTargetAtTime(sideOf(cart),now,.08);
    } else motorLevel.gain.setTargetAtTime(0,now,.08);
    const d=Math.hypot(pickup.x-actor.x,pickup.z-actor.z);
    steamLevel.gain.setTargetAtTime(.14*attenuation(d,18)*(.85+.15*Math.sin(frame.elapsed*2)),now,.18);
    steamPan.pan?.setTargetAtTime(sideOf(pickup),now,.10);
  }
  function bounce(point) {
    if(!active||!listener||document.hidden||context.state!=='running')return;
    const now=context.currentTime,d=Math.hypot(point.x-listener.x,point.z-listener.z);
    if(d>27||now-lastBounce<.27)return;
    lastBounce=now;
    const oscillator=context.createOscillator(), gain=context.createGain(), pan=stereo();
    if(pan.pan)pan.pan.value=sideOf(point);
    oscillator.type='sine';oscillator.frequency.setValueAtTime(168,now);
    oscillator.frequency.exponentialRampToValueAtTime(63,now+.105);
    gain.gain.setValueAtTime(.0001,now);
    gain.gain.exponentialRampToValueAtTime(.0002+.99*attenuation(d,28),now+.006);
    gain.gain.exponentialRampToValueAtTime(.0001,now+.15);
    oscillator.connect(gain);gain.connect(pan);pan.connect(master);
    oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();pan.disconnect();};
    oscillator.start(now);oscillator.stop(now+.16);
  }
  return {update,silence,bounce};
}
