// The nine-dot grip's left-click menu: duplicate, recolor, pin, rotate, copy.

import * as store from "./store.js";
import { COLORS } from "./store.js";
import { normRot } from "./store.js";
import { htmlToMd, textOf } from "./markdown.js";
import { icon } from "./icons.js";
import { toast } from "./ui.js";

let el = null;
let onAction = null; // board callback: (id, action) => void, for rotate/z changes

export function isOpen() {
  return !!el;
}

export function setHandler(fn) {
  onAction = fn;
}

export function close() {
  if (!el) return;
  el.remove();
  el = null;
  window.removeEventListener("pointerdown", onDocDown, true);
  window.removeEventListener("keydown", onDocKey, true);
  window.removeEventListener("blur", close);
}

function onDocDown(e) {
  if (el && !el.contains(e.target)) close();
}

function onDocKey(e) {
  if (e.key === "Escape") {
    e.stopPropagation();
    close();
  }
}

// anchor: the grip's viewport rect. baseTilt: the note's current angle.
export function open(id, anchor, baseTilt) {
  close();
  const note = store.get(id);
  if (!note) return;

  el = document.createElement("div");
  el.className = "grip-menu";
  el.setAttribute("role", "menu");
  el.dataset.id = id;

  const swatches = COLORS.map(
    (c) =>
      `<button type="button" class="swatch${note.color === c ? " on" : ""}" data-color="${c}" title="${c}" style="background:var(--note-${c})"></button>`
  ).join("");
  const customOn = note.color.startsWith("#") ? " on" : "";

  // Phones: a static stack has no z-order to pin to and no rotation, so the
  // pin row and the angle buttons only exist on the desktop menu.
  const narrow = window.matchMedia("(max-width: 700px)").matches;
  const pinRow = `
    <button type="button" role="menuitem" data-act="pin">${icon("pin-bold")}<span>${note.pinned ? "Unpin" : "Pin to top"}</span></button>`;
  const rotateBlock = `
    <div class="gm-sep"></div>
    <div class="gm-rotate">
      <button type="button" role="menuitem" data-act="rot-dec" title="Rotate -15°">&minus;15°</button>
      <button type="button" role="menuitem" data-act="rot-zero" title="Straighten">0°</button>
      <button type="button" role="menuitem" data-act="rot-inc" title="Rotate +15°">+15°</button>
    </div>`;

  el.innerHTML = `
    <button type="button" role="menuitem" data-act="duplicate">${icon("copy-bold")}<span>Duplicate</span></button>
    ${narrow ? "" : pinRow}
    <div class="gm-sep"></div>
    <div class="gm-colors" title="Change color">
      ${swatches}
      <label class="swatch custom${customOn}" title="Custom color">
        <input type="color" value="${note.color.startsWith("#") ? note.color : "#ffec99"}">
        <span class="gm-rainbow"></span>
      </label>
    </div>
    ${narrow ? "" : rotateBlock}
    <div class="gm-sep"></div>
    <button type="button" role="menuitem" data-act="copy-md">${icon("markdown-logo-bold")}<span>Copy as Markdown</span></button>
    <button type="button" role="menuitem" data-act="copy-html">${icon("code-bold")}<span>Copy as HTML</span></button>
    <button type="button" role="menuitem" data-act="copy-text">${icon("clipboard-bold")}<span>Copy as plain text</span></button>`;

  document.body.appendChild(el);

  // Position below the grip, clamped inside the viewport.
  const mw = el.offsetWidth;
  const mh = el.offsetHeight;
  let x = anchor.left;
  let y = anchor.bottom + 6;
  if (x + mw > window.innerWidth - 8) x = window.innerWidth - mw - 8;
  if (y + mh > window.innerHeight - 8) y = Math.max(8, anchor.top - mh - 6);
  el.style.left = Math.max(8, x) + "px";
  el.style.top = y + "px";

  el.addEventListener("click", (e) => {
    const sw = e.target.closest(".swatch[data-color]");
    if (sw) {
      store.update(id, { color: sw.dataset.color });
      el.querySelectorAll(".swatch").forEach((s) => s.classList.remove("on"));
      sw.classList.add("on");
      return; // stay open so colors can be tried
    }
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    act(btn.dataset.act, id, baseTilt);
    if (btn.dataset.act.startsWith("copy")) close();
    else if (btn.dataset.act !== "duplicate") close();
  });

  // Live custom color picking.
  const custom = el.querySelector('input[type="color"]');
  custom.addEventListener("input", () => {
    store.update(id, { color: custom.value.toLowerCase() }, { touch: false });
    el.querySelectorAll(".swatch").forEach((s) => s.classList.remove("on"));
    custom.closest(".swatch").classList.add("on");
  });

  window.addEventListener("pointerdown", onDocDown, true);
  window.addEventListener("keydown", onDocKey, true);
  window.addEventListener("blur", close);
}

function act(name, id, baseTilt) {
  const note = store.get(id);
  if (!note) return;

  if (name === "duplicate") {
    const copy = store.create({
      x: note.x + 26,
      y: note.y + 26,
      html: note.html,
      color: note.color,
      md: note.md,
      mode: note.mode,
      w: note.w,
      h: note.h,
      rot: note.rot,
      pinned: note.pinned,
    });
    toast("Note duplicated");
    if (onAction) onAction(copy.id, "duplicated");
    return;
  }

  if (name === "pin") {
    store.update(id, { pinned: !note.pinned });
    toast(note.pinned ? "Unpinned" : "Pinned to the top");
    return;
  }

  if (name === "rot-dec" || name === "rot-inc" || name === "rot-zero") {
    const next =
      name === "rot-zero"
        ? 0
        : normRot(Math.round((normRot(baseTilt) + (name === "rot-inc" ? 15 : -15)) / 15) * 15);
    store.update(id, { rot: next }, { touch: false });
    if (onAction) onAction(id, "rotate");
    return;
  }

  if (name === "copy-md" || name === "copy-html" || name === "copy-text") {
    const text =
      name === "copy-html" ? note.html || "" : name === "copy-md" ? htmlToMd(note.html || "") : textOf(note.html || "");
    copyText(text);
    toast(name === "copy-html" ? "HTML copied" : name === "copy-md" ? "Markdown copied" : "Text copied");
  }
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  } else fallbackCopy(text);
}

function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
  } catch {
    /* ignore */
  }
  ta.remove();
}
