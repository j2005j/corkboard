// Right side panel: dust bag (completed), trash and settings, swapped in place.

import * as store from "./store.js";
import * as settings from "./settings.js";
import * as sound from "./sound.js";
import { textOf } from "./markdown.js";
import { icon } from "./icons.js";

const app = document.getElementById("app");
const panel = document.getElementById("panel");
const titleEl = document.getElementById("panel-title");
const iconEl = document.getElementById("panel-icon");
const countEl = document.getElementById("panel-count");
const listEl = document.getElementById("panel-list");
const searchEl = document.getElementById("panel-search");
const footEl = document.getElementById("panel-foot");
const closeBtn = document.getElementById("panel-close");

let mode = null; // "vac" | "trash" | null
let handlers = {};
let onModeChange = null;
let lastIds = new Set();
let armedId = null;
let armedTimer = null;

const MODES = {
  vac: { title: "Dust bag", icon: "broom-duotone", cls: "vac", empty: "Nothing swept up yet.<br>Notes you finish land here." },
  trash: { title: "Trash", icon: "trash-duotone", cls: "bin", empty: "The trash is empty." },
  settings: { title: "Settings", icon: "gear-six-bold", cls: "set", empty: "" },
};

export function init(h, cb) {
  handlers = h || {};
  onModeChange = cb || null;
  closeBtn.addEventListener("click", close);
  searchEl.addEventListener("input", renderList);
  footEl.addEventListener("click", (e) => {
    if (e.target.closest('[data-act="erase-trash"]') && handlers.onEraseTrash) handlers.onEraseTrash();
  });
  store.subscribe(() => {
    if (mode && mode !== "settings") renderList();
  });
}

export function isOpen() {
  return mode !== null;
}

export function currentMode() {
  return mode;
}

export function open(next) {
  if (!MODES[next]) return;
  const switching = mode !== next;
  mode = next;
  searchEl.value = "";
  app.classList.add("panel-open");
  panel.setAttribute("aria-hidden", "false");
  const m = MODES[mode];
  titleEl.textContent = m.title;
  iconEl.className = "panel-icon " + m.cls;
  iconEl.innerHTML = icon(m.icon);
  footEl.hidden = mode !== "trash";
  footEl.innerHTML =
    mode === "trash"
      ? `<span class="foot-text">Notes in the trash are permanently deleted after 30 days.</span>
         <button type="button" class="erase-btn" data-act="erase-trash">Erase all</button>`
      : "";
  // Settings has no note list: no search box, no count badge.
  searchEl.closest(".panel-search").hidden = mode === "settings";
  countEl.hidden = mode === "settings";
  document.getElementById("vac-ball").setAttribute("aria-pressed", String(mode === "vac"));
  document.getElementById("trash-ball").setAttribute("aria-pressed", String(mode === "trash"));
  lastIds = new Set();
  renderList();
  if (switching && onModeChange) onModeChange(mode);
}

export function close() {
  if (!mode) return;
  mode = null;
  app.classList.remove("panel-open");
  panel.setAttribute("aria-hidden", "true");
  document.getElementById("vac-ball").setAttribute("aria-pressed", "false");
  document.getElementById("trash-ball").setAttribute("aria-pressed", "false");
  disarm();
  if (onModeChange) onModeChange(null);
}

export function toggle(next) {
  if (mode === next) close();
  else open(next);
}

function notesFor() {
  const list = store.byState(mode === "vac" ? "done" : "trash");
  const q = searchEl.value.trim().toLowerCase();
  const filtered = q
    ? list.filter((n) => (n.html || "").toLowerCase().includes(q) || textOf(n.html).toLowerCase().includes(q))
    : list;
  return filtered.sort((a, b) => (b.doneAt || b.trashedAt || 0) - (a.doneAt || a.trashedAt || 0));
}

function timeAgo(ts) {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return m + "m ago";
  const h = Math.round(m / 60);
  if (h < 24) return h + "h ago";
  const d = Math.round(h / 24);
  if (d < 30) return d + "d ago";
  return Math.round(d / 30) + "mo ago";
}

function daysLeft(purgeAt) {
  return Math.max(0, Math.ceil((purgeAt - Date.now()) / store.DAY));
}

function disarm() {
  clearTimeout(armedTimer);
  armedId = null;
}

function renderList() {
  if (!mode) return;
  if (mode === "settings") {
    countEl.hidden = true;
    renderSettings();
    return;
  }
  const notes = notesFor();
  const all = store.byState(mode === "vac" ? "done" : "trash");
  countEl.textContent = String(all.length);
  countEl.hidden = all.length === 0;

  const ids = new Set(notes.map((n) => n.id));
  if (armedId && !ids.has(armedId)) disarm();

  listEl.innerHTML = "";
  if (!notes.length) {
    const div = document.createElement("div");
    div.className = "panel-empty";
    div.innerHTML = icon(MODES[mode].icon) + "<br>" + MODES[mode].empty;
    if (all.length && searchEl.value) div.innerHTML = "No notes match your search.";
    listEl.appendChild(div);
    lastIds = ids;
    return;
  }

  notes.forEach((note) => {
    listEl.appendChild(miniEl(note, !lastIds.has(note.id)));
  });
  lastIds = ids;
}

function miniEl(note, isNew) {
  const el = document.createElement("div");
  const hex = note.color.startsWith("#");
  el.className = "mini " + (hex ? "c-hex" : "c-" + note.color) + (isNew ? " pop-in" : "");
  el.dataset.id = note.id;

  const when = mode === "vac" ? note.doneAt || note.updatedAt : note.trashedAt || note.updatedAt;
  const snippet = textOf(note.html).slice(0, 160) || "Empty note";

  let badge = "";
  if (mode === "trash") {
    const d = daysLeft(note.purgeAt || when + store.TRASH_TTL);
    badge = `<span class="days-badge${d <= 3 ? " soon" : ""}">${d}d left</span>`;
  }

  const actions =
    mode === "vac"
      ? `<button class="chip-btn" data-act="pull">${icon("arrow-u-up-left-bold")}Pull out</button>
         <button class="chip-btn danger" data-act="totrash">${icon("trash-simple-bold")}Trash</button>`
      : `<button class="chip-btn" data-act="restore">${icon("arrow-clockwise-bold")}Restore</button>
         <button class="chip-btn danger" data-act="purge">${icon("trash-simple-bold")}Delete</button>`;

  el.innerHTML = `
    <div class="mini-strip"${hex ? ` style="background:${note.color}"` : ""}></div>
    <div class="mini-body">
      <div class="mini-title">${escapeText(firstLine(note.html))}</div>
      <div class="mini-snip">${escapeText(snippet)}</div>
    </div>
    <div class="mini-meta">
      <span>${timeAgo(when)}${badge ? " · " : ""}</span>
      <span class="mini-actions">${actions}</span>
    </div>`;

  // Put the badge right after the time text.
  if (badge) {
    const meta = el.querySelector(".mini-meta > span:first-child");
    meta.insertAdjacentHTML("beforeend", badge);
  }

  const ACT_HANDLERS = { pull: "onPullOut", totrash: "onToTrash", restore: "onRestore" };
  Object.entries(ACT_HANDLERS).forEach(([name, handler]) => {
    const btn = el.querySelector(`[data-act="${name}"]`);
    if (btn) btn.addEventListener("click", () => fire(handler, note.id, el));
  });

  const purgeBtn = el.querySelector('[data-act="purge"]');
  if (purgeBtn) {
    purgeBtn.addEventListener("click", () => {
      if (armedId === note.id) {
        disarm();
        purgeBtn.classList.remove("armed");
        purgeBtn.innerHTML = icon("trash-simple-bold") + "Delete";
        fire("onPurge", note.id, el);
      } else {
        disarm();
        armedId = note.id;
        purgeBtn.classList.add("armed");
        purgeBtn.textContent = "Sure?";
        armedTimer = setTimeout(() => {
          if (armedId === note.id) {
            disarm();
            purgeBtn.classList.remove("armed");
            purgeBtn.innerHTML = icon("trash-simple-bold") + "Delete";
          }
        }, 3000);
      }
    });
  }

  return el;
}

function fire(name, id, el) {
  if (handlers[name]) handlers[name](id, el);
}

// ---------- settings form ----------

function renderSettings() {
  const colorMode = settings.get("colorMode");
  const colorValue = settings.get("colorValue");
  const hex = settings.isHex(colorValue) ? colorValue.toLowerCase() : "#ffec99";
  const theme = settings.getTheme();
  const rail = document.documentElement.dataset.rail === "bottom" ? "bottom" : "left";

  const radio = (value, label) => `
    <label class="set-radio">
      <input type="radio" name="sticky-ncolor" value="${value}"${colorMode === value ? " checked" : ""}>
      <span>${label}</span>
    </label>`;

  listEl.innerHTML = `
    <div class="settings-form">
      <section class="set-group">
        <h3>New note color</h3>
        ${radio("yellow", "Stock yellow")}
        ${radio("random", "Random palette color")}
        ${radio("preset", "Palette color")}
        <div class="set-palette">${settings.PALETTE.map(
          (c) =>
            `<button type="button" class="set-swatch${colorMode === "preset" && colorValue === c ? " on" : ""}" data-preset="${c}" title="${c}" style="background:var(--note-${c})"></button>`
        ).join("")}</div>
        ${radio("custom", "Custom HEX")}
        <div class="set-custom">
          <input type="color" class="set-picker" value="${hex}" title="Pick a color">
          <input type="text" class="set-hex" value="${hex}" spellcheck="false" maxlength="7" aria-label="Custom hex color">
        </div>
      </section>

      <section class="set-group">
        <h3>App</h3>
        <div class="set-row">
          <span>Theme</span>
          <span class="seg">
            <button type="button" data-set-theme="light" aria-pressed="${theme === "light"}">Light</button>
            <button type="button" data-set-theme="dark" aria-pressed="${theme === "dark"}">Dark</button>
          </span>
        </div>
        <div class="set-row">
          <span>Rail position</span>
          <span class="seg">
            <button type="button" data-set-rail="left" aria-pressed="${rail === "left"}">Left</button>
            <button type="button" data-set-rail="bottom" aria-pressed="${rail === "bottom"}">Bottom</button>
          </span>
        </div>
        <div class="set-row">
          <span>Sound effects</span>
          <label class="switch"><input type="checkbox" class="set-sound"${sound.isEnabled() ? " checked" : ""} aria-label="Sound effects"><span class="knob"></span></label>
        </div>
        <div class="set-row">
          <span>Volume</span>
          <span class="vol-wrap">
            <input type="range" class="set-volume" min="0" max="100" step="5" value="${Math.round(sound.getVolume() * 100)}" aria-label="Volume">
            <output class="vol-val">${Math.round(sound.getVolume() * 100)}%</output>
          </span>
        </div>
        <div class="set-row">
          <span>Animations</span>
          <label class="switch"><input type="checkbox" class="set-motion"${settings.motionEnabled() ? " checked" : ""} aria-label="Animations"><span class="knob"></span></label>
        </div>
        <div class="set-row">
          <span>Paper grain</span>
          <label class="switch"><input type="checkbox" class="set-grain"${settings.grainEnabled() ? " checked" : ""} aria-label="Paper grain"><span class="knob"></span></label>
        </div>
        <p class="set-note">Everything is stored in this browser.</p>
      </section>

      <section class="set-group">
        <h3>Data</h3>
        <div class="set-row set-data-btns">
          <button type="button" class="btn" data-set-act="onExport">${icon("download-simple-bold")}Export notes</button>
          <button type="button" class="btn" data-set-act="onImport">${icon("upload-simple-bold")}Import</button>
        </div>
        <button type="button" class="btn danger" data-set-act="onEraseAll">Erase all notes</button>
      </section>
    </div>`;

  // -- color mode radios
  listEl.querySelectorAll('input[name="sticky-ncolor"]').forEach((r) => {
    r.addEventListener("change", () => {
      if (r.checked) settings.set("colorMode", r.value);
    });
  });

  // -- palette swatches (choosing one turns on preset mode)
  listEl.querySelectorAll("[data-preset]").forEach((b) => {
    b.addEventListener("click", () => {
      settings.set("colorValue", b.dataset.preset);
      settings.set("colorMode", "preset");
      listEl.querySelectorAll("[data-preset]").forEach((s) => s.classList.toggle("on", s === b));
      const presetRadio = listEl.querySelector('input[value="preset"]');
      if (presetRadio) presetRadio.checked = true;
    });
  });

  // -- custom hex: color picker + text field stay in step
  const picker = listEl.querySelector(".set-picker");
  const hexField = listEl.querySelector(".set-hex");
  const customRadio = listEl.querySelector('input[value="custom"]');

  const applyCustom = (v) => {
    if (!settings.isHex(v)) return false;
    v = v.toLowerCase();
    settings.set("colorValue", v);
    settings.set("colorMode", "custom");
    if (customRadio) customRadio.checked = true;
    if (picker.value !== v) picker.value = v;
    if (hexField.value !== v) hexField.value = v;
    return true;
  };

  picker.addEventListener("input", () => applyCustom(picker.value));
  hexField.addEventListener("input", () => {
    const ok = applyCustom(hexField.value.trim());
    hexField.classList.toggle("invalid", hexField.value.trim().length >= 3 && !ok);
  });
  hexField.addEventListener("blur", () => {
    hexField.classList.remove("invalid");
    hexField.value = settings.get("colorValue");
  });

  // -- theme
  listEl.querySelectorAll("[data-set-theme]").forEach((b) => {
    b.addEventListener("click", () => {
      settings.setTheme(b.dataset.setTheme);
      listEl.querySelectorAll("[data-set-theme]").forEach((s) =>
        s.setAttribute("aria-pressed", String(s === b))
      );
    });
  });

  // -- rail position (left / bottom)
  listEl.querySelectorAll("[data-set-rail]").forEach((b) => {
    b.addEventListener("click", () => {
      settings.set("railPos", b.dataset.setRail);
      listEl.querySelectorAll("[data-set-rail]").forEach((s) =>
        s.setAttribute("aria-pressed", String(s === b))
      );
    });
  });

  // -- sound, volume, motion & paper grain
  listEl.querySelector(".set-sound").addEventListener("change", (e) => {
    sound.setEnabled(e.target.checked);
    if (e.target.checked) sound.play("pop"); // hear it right away
  });
  const vol = listEl.querySelector(".set-volume");
  const volOut = listEl.querySelector(".vol-val");
  vol.addEventListener("input", () => {
    sound.setVolume(vol.value / 100);
    volOut.textContent = vol.value + "%";
  });
  listEl.querySelector(".set-motion").addEventListener("change", (e) => settings.set("motion", e.target.checked));
  listEl.querySelector(".set-grain").addEventListener("change", (e) => settings.set("grain", e.target.checked));

  // -- data: export / import / erase everything
  listEl.querySelectorAll("[data-set-act]").forEach((b) => {
    b.addEventListener("click", () => fire(b.dataset.setAct));
  });
}

function firstLine(html) {
  const t = textOf(html);
  return t.slice(0, 60) || "Untitled";
}

function escapeText(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
