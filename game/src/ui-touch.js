// Capture on the persistent UI host. Replacing a HUD while two fingers are
// down must not turn the old pointerup/click into a tap on the new screen.
export function bindTouchControls(host, action, activate) {
  const held = new Map();
  const coarse = matchMedia('(pointer: coarse)');
  let lastTouch = false;
  function holding(key) {
    return [...held.values()].some(p => p.key === key);
  }
  function stickInput(button, x, z) {
    action('control', { key: 'walkX', value: x });
    action('control', { key: 'walkZ', value: z });
    button.style.setProperty('--stick-x', (x * 100).toFixed(2) + '%');
    button.style.setProperty('--stick-y', (-z * 100).toFixed(2) + '%');
  }
  function moveStick(event, p) {
    let x = (event.clientX - p.cx) / p.radius, z = (p.cy - event.clientY) / p.radius;
    const length = Math.hypot(x, z);
    if (length < .09) { x = 0; z = 0; }
    else if (length > 1) { x /= length; z /= length; }
    stickInput(p.button, x, z);
  }
  function release(id) {
    const p = held.get(id);
    if (!p) return;
    held.delete(id);
    if (p.key && !holding(p.key)) {
      p.button.classList.remove('nb-held');
      if (p.key === 'stick') stickInput(p.button, 0, 0);
      else action('control', { key: p.key, pressed: false });
    }
    if (host.hasPointerCapture(id)) host.releasePointerCapture(id);
    return p;
  }
  function clear() {
    for (const id of [...held.keys()]) release(id);
  }
  host.addEventListener('pointerdown', event => {
    lastTouch = event.pointerType === 'touch';
    const button = event.target.closest('button');
    if (button?.disabled || event.button !== 0) return;
    const key = button?.dataset.stick !== undefined ? 'stick' : button?.dataset.control;
    const type = button?.dataset.act ?? (!button && host.dataset.screen === 'intro' ? 'next' : null);
    if (key ? host.dataset.screen !== 'ride' : !lastTouch || !type) return;
    if (button) event.preventDefault();
    if (key === 'stick' && holding(key)) return;
    if (type && [...held.values()].some(p => p.type === type && p.button === button)) return;
    const p = { key, type, button, context: button?.dataset.context, startX: event.clientX, startY: event.clientY };
    const alreadyDown = key && holding(key);
    if (button) host.setPointerCapture(event.pointerId);
    held.set(event.pointerId, p);
    if (key === 'stick') {
      const box = button.getBoundingClientRect();
      p.cx = box.left + box.width / 2; p.cy = box.top + box.height / 2;
      p.radius = Math.min(box.width, box.height) * .32;
      moveStick(event, p);
    } else if (key && !alreadyDown) action('control', { key, pressed: true });
    if (key) button.classList.add('nb-held');
  });
  host.addEventListener('pointermove', event => {
    const p = held.get(event.pointerId);
    if (p?.key === 'stick') moveStick(event, p);
  });
  host.addEventListener('pointerup', event => {
    const p = release(event.pointerId);
    if (!p?.type) return;
    if (!p.button && Math.hypot(event.clientX - p.startX, event.clientY - p.startY) > 12) return;
    const at = document.elementFromPoint(event.clientX, event.clientY);
    if (!host.contains(at) || p.button && (p.button.disabled || p.button !== at.closest('button') ||
      p.context !== p.button.dataset.context)) return;
    activate(p.type, p.button);
  });
  for (const type of ['pointercancel', 'lostpointercapture']) {
    host.addEventListener(type, event => release(event.pointerId));
  }
  host.addEventListener('click', event => {
    // Keyboard activation and assistive-technology clicks have detail zero.
    if (event.detail && (event.pointerType === 'touch' || event.sourceCapabilities?.firesTouchEvents)) {
      event.stopPropagation(); event.preventDefault(); return;
    }
    const button = event.target.closest('button');
    const type = button?.dataset.act ?? (!button && host.dataset.screen === 'intro' ? 'next' : null);
    if (!type || button?.disabled) return;
    event.stopPropagation();
    if (event.detail && host.dataset.screen === 'ride') button?.blur();
    activate(type, button);
  });
  host.addEventListener('contextmenu', e => {
    if (e.target.closest('[data-control], [data-stick]')) e.preventDefault();
  });
  window.addEventListener('blur', clear);
  window.addEventListener('resize', clear);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });
  return { clear, isTouch: () => lastTouch || (coarse.matches && navigator.maxTouchPoints > 0) };
}
