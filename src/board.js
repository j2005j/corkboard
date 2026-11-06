// The board: note DOM lifecycle, positioning, drag & edit entry.

import * as store from "./store.js";
import * as editor from "./editor.js";
import * as menu from "./menu.js";
import * as images from "./images.js";
import { icon } from "./icons.js";

const area = document.getElementById("board-area");
const board = document.getElementById("board");
const emptyState = document.getElementById("empty-state");

const COLORS = store.COLORS;
const els = new Map();
let editingId = null;
let handlers = {};
let lastOrder = "";
let drag = null;

// Pointer capture retargets the click after a bar/resize press to the note
// element itself, so closest() can't tell where the press started - remember it.
let suppressClickEl = null;
let suppressTimer = 0;
function armClickSuppression(el) {
  suppressClickEl = el;
  clearTimeout(suppressTimer);
  suppressTimer = setTimeout(() => {
    suppressClickEl = null;
  }, 1000);
}

const isMobile = () => window.matchMedia("(max-width: 700px)").matches;

export const areaEl = area;

export function init(h) {
  handlers = h || {};
  store.subscribe(render);
  board.addEventListener("dblclick", onDblClick);
  board.addEventListener("keydown", onKeyDown);
  new ResizeObserver(() => updateSize()).observe(area);
  // The menu's structural actions (duplicate, rotate) already repaint through
  // the store subscription; this only gives the fresh copy some focus.
  menu.setHandler((id, action) => {
    if (action === "duplicated") {
      const el = els.get(id);
      if (el) el.focus({ preventScroll: false });
    }
  });
  render();
}

export function getEl(id) {
  return els.get(id);
}

export function openEdit(id) {
  if (editingId === id) return;
  closeEdit();
  const el = els.get(id);
  const note = store.get(id);
  if (!el || !note || note.state !== "open") return;
  editingId = id;
  store.update(note.id, { z: store.nextZ() }, { touch: false });
  editor.mount(el, note, () => {
    editingId = null;
  });
}

export function closeEdit() {
  if (editingId) editor.close();
}

function setViewContent(el, html) {
  const view = el.querySelector(".note-view");
  if (!view) return;
  view.innerHTML = html || "";
  view.classList.toggle("note-empty", !html);
  view.querySelectorAll("a[href]").forEach((a) => {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  });
  images.resolve(view); // pasted images: reference -> local blob
  el.dataset.html = html || "";
}

// The note's default tilt - every note lands slightly askew (±5°), unique per
// id so the board looks hand-placed. 0° is never the default (right-click
// straightens explicitly), so a fresh id can't come out perfectly straight.
function tiltFor(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const t = (h % 1001) / 100 - 5;
  return t === 0 ? 0.4 : t;
}

function createNoteEl(note) {
  const el = document.createElement("article");
  el.className = "note c-" + note.color;
  el.dataset.id = note.id;
  el.tabIndex = 0;
  el.innerHTML = `
    <div class="note-chrome">
      <span class="note-btn grip" title="Rotate - drag to tilt, left-click for the menu, right-click to straighten (Shift = 15° steps)" aria-hidden="true">${icon("dots-nine-bold")}</span>
      <div class="note-actions">
        <span class="note-btn pin-flag" title="Pinned to the top">${icon("pin-bold")}</span>
        <button class="note-btn done" title="Sweep into the dust bag">${icon("check-bold")}</button>
        <button class="note-btn del" title="Move to trash">${icon("trash-simple-bold")}</button>
      </div>
    </div>
    <div class="note-view"></div>
    <div class="note-resize" title="Resize"></div>`;

  // The whole top bar drags the note - except the action buttons and the grip.
  el.querySelector(".note-chrome").addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest(".note-actions, .grip")) return;
    startDrag(e, el, { openOnTap: false });
  });
  // The nine-dot grip: left-drag rotates, left-click opens the action menu,
  // right-click straightens the note back to 0°.
  const gripEl = el.querySelector(".grip");
  gripEl.addEventListener("pointerdown", (e) => startRotate(e, el));
  gripEl.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    store.update(el.dataset.id, { rot: 0 }, { touch: false });
  });
  el.querySelector(".note-resize").addEventListener("pointerdown", (e) => startResize(e, el));
  el.querySelector(".done").addEventListener("click", (e) => {
    e.stopPropagation();
    if (handlers.onNoteVacuum) handlers.onNoteVacuum(note.id);
  });
  el.querySelector(".del").addEventListener("click", (e) => {
    e.stopPropagation();
    if (handlers.onNoteTrash) handlers.onNoteTrash(note.id);
  });

  el.addEventListener("click", (e) => {
    // The click after a drag-bar or resize press never opens the editor.
    if (suppressClickEl === el) {
      suppressClickEl = null;
      clearTimeout(suppressTimer);
      return;
    }
    // Clicking the drag bar or its buttons never opens the editor - only the body does.
    if (e.target.closest("button, a, .note-chrome, .note-resize")) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && el.contains(sel.anchorNode)) return;
    openEdit(el.dataset.id);
  });

  return el;
}

function startDrag(e, el, { openOnTap = true } = {}) {
  if (e.button !== 0) return;
  if (isMobile()) {
    startStackDrag(e, el); // portrait: the bar reorders the stack instead
    return;
  }
  const id = el.dataset.id;
  const note = store.get(id);
  if (!note || note.state !== "open") return;
  e.preventDefault();
  try {
    el.setPointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }

  drag = { id, el, pid: e.pointerId, sx: e.clientX, sy: e.clientY, ox: note.x, oy: note.y, x: note.x, y: note.y, moved: false, hot: null };

  const move = (ev) => {
    if (!drag || ev.pointerId !== drag.pid) return;
    const dx = ev.clientX - drag.sx;
    const dy = ev.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) > 4) {
      drag.moved = true;
      drag.el.classList.add("dragging");
    }
    if (!drag.moved) return;
    drag.x = Math.max(4, drag.ox + dx);
    drag.y = Math.max(4, drag.oy + dy);
    drag.el.style.left = drag.x + "px";
    drag.el.style.top = drag.y + "px";
    if (handlers.onDragMove) drag.hot = handlers.onDragMove(ev.clientX, ev.clientY);
  };

  const onUp = (ev) => finish(ev, false);
  const onCancel = (ev) => finish(ev, true);

  const finish = (ev, cancelled) => {
    if (!drag || ev.pointerId !== drag.pid) return;
    const d = drag;
    drag = null;
    d.el.classList.remove("dragging");
    try {
      d.el.releasePointerCapture(d.pid);
    } catch {
      /* ignore */
    }
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);

    if (!d.moved) {
      if (openOnTap) openEdit(d.id);
      else armClickSuppression(d.el);
      return;
    }
    if (!cancelled) armClickSuppression(d.el);
    store.update(d.id, { x: d.x, y: d.y }, { touch: false });
    const target = cancelled ? null : handlers.onDragMove ? handlers.onDragMove(ev.clientX, ev.clientY) : null;
    if (handlers.onDragEnd) handlers.onDragEnd(target);
    if (target && handlers.onDrop) handlers.onDrop(target, d.id);
    else updateSize();
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onCancel);
}

const MIN_W = 160;
const MIN_H = 110;
// How far the note turns per degree of mouse sweep around the pivot - well
// under 1 so the grip feels deliberate instead of whipping around.
const ROTATE_SENS = 0.5;

// Portrait phones: notes are a static stack, so the bar drag lifts a card and
// drops it into a new position in that stack (z is rewritten in one pass).
function startStackDrag(e, el) {
  const id = el.dataset.id;
  const note = store.get(id);
  if (!note || note.state !== "open") return;
  e.preventDefault();
  try {
    el.setPointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }

  const pid = e.pointerId;
  const sx = e.clientX;
  const sy = e.clientY;
  let moved = false;

  const move = (ev) => {
    if (ev.pointerId !== pid) return;
    const dy = ev.clientY - sy;
    if (!moved && Math.hypot(ev.clientX - sx, dy) < 8) return;
    if (!moved) {
      moved = true;
      el.classList.add("dragging");
    }
    el.style.transform = `translateY(${dy}px)`;
  };

  const onUp = (ev) => finish(ev, false);
  const onCancel = (ev) => finish(ev, true);

  function finish(ev, cancelled) {
    if (ev.pointerId !== pid) return;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    try {
      el.releasePointerCapture(pid);
    } catch {
      /* ignore */
    }
    armClickSuppression(el); // a bar press never opens the editor
    if (!moved) return;
    el.classList.remove("dragging");
    el.style.transform = "";
    if (cancelled) return;

    // Where does the card land? Compare the drop line against sibling midpoints.
    const dropY = ev.clientY;
    const siblings = [...board.querySelectorAll(".note")].filter((n) => n !== el);
    const before = siblings.find((n) => {
      const r = n.getBoundingClientRect();
      return dropY < r.top + r.height / 2;
    });
    board.insertBefore(el, before || null);
    const ids = [...board.querySelectorAll(".note")]
      .map((n) => n.dataset.id)
      .filter((nid) => {
        const n = store.get(nid);
        return n && n.state === "open";
      });
    store.reorder(ids); // one emit, so render sees the final order
  }

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onCancel);
}

// Rotation via the nine-dot grip: hold the button and swing the mouse to tilt
// the note around that corner, Shift snaps to 15° steps. A press that never
// leaves the pivot is a plain click - it opens the grip's action menu (a
// right-click on the grip is what straightens the note back to 0°).
function startRotate(e, el) {
  if (e.button !== 0) return;
  const id = el.dataset.id;
  const note = store.get(id);
  if (!note || note.state !== "open") return;
  const grip = el.querySelector(".grip");
  if (!grip) return;
  e.preventDefault();
  e.stopPropagation(); // the bar's drag must not start too

  // Portrait phones: rotation is off (the stack is static), but a tap on the
  // grip still opens its menu.
  if (isMobile()) {
    const pid = e.pointerId;
    const sx = e.clientX;
    const sy = e.clientY;
    try {
      el.setPointerCapture(pid);
    } catch {
      /* ignore */
    }
    const up = (ev) => {
      if (ev.pointerId !== pid) return;
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      try {
        el.releasePointerCapture(pid);
      } catch {
        /* ignore */
      }
      armClickSuppression(el); // the tap never opens the editor
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 10) {
        const base = note.rot != null ? store.normRot(note.rot) : tiltFor(id);
        menu.open(id, grip.getBoundingClientRect(), base);
      }
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return;
  }

  try {
    el.setPointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }

  // The pivot is the grip itself - also the rotation origin, so it stays put.
  const gr = grip.getBoundingClientRect();
  const start = {
    pid: e.pointerId,
    px: gr.left + gr.width / 2,
    py: gr.top + gr.height / 2,
    base: note.rot != null ? store.normRot(note.rot) : tiltFor(id),
    ang: null, // angle at which the cursor first clears the pivot's dead zone
    next: null,
    moved: false,
    done: false,
  };

  const move = (ev) => {
    if (start.done || ev.pointerId !== start.pid) return;
    const dx = ev.clientX - start.px;
    const dy = ev.clientY - start.py;
    const r = Math.hypot(dx, dy);
    if (r < 12) return; // the press starts on the pivot - no stable angle yet
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (start.ang === null) {
      start.ang = ang;
      start.moved = true;
      return;
    }
    // Wrap the swept angle into (-180, 180] so crossing the ±180° seam
    // continues smoothly instead of yanking the note a full turn, then
    // scale it down so turning feels slow and controlled.
    const raw = ang - start.ang;
    const sweep = (((raw % 360) + 540) % 360) - 180;
    let next = start.base + sweep * ROTATE_SENS;
    if (ev.shiftKey) next = Math.round(next / 15) * 15;
    start.next = next;
    el._tilt = next; // keep applyMeta's cache in step with the live style
    el.style.setProperty("--tilt", next + "deg");
  };

  const onUp = (ev) => finish(ev);
  const onCancel = (ev) => finish(ev);

  const finish = (ev) => {
    if (start.done || ev.pointerId !== start.pid) return;
    start.done = true;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    try {
      el.releasePointerCapture(start.pid);
    } catch {
      /* ignore */
    }
    armClickSuppression(el); // the click after a grip press never opens the editor
    if (!start.moved) {
      // Plain left-click: open the grip's menu (duplicate, color, pin, ...).
      menu.open(id, grip.getBoundingClientRect(), start.base);
      return;
    }
    if (start.next != null) store.update(id, { rot: store.normRot(start.next) }, { touch: false });
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onCancel);
}

function startResize(e, el) {
  if (isMobile() || e.button !== 0) return;
  const id = el.dataset.id;
  const note = store.get(id);
  if (!note || note.state !== "open") return;
  e.preventDefault();
  e.stopPropagation();
  try {
    el.setPointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }

  const start = {
    pid: e.pointerId,
    sx: e.clientX,
    sy: e.clientY,
    w: el.offsetWidth,
    h: el.offsetHeight,
    moved: false,
    prevMin: el.style.minHeight,
  };
  el.style.minHeight = "0"; // allow shrinking below the default note min-height right away

  const move = (ev) => {
    if (ev.pointerId !== start.pid) return;
    start.moved = true;
    const w = Math.max(MIN_W, start.w + ev.clientX - start.sx);
    const h = Math.max(MIN_H, start.h + ev.clientY - start.sy);
    el.style.width = Math.round(w) + "px";
    el.style.height = Math.round(h) + "px";
    updateSize();
  };

  const onUp = (ev) => {
    if (ev.pointerId !== start.pid) return;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    try {
      el.releasePointerCapture(start.pid);
    } catch {
      /* ignore */
    }
    armClickSuppression(el); // the click after a resize press must not open the editor
    if (!start.moved) {
      el.style.minHeight = start.prevMin; // a plain grab must not shrink the note
      return;
    }
    store.update(id, { w: el.offsetWidth, h: el.offsetHeight }, { touch: false });
    updateSize();
  };
  const onCancel = (ev) => onUp(ev);

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onCancel);
}

function onDblClick(e) {
  if (e.target !== board) return;
  const rect = board.getBoundingClientRect();
  const x = Math.max(8, e.clientX - rect.left - 125);
  const y = Math.max(8, e.clientY - rect.top - 20);
  const note = store.create({ x, y });
  openEdit(note.id);
}

function onKeyDown(e) {
  if (editingId || e.key !== "Enter") return;
  const noteEl = e.target.closest && e.target.closest(".note");
  if (!noteEl || e.target !== noteEl) return;
  e.preventDefault();
  openEdit(noteEl.dataset.id);
}

// Rotation: a note with a stored rot keeps it (origin at the grip corner, so
// rotating swings the note around the corner you grabbed); otherwise the
// note keeps its per-id default tilt around the center. Displayed angles are
// normalized, so even a legacy 720°-stored note renders sanely.
function applyTilt(el, note) {
  const custom = note.rot != null;
  const t = custom ? store.normRot(note.rot) : tiltFor(note.id);
  if (el._tilt === t && el._customRot === custom) return;
  el.style.setProperty("--tilt", t + "deg");
  if (custom) {
    if (!el._origin) {
      const g = el.querySelector(".grip");
      el._origin = g ? g.offsetLeft + g.offsetWidth / 2 + "px " + (g.offsetTop + g.offsetHeight / 2) + "px" : "";
    }
    el.style.transformOrigin = el._origin;
  } else {
    el.style.transformOrigin = "";
  }
  el._tilt = t;
  el._customRot = custom;
}

// Display z-index: pinned notes float above the whole board (a dedicated
// band), everything else keeps its store z. The overlay bands (dragged note,
// pill, toast, ...) all sit above 40000 in app.css.
function zIndexOf(note) {
  return note.pinned ? 40000 + note.z : note.z;
}

function applyMeta(el, note) {
  if (el._x !== note.x) {
    el.style.left = note.x + "px";
    el._x = note.x;
  }
  if (el._y !== note.y) {
    el.style.top = note.y + "px";
    el._y = note.y;
  }
  const z = zIndexOf(note);
  if (el._z !== z) {
    el.style.zIndex = String(z);
    el._z = z;
  }
  if (el._color !== note.color) {
    if (note.color.startsWith("#")) {
      // Custom hex: paint the paper directly and pick readable text.
      COLORS.forEach((c) => el.classList.remove("c-" + c));
      el.classList.add("c-hex");
      el.style.backgroundColor = note.color;
      const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(note.color);
      if (m) {
        const [r, g, b] = [1, 2, 3].map((i) => parseInt(m[i], 16));
        const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        el.style.setProperty("--note-text", lum < 0.55 ? "#f2f3f5" : "#2e3138");
      }
    } else {
      COLORS.forEach((c) => el.classList.remove("c-" + c));
      el.classList.remove("c-hex");
      el.style.backgroundColor = "";
      el.style.removeProperty("--note-text");
      el.classList.add("c-" + note.color);
    }
    el._color = note.color;
  }
  if (el._pinned !== note.pinned) {
    el.classList.toggle("pinned", !!note.pinned);
    el._pinned = !!note.pinned;
  }
  applyTilt(el, note);
  const w = note.w || null;
  if (el._w !== w) {
    el.style.width = w ? w + "px" : "";
    el._w = w;
  }
  const h = note.h || null;
  if (el._h !== h) {
    el.style.height = h ? h + "px" : "";
    el.style.minHeight = h ? "0" : ""; // let a resized note go below the default min-height
    el._h = h;
  }
}

function render() {
  const open = store.byState("open");

  for (const [id, el] of [...els]) {
    if (!open.some((n) => n.id === id)) {
      el.remove();
      els.delete(id);
      if (editingId === id) editingId = null;
    }
  }

  open.forEach((note) => {
    let el = els.get(note.id);
    if (!el) {
      el = createNoteEl(note);
      els.set(note.id, el);
      board.appendChild(el);
      applyMeta(el, note);
      setViewContent(el, note.html);
      return;
    }
    applyMeta(el, note);
    if (editingId !== note.id && el.dataset.html !== (note.html || "")) {
      setViewContent(el, note.html);
    }
  });

  const order = open
    .slice()
    .sort((a, b) => a.z - b.z)
    .map((n) => n.id)
    .join(",");
  if (order !== lastOrder) {
    lastOrder = order;
    open
      .slice()
      .sort((a, b) => a.z - b.z)
      .forEach((n) => {
        const el = els.get(n.id);
        if (el) board.appendChild(el);
      });
  }

  emptyState.hidden = open.length > 0;
  updateSize();
}

function updateSize() {
  if (isMobile()) {
    board.style.width = "";
    board.style.height = "";
    return;
  }
  let w = area.clientWidth;
  let h = area.clientHeight;
  for (const note of store.byState("open")) {
    const el = els.get(note.id);
    if (!el) continue;
    w = Math.max(w, note.x + el.offsetWidth + 90);
    h = Math.max(h, note.y + el.offsetHeight + 90);
  }
  board.style.width = w + "px";
  board.style.height = h + "px";
}
