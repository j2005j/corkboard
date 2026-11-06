// User settings: new-note color, theme, sound, motion.
// Theme lives in its own key (the pre-paint script reads it), the rest in one
// JSON blob; everything notifies subscribers so rail buttons and the settings
// panel stay in sync.

const KEY = "sticky-settings";
const THEME_KEY = "sticky-theme";

export const COLOR_MODES = ["yellow", "random", "preset", "custom"];
export const PALETTE = ["yellow", "pink", "blue", "green", "purple", "white"];

const defaults = {
  colorMode: "yellow", // yellow | random | preset | custom
  colorValue: "#ffec99", // named palette color (preset) or hex (custom)
  motion: true,
  grain: true, // paper-like grain on the notes
  railPos: null, // "left" | "bottom" | null = left on desktop, bottom on phones
};

let cfg = load();
const subs = new Set();
const themeSubs = new Set();

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
    return {
      colorMode: COLOR_MODES.includes(raw.colorMode) ? raw.colorMode : defaults.colorMode,
      colorValue: typeof raw.colorValue === "string" ? raw.colorValue : defaults.colorValue,
      motion: raw.motion !== false,
      grain: raw.grain !== false,
      railPos: raw.railPos === "left" || raw.railPos === "bottom" ? raw.railPos : null,
    };
  } catch {
    return { ...defaults };
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg));
  } catch {
    /* ignore */
  }
}

export function get(k) {
  return cfg[k];
}

export function set(k, v) {
  if (k === "motion") v = !!v;
  if (k === "grain") v = !!v;
  if (k === "railPos") v = v === "left" || v === "bottom" ? v : null;
  if (k === "colorMode" && !COLOR_MODES.includes(v)) v = defaults.colorMode;
  cfg[k] = v;
  save();
  if (k === "motion") applyMotion();
  if (k === "grain") applyGrain();
  if (k === "railPos") applyRail();
  emit(k);
}

export function onChange(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function emit(key) {
  subs.forEach((fn) => {
    try {
      fn(key);
    } catch (err) {
      console.error("settings subscriber failed:", err);
    }
  });
}

// ---------- theme (kept in its own key for the pre-paint script) ----------

export function getTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === "dark" || t === "light") return t;
  } catch {
    /* ignore */
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function setTheme(theme) {
  const t = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    /* ignore */
  }
  themeSubs.forEach((fn) => {
    try {
      fn(t);
    } catch (err) {
      console.error("theme subscriber failed:", err);
    }
  });
}

export function onThemeChange(fn) {
  themeSubs.add(fn);
  return () => themeSubs.delete(fn);
}

// ---------- motion ----------

export function applyMotion() {
  document.documentElement.dataset.motion = cfg.motion ? "on" : "off";
}

export function motionEnabled() {
  return cfg.motion !== false;
}

// ---------- paper grain ----------

export function applyGrain() {
  document.documentElement.dataset.grain = cfg.grain ? "on" : "off";
}

export function grainEnabled() {
  return cfg.grain !== false;
}

// ---------- rail position ----------

const isNarrow = () => window.matchMedia("(max-width: 700px)").matches;

// Explicit choice wins; otherwise left on desktop, bottom on phones. Re-run
// on breakpoint changes so rotating/resizing a device picks the right default.
export function applyRail() {
  const pos = cfg.railPos || (isNarrow() ? "bottom" : "left");
  document.documentElement.dataset.rail = pos;
}

export function railPosition() {
  return cfg.railPos;
}

// ---------- new-note color ----------

export function isHex(v) {
  return typeof v === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v);
}

// Color for the next created note, per the user's color setting.
export function nextNoteColor() {
  if (cfg.colorMode === "random") return PALETTE[Math.floor(Math.random() * PALETTE.length)];
  if (cfg.colorMode === "preset") return PALETTE.includes(cfg.colorValue) ? cfg.colorValue : "yellow";
  if (cfg.colorMode === "custom" && isHex(cfg.colorValue)) return cfg.colorValue.toLowerCase();
  return "yellow";
}

// Keep any stored color: a named palette color or a hex, else yellow.
export function normalizeColor(c) {
  if (PALETTE.includes(c)) return c;
  if (isHex(c)) return c.toLowerCase();
  return "yellow";
}
