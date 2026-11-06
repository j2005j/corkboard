// App orchestration: drop pill, rail tools, theme, panel actions, shortcuts, boot.

import * as store from "./store.js";
import * as board from "./board.js";
import * as panels from "./panels.js";
import * as editor from "./editor.js";
import * as anim from "./animations.js";
import * as sound from "./sound.js";
import * as settings from "./settings.js";
import { doExport, readImportFile } from "./export.js";
import { toast, confirmDialog } from "./ui.js";
import { hydrateIcons } from "./icons.js";

const pill = document.getElementById("fab-pill");
const vacBall = document.getElementById("vac-ball");
const trashBall = document.getElementById("trash-ball");
const vacCount = document.getElementById("vac-count");
const trashCount = document.getElementById("trash-count");
const railVac = document.getElementById("rail-vac");
const railTrash = document.getElementById("rail-trash");
const railVacCount = document.getElementById("rail-vac-count");
const railTrashCount = document.getElementById("rail-trash-count");
const importFile = document.getElementById("import-file");
const settingsBtn = document.getElementById("btn-settings");
const newBtn = document.getElementById("btn-new");

// Small fade-outs in the panel honor the motion preference too.
const motionOk = () =>
  settings.motionEnabled() && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const hit = (ball, x, y) => {
  const r = ball.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  return Math.hypot(x - cx, y - cy) <= r.width / 2 + 22;
};

function ballFor(kind) {
  return kind === "vac" ? vacBall : trashBall;
}

function clearHot() {
  vacBall.classList.remove("drop-hot");
  trashBall.classList.remove("drop-hot");
}

function updateCounts() {
  const d = store.byState("done").length;
  const t = store.byState("trash").length;
  vacCount.textContent = String(d);
  vacCount.hidden = d === 0;
  trashCount.textContent = String(t);
  trashCount.hidden = t === 0;
  railVacCount.textContent = String(d);
  railVacCount.hidden = d === 0;
  railTrashCount.textContent = String(t);
  railTrashCount.hidden = t === 0;
}

// ---------- drag & drop onto the pill ----------

function onDragMove(x, y) {
  pill.classList.add("show"); // slide the pill in as soon as a note is dragged
  clearHot();
  let kind = null;
  if (hit(vacBall, x, y)) {
    vacBall.classList.add("drop-hot");
    kind = "vac";
  } else if (hit(trashBall, x, y)) {
    trashBall.classList.add("drop-hot");
    kind = "trash";
  }
  return kind;
}

function onDragEnd(target) {
  clearHot();
  // A drop keeps the pill up until the note has flown into the ball.
  if (!target) pill.classList.remove("show");
}

async function onDrop(kind, id) {
  try {
    if (kind === "vac") await doVacuum(id, vacBall);
    else if (kind === "trash") await doTrash(id, trashBall);
  } finally {
    pill.classList.remove("show");
  }
}

// ---------- note actions ----------

// A note swept from its own ✔ button flies into the rail's dust-bag button;
// only a drag-and-drop lands in the pill's balls (visible only mid-drag).
async function doVacuum(id, ballEl = railVac) {
  const note = store.get(id);
  const el = board.getEl(id);
  if (!note || !el || note.state !== "open") return;
  if (editor.isEditing(id)) editor.close();
  sound.play("suck");
  const fly = anim.suckAway(el, ballEl);
  await fly;
  store.setState(id, "done");
  toast("Swept into the dust bag");
}

async function doTrash(id, ballEl = railTrash) {
  const note = store.get(id);
  const el = board.getEl(id);
  if (!note || !el || note.state !== "open") return;
  if (editor.isEditing(id)) editor.close();
  sound.play("crumple");
  const fly = anim.crumpleAway(el, ballEl);
  await fly;
  store.setState(id, "trash");
  toast("Moved to trash - kept for 30 days");
}

async function doPullOut(id, miniEl) {
  const note = store.get(id);
  if (!note || note.state !== "done") return;
  const target = bestSpot(note);
  store.setState(id, "open");
  store.update(id, { x: target.x, y: target.y }, { touch: false });
  const el = board.getEl(id);
  if (el) await anim.inflateFrom(el, railVac, { uncrumple: false });
  sound.play("restore");
  if (miniEl) miniEl.remove();
  if (!store.byState("done").length) panels.close();
}

async function doToTrash(id, miniEl) {
  const note = store.get(id);
  if (!note || note.state !== "done") return;
  sound.play("crumple");
  if (miniEl) {
    if (!motionOk()) miniEl.remove();
    else
      miniEl.animate(
        [
          { transform: "none", opacity: 1 },
          { transform: "scale(0.8) rotate(4deg)", opacity: 0 },
        ],
        { duration: 240, easing: "ease-in", fill: "forwards" }
      ).finished
        .then(() => miniEl.remove())
        .catch(() => miniEl.remove());
  }
  store.setState(id, "trash");
  updateCounts();
  if (!store.byState("done").length) panels.close();
}

async function doRestore(id, miniEl) {
  const note = store.get(id);
  if (!note || note.state !== "trash") return;
  const target = bestSpot(note);
  if (miniEl) {
    if (!motionOk()) miniEl.remove();
    else
      miniEl.animate(
        [
          { transform: "none", opacity: 1 },
          { transform: "scale(0.85)", opacity: 0 },
        ],
        { duration: 220, easing: "ease-in", fill: "forwards" }
      ).finished
        .then(() => miniEl.remove())
        .catch(() => miniEl.remove());
  }
  store.setState(id, "open");
  store.update(id, { x: target.x, y: target.y }, { touch: false });
  const el = board.getEl(id);
  if (el) await anim.inflateFrom(el, railTrash, { uncrumple: true });
  sound.play("restore");
  toast("Restored to the board");
  if (!store.byState("trash").length) panels.close();
}

async function doPurge(id, miniEl) {
  const note = store.get(id);
  if (!note || note.state !== "trash") return;
  if (miniEl) {
    if (!motionOk()) miniEl.remove();
    else
      miniEl.animate([{ opacity: 1 }, { opacity: 0, transform: "scale(0.9)" }], {
        duration: 180,
        fill: "forwards",
      })
        .finished.then(() => miniEl.remove())
        .catch(() => miniEl.remove());
  }
  store.destroy(id);
  toast("Deleted forever");
  if (!store.byState("trash").length) panels.close();
}

function bestSpot(note) {
  // Keep the note where it was if that area is free, else find a free spot.
  const area = board.areaEl;
  const w = 250;
  const h = 160;
  const maxX = Math.max(8, area.clientWidth - w - 16);
  const maxY = Math.max(8, area.clientHeight - h - 16);
  const taken = (x, y) =>
    store
      .byState("open")
      .some((n) => n.id !== note.id && Math.abs(n.x - x) < w * 0.7 && Math.abs(n.y - y) < h * 0.7);

  let x = Math.min(Math.max(8, note.x), maxX);
  let y = Math.min(Math.max(8, note.y), maxY);
  if (!taken(x, y)) return { x, y };
  for (let i = 0; i < 40; i++) {
    x = 8 + Math.random() * Math.max(1, maxX - 8);
    y = 8 + Math.random() * Math.max(1, maxY - 8);
    if (!taken(x, y)) return { x: Math.round(x), y: Math.round(y) };
  }
  return { x: Math.round(x), y: Math.round(y) };
}

// ---------- new note ----------

// A fresh note lands somewhere random in the visible board - scatter tries a
// few candidates so it doesn't pile straight onto an existing note (but the
// request is "random", so a full board still gets one).
function newNote() {
  const area = board.areaEl;
  const w = 250;
  const h = 150;
  const spanX = Math.max(1, area.clientWidth - w - 24);
  const spanY = Math.max(1, area.clientHeight - h - 24);
  const place = () => ({
    x: Math.round(area.scrollLeft + 8 + Math.random() * spanX),
    y: Math.round(area.scrollTop + 8 + Math.random() * spanY),
  });
  const covers = (p) =>
    store
      .byState("open")
      .some((n) => Math.abs(n.x - p.x) < w * 0.75 && Math.abs(n.y - p.y) < h * 0.75);

  let pos = place();
  for (let i = 0; i < 25 && covers(pos); i++) pos = place();

  const note = store.create(pos);
  sound.play("pop");
  board.openEdit(note.id);
  anim.zoomFromButton(newBtn, board.getEl(note.id)); // zoom out of the + button
  return note;
}

// ---------- export / import ----------

async function onExport() {
  doExport();
  toast("Exported your notes as JSON");
}

async function onImport() {
  importFile.value = "";
  importFile.click();
}

async function onImportFile(file) {
  if (!file) return;
  try {
    const data = await readImportFile(file);
    const count = (Array.isArray(data) ? data : data && data.notes || []).length;
    if (!count) throw new Error("That file doesn't contain notes.");
    const ok = await confirmDialog(
      `Replace everything with ${count} note${count === 1 ? "" : "s"} from this file? Your current notes will be lost.`,
      "Import"
    );
    if (!ok) return;
    const n = await store.importData(data);
    panels.close();
    toast(`Imported ${n} note${n === 1 ? "" : "s"}`);
  } catch (err) {
    toast(err.message || "Import failed");
  }
}

// ---------- erase (both ask first, both are permanent) ----------

async function onEraseTrash() {
  const list = store.byState("trash");
  if (!list.length) return;
  const ok = await confirmDialog(
    `Permanently erase ${list.length} note${list.length === 1 ? "" : "s"} from the trash? This cannot be undone.`,
    "Erase"
  );
  if (!ok) return;
  sound.play("erase"); // the recycle2 chime, synced with the snap
  // Every card blurs into dust (staggered), THEN the notes are really gone -
  // so the animation is the erase, not a curtain in front of it.
  const minis = [...document.querySelectorAll("#panel-list .mini")];
  await Promise.all(minis.map((el, i) => anim.dustAway(el, i * 70)));
  list.forEach((n) => store.destroy(n.id));
  toast("Trash erased");
}

async function onEraseAll() {
  const list = store.all();
  if (!list.length) return;
  const ok = await confirmDialog(
    `Erase ALL ${list.length} notes - the board, the dust bag and the trash? This cannot be undone.`,
    "Erase all"
  );
  if (!ok) return;
  list.forEach((n) => store.destroy(n.id));
  toast("All notes erased");
}

// ---------- welcome note ----------

function maybeWelcome() {
  let seen = false;
  try {
    seen = localStorage.getItem("sticky-welcome") === "1";
  } catch {
    /* ignore */
  }
  if (seen || store.all().length) return;
  try {
    localStorage.setItem("sticky-welcome", "1");
  } catch {
    /* ignore */
  }
  const note = store.create({
    x: 70,
    y: 60,
    color: "purple",
    html:
      "<h2>Welcome 👋</h2>" +
      "<p>These are your sticky notes. A few things to try:</p>" +
      "<ul>" +
      "<li><b>Double-click</b> the board (or press <kbd>N</kbd>) to write a new note</li>" +
      "<li><b>Drag</b> a note by its top bar - a pill slides down from the top to sweep or trash it</li>" +
      "<li>Grab the <b>bottom-right corner</b> to resize a note</li>" +
      "<li>Click a note's body to edit - Rich, <b>Markdown</b> or raw <b>HTML</b></li>" +
      "<li>Left-click the <b>nine-dot grip</b> for duplicate, color, pin &amp; rotate - right-click it to straighten</li>" +
      "<li>The wooden rail keeps the essentials; the <b>⚙ gear</b> opens settings (theme, sound, backup, erase)</li>" +
      "<li>Everything is stored <b>in your browser</b>. Export JSON to back it up</li>" +
      "</ul>",
  });
  store.update(note.id, { z: store.nextZ() }, { touch: false });
}

// ---------- keyboard ----------

function onKey(e) {
  const inField =
    e.target.matches && e.target.matches("input, textarea, select, [contenteditable='true']");

  if (e.key === "Escape") {
    if (editor.anyEditing()) {
      editor.close();
      return;
    }
    if (panels.isOpen()) {
      panels.close();
      return;
    }
    return;
  }

  if (inField || editor.anyEditing()) return;

  if (e.key === "n" || e.key === "N") {
    e.preventDefault();
    newNote();
  } else if (e.key === "/") {
    e.preventDefault();
    if (panels.isOpen()) document.getElementById("panel-search").focus();
    else panels.open("vac");
  }
}

// ---------- boot ----------

async function boot() {
  hydrateIcons(document);

  settings.applyMotion(); // honors the motion preference from the settings panel
  settings.applyGrain(); // paper grain on the notes (on by default)

  newBtn.addEventListener("click", newNote);
  importFile.addEventListener("change", () => onImportFile(importFile.files[0]));

  settingsBtn.addEventListener("click", () => panels.toggle("settings"));

  railVac.addEventListener("click", () => panels.toggle("vac"));
  railTrash.addEventListener("click", () => panels.toggle("trash"));

  vacBall.addEventListener("click", () => panels.toggle("vac"));
  trashBall.addEventListener("click", () => panels.toggle("trash"));

  panels.init(
    {
      onPullOut: doPullOut,
      onToTrash: doToTrash,
      onRestore: doRestore,
      onPurge: doPurge,
      onExport,
      onImport,
      onEraseTrash,
      onEraseAll,
    },
    () => {
      const mode = panels.currentMode();
      vacBall.setAttribute("aria-pressed", String(mode === "vac"));
      trashBall.setAttribute("aria-pressed", String(mode === "trash"));
      railVac.setAttribute("aria-pressed", String(mode === "vac"));
      railTrash.setAttribute("aria-pressed", String(mode === "trash"));
      settingsBtn.setAttribute("aria-pressed", String(mode === "settings"));
    }
  );

  const purged = await store.init();

  board.init({
    onDragMove,
    onDragEnd,
    onDrop,
    onNoteVacuum: doVacuum,
    onNoteTrash: doTrash,
  });

  store.subscribe(updateCounts);
  updateCounts();

  maybeWelcome();

  if (purged) toast(`${purged} old note${purged === 1 ? "" : "s"} permanently deleted`);

  document.addEventListener("keydown", onKey);

  // Purge expired trash periodically and when the tab comes back.
  setInterval(async () => {
    const n = await store.purgeExpired();
    if (n) toast(`${n} expired note${n === 1 ? "" : "s"} permanently deleted`);
  }, 60 * 60 * 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") store.purgeExpired();
  });
}

boot().catch((err) => {
  console.error("Boot failed:", err);
  toast("Something went wrong while starting up");
});
