import guardVoice from './assets/audio/guard-alert.mp3?url&inline';
import { createRideAudio } from './ride-audio.js';

export function createSound(course) {
  let context, master, oscillator, tone, power;
  let muted = false, callout, voiceBuffer, voiceReady, voiceGeneration = 0, noise;
  let street, wasPlaying = false;
  function unlock() {
    if (!context) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      context = new Audio();
      master = context.createGain(); master.gain.value = muted ? 0 : 0.23; master.connect(context.destination);
      oscillator = context.createOscillator(); oscillator.type = 'sawtooth'; oscillator.frequency.value = 35;
      tone = context.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 200;
      power = context.createGain(); power.gain.value = 0;
      oscillator.connect(tone); tone.connect(power); power.connect(master); oscillator.start();
      noise = context.createBuffer(1, Math.ceil(context.sampleRate * .55), context.sampleRate);
      const samples = noise.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      if (course?.campaign) street=createRideAudio(context,master,noise,course.pickup);
      voiceReady = fetch(guardVoice).then(r => r.arrayBuffer()).then(data => context.decodeAudioData(data))
        .then(buffer => { voiceBuffer = buffer; }).catch(() => {});
    }
    if (context.state === 'suspended') context.resume().catch(() => {});
  }
  function ping(frequency, next, duration, shape = 'sine', delay = 0) {
    if (!context || muted || context.state !== 'running') return;
    const start = context.currentTime + delay;
    const source = context.createOscillator(), level = context.createGain();
    source.type = shape; source.frequency.setValueAtTime(frequency, start);
    source.frequency.exponentialRampToValueAtTime(next, start + duration);
    level.gain.setValueAtTime(0.0001, start); level.gain.exponentialRampToValueAtTime(0.31, start + 0.008);
    level.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(level); level.connect(master); source.start(start); source.stop(start + duration + 0.02);
    source.onended = () => { source.disconnect(); level.disconnect(); };
  }
  function surfaceSound(frequency, duration, amplitude, delay = 0, resonance = .85) {
    if (!noise || muted || context.state !== 'running') return;
    const start = context.currentTime + delay;
    const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
    source.buffer = noise; filter.type = 'bandpass'; filter.frequency.value = frequency; filter.Q.value = resonance;
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(amplitude, start + .006);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    source.connect(filter); filter.connect(gain); gain.connect(master);
    source.start(start, Math.random() * .12, duration);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }
  function stopVoice() {
    voiceGeneration++;
    if (callout) { callout.stop(); callout = null; }
  }
  async function shout() {
    stopVoice();
    const generation = voiceGeneration;
    await voiceReady;
    if (!voiceBuffer || muted || document.hidden || generation !== voiceGeneration) return;
    const voice = context.createBufferSource(), gain = context.createGain();
    voice.buffer = voiceBuffer;
    gain.gain.value = 2.6;
    voice.connect(gain); gain.connect(master); callout = voice;
    voice.onended = () => { if (callout === voice) callout = null; voice.disconnect(); gain.disconnect(); };
    voice.start();
  }
  function event(name) {
    if (name === 'phone') { ping(710, 760, 0.09); ping(940, 940, 0.12, 'sine', 0.11); }
    else if (name === 'pickup' || name === 'item') { ping(510, 720, 0.13, 'triangle'); }
    else if (name === 'guardAlert') { if (context && !muted) void shout(); }
    else if (name === 'takeBag') {
      surfaceSound(1120,.13,.44); surfaceSound(3600,.18,.41,.08);
      surfaceSound(2350,.22,.32,.24); surfaceSound(4700,.07,.18,.34);
    } else if (name === 'knock') {
      ping(178,76,.086,'sine'); surfaceSound(730,.055,.74);
      ping(158,67,.12,'sine',.21); surfaceSound(620,.07,.69,.21);
    } else if (name === 'handoff') {
      surfaceSound(1850,.065,.51); surfaceSound(600,.17,.28,.065);
    } else if (name === 'mount' || name === 'dismount') {
      ping(185,56,.096,'triangle'); surfaceSound(1520,.09,.43,.07);
    }
    else if (name === 'delivered' || name === 'done') {
      [523.25, 659.25, 784, 1046.5].forEach((note, step) => ping(note, note, 0.16, 'triangle', step * 0.085));
    } else if (name === 'failed') ping(242, 99, 0.34, 'triangle');
    else if (name === 'bump' || name === 'splash') ping(106, 46, 0.11, 'triangle');
    else if (name === 'repair') ping(260, 1050, 0.2, 'sine');
    else if (name === 'page') ping(150, 95, 0.045, 'triangle');
  }
  function update(view, throttle) {
    if (!context) return;
    muted = view.muted;
    const now = context.currentTime, velocity = Math.abs(view.bike.speed);
    const playing = view.stage === 'ride' && !view.paused && !view.mapOpen && !document.hidden;
    const riding = playing && view.travelMode !== 'foot';
    if ((!playing && wasPlaying) || (muted && callout)) stopVoice();
    wasPlaying = playing;
    if (!playing || muted) street?.silence();
    master.gain.setTargetAtTime(muted ? 0 : 0.23, now, 0.04);
    power.gain.setTargetAtTime(riding ? 0.11 + Math.min(0.09, velocity / 220) : 0, now, 0.075);
    oscillator.frequency.setTargetAtTime(30 + velocity * 2.5 + (throttle && riding ? 10 : 0), now, 0.13);
    tone.frequency.setTargetAtTime(140 + velocity * 8.5, now, 0.15);
  }
  function footfall({side,indoors,speed}) {
    if (!context || !wasPlaying || muted || document.hidden || speed<.3) return;
    const left=side==='left'||side===1;
    ping((indoors?132:96)*(left?1:.92),indoors?55:43,.062,'sine');
    surfaceSound((indoors?1290:730)*(left?.95:1.05),indoors?.072:.12,
      Math.min(.60,.29+.055*speed));
    if(indoors)surfaceSound(535,.085,.11,.046);
  }
  return { unlock, event, update, footfall,
    world:frame=>street?.update(frame,!muted), bounce:point=>street?.bounce(point) };
}
