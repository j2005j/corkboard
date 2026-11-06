// Tiny synthesized sound effects (Web Audio), off by default.

const KEY = "sticky-sound";
const VOL_KEY = "sticky-volume";
let enabled = localStorage.getItem(KEY) === "1";
let volume = loadVolume(); // 0..1, default 100%
let ctx = null;
let master = null; // one gain stage every synth voice passes through
const subs = new Set();

function loadVolume() {
  const v = parseFloat(localStorage.getItem(VOL_KEY));
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 1;
}

export function isEnabled() {
  return enabled;
}

export function getVolume() {
  return volume;
}

export function setVolume(v) {
  volume = Math.min(1, Math.max(0, Number(v) || 0));
  try {
    localStorage.setItem(VOL_KEY, String(volume));
  } catch {
    /* ignore */
  }
  if (master) master.gain.value = volume;
  samples.forEach((a) => {
    a.volume = volume * 0.65;
  });
  subs.forEach((fn) => {
    try {
      fn(enabled);
    } catch (err) {
      console.error("sound subscriber failed:", err);
    }
  });
}

export function setEnabled(v) {
  enabled = !!v;
  try {
    localStorage.setItem(KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
  subs.forEach((fn) => {
    try {
      fn(enabled);
    } catch (err) {
      console.error("sound subscriber failed:", err);
    }
  });
}

// Let a caller stay in sync wherever the toggle lives.
export function onChange(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

function ac() {
  if (!ctx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) throw new Error("no audio");
    ctx = new Ctx();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function noise(c, dur) {
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

// A couple of real samples (vendored, work offline); everything else is
// synthesized. If a file is missing or can't play, fall back to the synth.
const SAMPLES = {
  crumple: "vendor/ss-recycle.wav",
  erase: "vendor/ss-recycle2.wav",
};
const samples = new Map();

function sampleFor(src) {
  if (!samples.has(src)) {
    const a = new Audio(src);
    a.preload = "auto";
    a.volume = volume * 0.65;
    samples.set(src, a);
  }
  return samples.get(src);
}

function playSample(kind) {
  try {
    const a = sampleFor(SAMPLES[kind]);
    a.currentTime = 0;
    const p = a.play();
    if (p && p.catch) p.catch(() => synth(kind));
  } catch {
    synth(kind);
  }
}

export function play(kind) {
  if (!enabled) return;
  if (SAMPLES[kind]) {
    playSample(kind);
    return;
  }
  synth(kind);
}

function synth(kind) {
  try {
    const c = ac();
    const t = c.currentTime;

    if (kind === "suck") {
      const src = c.createBufferSource();
      src.buffer = noise(c, 0.65);
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.value = 1.1;
      bp.frequency.setValueAtTime(1500, t);
      bp.frequency.exponentialRampToValueAtTime(160, t + 0.58);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.07);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.62);
      src.connect(bp).connect(g).connect(master);
      src.start(t);
      src.stop(t + 0.65);
    } else if (kind === "crumple") {
      const src = c.createBufferSource();
      src.buffer = noise(c, 0.4);
      const hp = c.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 850;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      for (let i = 0; i < 13; i++) {
        g.gain.linearRampToValueAtTime(Math.random() * 0.16 + 0.03, t + i * 0.026);
      }
      g.gain.linearRampToValueAtTime(0.0001, t + 0.37);
      src.connect(hp).connect(g).connect(master);
      src.start(t);
      src.stop(t + 0.4);
    } else if (kind === "pop") {
      const o = c.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(520, t);
      o.frequency.exponentialRampToValueAtTime(900, t + 0.09);
      const g = c.createGain();
      g.gain.setValueAtTime(0.1, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + 0.2);
    } else if (kind === "restore") {
      const o = c.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(760, t);
      o.frequency.exponentialRampToValueAtTime(430, t + 0.12);
      const g = c.createGain();
      g.gain.setValueAtTime(0.08, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + 0.22);
    } else if (kind === "erase") {
      // dust-poof fallback when the recycle2 sample can't play
      const src = c.createBufferSource();
      src.buffer = noise(c, 0.5);
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(4200, t);
      lp.frequency.exponentialRampToValueAtTime(220, t + 0.45);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.2, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.48);
      src.connect(lp).connect(g).connect(master);
      src.start(t);
      src.stop(t + 0.5);
    }
  } catch {
    /* sound is best-effort */
  }
}
