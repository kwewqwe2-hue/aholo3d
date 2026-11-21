import './trial.css';
import { course } from './course.js';
import { createTrialScene } from './scene.js';
import { createTrialSession } from './session.js';
import { createSound } from '../src/sound.js';

const get = id => document.getElementById(id);
const controls = { throttle: false, brake: false, left: false, right: false, handbrake: false };
const keys = { KeyW:'throttle',ArrowUp:'throttle',KeyS:'brake',ArrowDown:'brake',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',Space:'handbrake' };
const sound = createSound();
const shift = createTrialSession(course, name => sound.event(name));
let scene, muted = false, accumulated = 0, previous = 0, hudTime = -1, overlayKey = '';
const release = () => Object.keys(controls).forEach(key => { controls[key] = false; });
const byId = ['speed','condition','health-fill','objective','order-pay','pace','notice','overlay','ticket','eyebrow','title','detail','bill','primary','footnote','mute','pause','fault']
  .reduce((fields,id) => ({...fields,[id]:get(id)}),{});
function label(element, value) { if (element.textContent !== value) element.textContent = value; }
function hud(snapshot) {
  const {stage, paused} = snapshot;
  const modal = stage !== 'drive' || paused;
  document.body.dataset.modal = modal ? '1' : '0'; byId.overlay.hidden = !modal;
  label(byId.speed, String(Math.round(Math.abs(snapshot.bike.speed) * 3.6)));
  label(byId.condition, '车况 ' + snapshot.hp); byId.condition.classList.toggle('low', snapshot.hp < 35);
  if (byId['health-fill'].value !== snapshot.hp) byId['health-fill'].value = snapshot.hp;
  const seconds = Math.max(0, Math.ceil(snapshot.bonusTime - snapshot.elapsed));
  const pay = seconds ? '准时奖 +¥' + snapshot.bonusPay + ' · ' + seconds + '秒' : '配送中 · 基础工资 ¥' + snapshot.basePay;
  label(byId['order-pay'], pay);
  label(byId.objective, !snapshot.passedGate ? '穿过北门岗' : snapshot.canDeliver ? '停稳 · Enter 交餐' : course.finish.label + ' · 暖灯单元门');
  byId.pace.hidden = modal || !snapshot.side;
  if (snapshot.side) label(byId.pace, snapshot.side === 'left' ? '◀ 左侧并排　Q' : 'E　右侧并排 ▶');
  const message = snapshot.canDeliver ? course.finish.label + '到了 · 停稳按 Enter 交餐' : snapshot.hint;
  byId.notice.hidden = modal || !message; if (message) label(byId.notice, message);
  label(byId.mute, muted ? '静音 V' : '声音 V');
  if (modal) {
    const mode = paused ? 'paused' : stage;
    if (mode !== overlayKey) {
      overlayKey = mode;
      const copy = {
        ready:['骑手端 / 试驾签','已取餐 · 北门岗','球场试驾','穿过门岗，在球场大弯选自己的线。花架路与外圈都通往亮灯的楼门。','上车　↗','W 给油，A / D 转向。普通弯不需要手刹。'],
        paused:['骑手端 / 临停','订单仍在手中','歇一脚。','车和巡逻员都停在原处。','继续骑行　↗','P 或 Esc 继续。'],
        finished:['骑手端 / 签收',course.finish.label + ' · 订单回执',snapshot.medal,'顾客收下了餐。','再骑一次　↗','再试另一条线，或者试试轻点方向。'],
        failed:['骑手端 / 退单','本单未送达','车况归零','平台退回了这笔订单。','从取餐后重试　↗','车已修好，可以重新出发。']
      }[mode];
      if (copy) {
        ['ticket','eyebrow','title','detail','primary','footnote'].forEach((id,index) => label(byId[id],copy[index]));
        byId.bill.hidden = mode !== 'finished' && mode !== 'failed';
        if (mode === 'finished') label(byId.bill,'工资 ¥' + snapshot.basePay + '　准时奖 ¥' + snapshot.bonus + '　余额 ¥' + snapshot.cash);
        if (mode === 'failed') label(byId.bill,'此次 −¥' + snapshot.fine + '　余额 ¥' + snapshot.cash);
      }
    }
  } else overlayKey = '';
  sound.update({stage:stage === 'drive' ? 'ride' : stage,paused,mapOpen:false,muted,bike:snapshot.bike},controls.throttle);
}
function pulse(intent) {
  sound.unlock();
  if (intent === 'mute') muted = !muted;
  else {
    const changed = shift.act(intent);
    if (changed && ['pause','start','restart','deliver'].includes(intent)) { release(); accumulated = 0; }
  }
  hud(shift.view());
}
function primary() {
  const snapshot=shift.view();
  pulse(snapshot.paused ? 'pause' : snapshot.stage === 'ready' ? 'start' : snapshot.stage === 'drive' ? 'deliver' : 'restart');
}
byId.primary.addEventListener('click',primary);
byId.mute.addEventListener('click',() => pulse('mute'));
byId.pause.addEventListener('click',() => pulse('pause'));
function keyAction(event, down) {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (down) sound.unlock();
  if (down && !event.repeat) {
    if (event.code === 'Enter') { event.preventDefault(); primary(); return; }
    const intent = {KeyQ:'left',KeyE:'right',ShiftLeft:'boost',ShiftRight:'boost',KeyR:'restart',KeyV:'mute',KeyP:'pause',Escape:'pause'}[event.code];
    if (intent) { event.preventDefault(); pulse(intent); return; }
  }
  const key = keys[event.code];
  if (key) {
    const snapshot = shift.view();
    if (snapshot.stage === 'drive' && !snapshot.paused) { event.preventDefault(); controls[key] = down; }
    else if (!down) controls[key] = false;
  }
}
window.addEventListener('keydown',event => keyAction(event,true));
window.addEventListener('keyup',event => keyAction(event,false));
for (const button of document.querySelectorAll('[data-drive]')) {
  const key = button.dataset.drive;
  button.addEventListener('pointerdown',event => {event.preventDefault();sound.unlock();button.setPointerCapture(event.pointerId);controls[key] = true;});
  for (const name of ['pointerup','pointercancel','lostpointercapture']) button.addEventListener(name,() => {controls[key] = false;});
}
for (const button of document.querySelectorAll('[data-pulse]')) button.addEventListener('click',() => pulse(button.dataset.pulse));
function hide() {
  release(); previous = 0; accumulated = 0;
  const snapshot = shift.view();
  if (snapshot.stage === 'drive' && !snapshot.paused) shift.act('pause');
  hud(shift.view());
}
window.addEventListener('blur',hide);
document.addEventListener('visibilitychange',() => { if (document.hidden) hide(); });
window.addEventListener('resize',() => scene?.resize());
function loop(time) {
  const delta = previous ? Math.max(0,Math.min(0.12,(time-previous)/1000)) : 0;
  previous = time; accumulated += delta;
  while (accumulated >= 1/60) { shift.tick(1/60,controls); accumulated -= 1/60; }
  const snapshot = shift.view();
  if (time - hudTime >= 55) { hud(snapshot); hudTime = time; }
  scene.render(snapshot, snapshot.paused ? 0 : delta);
  requestAnimationFrame(loop);
}
try {
  scene = createTrialScene(get('trial-city'),course); scene.resize(); hud(shift.view());
  if (import.meta.env.DEV && new URLSearchParams(location.search).get('qa') === '1') {
    window.trialQA = Object.freeze({ state:() => structuredClone(shift.view()), course:structuredClone(course) });
  }
  requestAnimationFrame(loop);
} catch(error) {
  byId.fault.hidden = false;
  byId.fault.textContent = '无法启动 3D 试驾。请使用支持 WebGL 2 的浏览器。 ' + error.message;
  console.error(error);
}
