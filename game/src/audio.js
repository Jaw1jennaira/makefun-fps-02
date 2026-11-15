// audio.js — all sound is synthesized with WebAudio: no audio assets, no network.
// The context is created lazily on the first user gesture (pointer lock click).
export function createSfx() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function noise(dur, filterFreq, gain, type = 'lowpass') {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    const filter = c.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur);
  }

  function tone(freq, dur, gain, type = 'sine', slideTo = 0) {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur);
  }

  return {
    unlock() { ensure(); },
    shot(kind) {
      if (kind === 'sniper') { noise(0.28, 900, 0.9); tone(160, 0.18, 0.5, 'sawtooth', 40); }
      else if (kind === 'smg') { noise(0.09, 1800, 0.45); tone(220, 0.06, 0.25, 'square', 90); }
      else if (kind === 'pistol') { noise(0.12, 1400, 0.55); tone(190, 0.08, 0.3, 'square', 70); }
      else { noise(0.14, 1200, 0.7); tone(150, 0.1, 0.4, 'sawtooth', 60); }
    },
    enemyShot(dist) {
      const g = Math.max(0.06, 0.5 - dist * 0.012);
      noise(0.12, 1000, g);
    },
    dry() { tone(1200, 0.03, 0.15, 'square'); },
    reload() { tone(500, 0.05, 0.2, 'square', 300); setTimeout(() => tone(700, 0.05, 0.2, 'square', 400), 160); },
    hit() { tone(1400, 0.05, 0.25, 'square'); },
    kill() { tone(880, 0.08, 0.3, 'square'); setTimeout(() => tone(1320, 0.1, 0.3, 'square'), 70); },
    hurt() { noise(0.15, 500, 0.4); tone(110, 0.15, 0.35, 'sawtooth', 60); },
    plantBeep() { tone(980, 0.07, 0.3, 'sine'); },
    spikeBeep() { tone(1200, 0.09, 0.3, 'sine'); },
    explosion() { noise(0.9, 300, 1.0); tone(70, 0.7, 0.6, 'sine', 30); },
    grenadePin() { tone(600, 0.04, 0.2, 'square'); },
    roundWin() { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.16, 0.3, 'triangle'), i * 110)); },
    roundLose() { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.18, 0.3, 'triangle'), i * 120)); },
    buy() { tone(760, 0.06, 0.25, 'sine'); setTimeout(() => tone(1010, 0.08, 0.25, 'sine'), 60); },
    click() { tone(900, 0.03, 0.15, 'square'); },
  };
}
