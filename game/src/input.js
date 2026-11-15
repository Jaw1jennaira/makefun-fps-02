// input.js — keyboard + pointer lock mouse look. Look deltas are consumed
// once per frame (takeLook), so the fixed-step simulation never sees stale input.
export function createInput(canvas, onLockChange) {
  const state = {
    keys: new Set(),
    firing: false,
    aiming: false,
    locked: false,
  };
  let lookX = 0;
  let lookY = 0;
  const pressed = new Set(); // edge-triggered keys, consumed by the game
  const keyHandlers = new Map();

  function onKey(key, fn) {
    keyHandlers.set(key, fn);
  }

  document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    state.keys.add(e.code);
    pressed.add(e.code);
    const fn = keyHandlers.get(e.code);
    if (fn) fn();
    if (e.code === 'Space') e.preventDefault();
  });
  document.addEventListener('keyup', (e) => {
    state.keys.delete(e.code);
  });
  document.addEventListener('mousemove', (e) => {
    if (!state.locked) return;
    lookX += e.movementX || 0;
    lookY += e.movementY || 0;
  });
  document.addEventListener('mousedown', (e) => {
    if (!state.locked) return;
    if (e.button === 0) state.firing = true;
    if (e.button === 2) state.aiming = true;
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) state.firing = false;
    if (e.button === 2) state.aiming = false;
  });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      state.firing = false;
      state.aiming = false;
    }
    onLockChange(state.locked);
  });
  window.addEventListener('blur', () => {
    state.keys.clear();
    state.firing = false;
    state.aiming = false;
  });

  return {
    state,
    requestLock() {
      try {
        const r = canvas.requestPointerLock();
        if (r && r.catch) r.catch(() => {});
      } catch { /* headless / shot captures: lock is unavailable, play on */ }
    },
    exitLock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
    takeLook() {
      const out = { x: lookX, y: lookY };
      lookX = 0;
      lookY = 0;
      return out;
    },
    wasPressed(code) {
      if (pressed.has(code)) {
        pressed.delete(code);
        return true;
      }
      return false;
    },
    clearPressed() {
      pressed.clear();
    },
    onKey,
  };
}
