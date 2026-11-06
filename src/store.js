// In-memory note store, mirrored to IndexedDB.

import * as db from "./db.js";
import { sanitize } from "./markdown.js";
import { nextNoteColor, normalizeColor } from "./settings.js";

export const DAY = 86400000;
export const TRASH_TTL = 30 * DAY;
export const COLORS = ["yellow", "pink", "blue", "green", "purple", "white"];
export const STATES = ["open", "done", "trash"];

const notes = new Map();
const subs = new Set();
let zCounter = 10;

export function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

function emit() {
  subs.forEach((fn) => {
    try {
      fn();
    } catch (err) {
      console.error("store subscriber failed:", err);
    }
  });
}

export async function init() {
  const list = await db.getAll();
  list.forEach((n) => notes.set(n.id, n));
  zCounter = Math.max(10, ...[...notes.values()].map((n) => Number(n.z) || 0)) + 1;
  const purged = await purgeExpired();
  emit();
  return purged;
}

export function all() {
  return [...notes.values()];
}

export function byState(state) {
  return all().filter((n) => n.state === state);
}

export function get(id) {
  return notes.get(id);
}

export function nextZ() {
  return zCounter++;
}

// Rotation angles live in (-180, 180] so spinning a note forever never
// accumulates a silly number of degrees (and can't "glitch out").
export function normRot(deg) {
  if (!Number.isFinite(+deg)) return 0;
  let a = ((+deg % 360) + 360) % 360; // -> [0, 360)
  if (a > 180) a -= 360; // -> (-180, 180]
  return a === 0 ? 0 : a; // avoid -0
}

// Mobile stack reorder: rewrite every z in one pass so the single emit
// renders the final order instead of a half-swapped mix.
export function reorder(ids) {
  const touched = [];
  ids.forEach((id) => {
    const n = notes.get(id);
    if (!n) return;
    n.z = nextZ();
    touched.push(n);
  });
  touched.forEach((n) => db.put(n));
  if (touched.length) emit();
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function create({
  x = 60,
  y = 60,
  html = "",
  color,
  md = null,
  mode = "rich",
  w = null,
  h = null,
  rot = null,
  pinned = false,
} = {}) {
  const now = Date.now();
  const note = {
    id: uuid(),
    html,
    md,
    mode: ["rich", "md", "source"].includes(mode) ? mode : "rich",
    color: color == null ? nextNoteColor() : normalizeColor(color),
    x: Math.round(x),
    y: Math.round(y),
    w: Number.isFinite(+w) && +w > 0 ? Math.round(+w) : null,
    h: Number.isFinite(+h) && +h > 0 ? Math.round(+h) : null,
    // rot == null falls back to the note's own default tilt (askew);
    // an explicit angle is normalized into (-180, 180].
    rot: rot == null ? null : Number.isFinite(+rot) ? normRot(+rot) : null,
    pinned: !!pinned,
    z: nextZ(),
    state: "open",
    createdAt: now,
    updatedAt: now,
    doneAt: null,
    trashedAt: null,
    purgeAt: null,
  };
  notes.set(note.id, note);
  db.put(note);
  emit();
  return note;
}

export function update(id, patch, { touch = true } = {}) {
  const note = notes.get(id);
  if (!note) return null;
  Object.assign(note, patch);
  if (touch) note.updatedAt = Date.now();
  db.put(note);
  emit();
  return note;
}

export function setState(id, state) {
  const note = notes.get(id);
  if (!note || !STATES.includes(state)) return null;
  const now = Date.now();
  note.state = state;
  if (state === "done") {
    note.doneAt = now;
    note.trashedAt = null;
    note.purgeAt = null;
  } else if (state === "trash") {
    note.trashedAt = now;
    note.purgeAt = now + TRASH_TTL;
    note.doneAt = null;
  } else {
    note.doneAt = null;
    note.trashedAt = null;
    note.purgeAt = null;
  }
  note.updatedAt = now;
  db.put(note);
  emit();
  return note;
}

export function destroy(id) {
  if (!notes.delete(id)) return;
  db.remove(id);
  emit();
}

export async function purgeExpired() {
  const now = Date.now();
  const dead = all().filter((n) => n.state === "trash" && n.purgeAt && n.purgeAt <= now);
  for (const n of dead) {
    notes.delete(n.id);
    await db.remove(n.id);
  }
  if (dead.length) emit();
  return dead.length;
}

export function exportData() {
  return JSON.stringify(
    {
      app: "corkboard",
      version: 1,
      exportedAt: new Date().toISOString(),
      notes: all(),
    },
    null,
    2
  );
}

function normalize(n) {
  return {
    id: String(n.id),
    html: sanitize(n.html || ""),
    md: typeof n.md === "string" ? n.md : null,
    mode: ["rich", "md", "source"].includes(n.mode) ? n.mode : "rich",
    color: normalizeColor(n.color),
    x: Number.isFinite(+n.x) ? Math.round(+n.x) : 40,
    y: Number.isFinite(+n.y) ? Math.round(+n.y) : 40,
    w: Number.isFinite(+n.w) && +n.w > 0 ? Math.round(+n.w) : null,
    h: Number.isFinite(+n.h) && +n.h > 0 ? Math.round(+n.h) : null,
    rot: n.rot == null || n.rot === "" ? null : Number.isFinite(+n.rot) ? normRot(+n.rot) : null,
    pinned: !!n.pinned,
    z: Number.isFinite(+n.z) ? +n.z : 1,
    state: STATES.includes(n.state) ? n.state : "open",
    createdAt: +n.createdAt || Date.now(),
    updatedAt: +n.updatedAt || Date.now(),
    doneAt: n.doneAt || null,
    trashedAt: n.trashedAt || null,
    purgeAt: n.purgeAt || null,
  };
}

export async function importData(data) {
  const list = Array.isArray(data) ? data : data && data.notes;
  if (!Array.isArray(list)) throw new Error("That file doesn't contain notes.");
  const clean = list.filter((n) => n && n.id != null).map(normalize);
  await db.clear();
  notes.clear();
  clean.forEach((n) => notes.set(n.id, n));
  await db.putMany(clean);
  zCounter = Math.max(10, ...clean.map((n) => n.z)) + 1;
  emit();
  return clean.length;
}
