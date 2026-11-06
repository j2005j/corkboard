// Note editor: rich (contenteditable), Markdown and HTML source modes.
// The editor mounts in place - the text area is the note itself, transparent
// over the paper with the same typography as the rendered view.

import * as store from "./store.js";
import { sanitize, mdToHtml, htmlToMd, escapeHtml } from "./markdown.js";
import { icon } from "./icons.js";

const TABS_HTML = `
  <div class="mode-tabs">
    <button type="button" data-mode="rich" aria-pressed="false">${icon("pencil-simple-bold")}Rich</button>
    <button type="button" data-mode="md" aria-pressed="false">${icon("markdown-logo-bold")}MD</button>
    <button type="button" data-mode="source" aria-pressed="false">${icon("code-bold")}Source</button>
  </div>`;

const FMT_HTML = `
  <div class="fmt-toolbar">
    <button type="button" data-cmd="bold" title="Bold"><b>B</b></button>
    <button type="button" data-cmd="italic" title="Italic"><i>I</i></button>
    <button type="button" data-cmd="underline" title="Underline"><u>U</u></button>
    <button type="button" data-cmd="strikeThrough" title="Strikethrough"><s>S</s></button>
    <span class="sep"></span>
    <button type="button" data-block="h1" title="Heading 1">H1</button>
    <button type="button" data-block="h2" title="Heading 2">H2</button>
    <span class="sep"></span>
    <button type="button" data-cmd="insertUnorderedList" title="Bullet list">${icon("list-bold")}</button>
    <button type="button" data-cmd="insertOrderedList" title="Numbered list">${icon("list-numbers-bold")}</button>
    <button type="button" data-block="blockquote" title="Quote">${icon("quotes-bold")}</button>
    <button type="button" data-wrap="code" title="Inline code">&lt;/&gt;</button>
    <button type="button" data-cmd="createLink" title="Insert link">${icon("link-bold")}</button>
    <button type="button" data-cmd="removeFormat" title="Clear formatting">${icon("eraser-bold")}</button>
  </div>`;

// The top strip: the three mode tabs, then the format toolbar under them -
// both in one column so narrow notes just wrap rows instead of overflowing.
const BAR_HTML = `
  <div class="edit-bar">
    ${TABS_HTML}
    ${FMT_HTML}
  </div>`;

const RICH_HTML = `<div class="editable note-view" contenteditable="true" spellcheck="true"></div>`;
const MD_HTML = `
  <p class="md-hint">Markdown &mdash; paste keeps formatting</p>
  <textarea class="md-input" spellcheck="true" placeholder="# Title&#10;- a task&#10;**bold**, \`code\`, [link](https://example.com)"></textarea>
  <div class="md-preview"></div>`;
const SOURCE_HTML = `<textarea class="src-input" spellcheck="false" placeholder="&lt;h1&gt;Raw HTML&lt;/h1&gt;"></textarea>`;

let current = null; // { id, noteEl, wrap, mode, onClose, timer }

export function isEditing(id) {
  return !!current && current.id === id;
}

export function anyEditing() {
  return !!current;
}

export function mount(noteEl, note, onClose) {
  if (current) close();

  const wrap = document.createElement("div");
  wrap.className = "note-edit";
  wrap.innerHTML = BAR_HTML + `<div class="edit-panels"></div>`;
  noteEl.appendChild(wrap);
  noteEl.classList.add("editing");

  current = {
    id: note.id,
    noteEl,
    wrap,
    mode: ["rich", "md", "source"].includes(note.mode) ? note.mode : "rich",
    onClose,
    timer: null,
  };

  const panels = wrap.querySelector(".edit-panels");

  function showPanel(mode) {
    panels.innerHTML =
      mode === "rich" ? RICH_HTML : mode === "md" ? MD_HTML : SOURCE_HTML;
    wrap.querySelector(".fmt-toolbar").style.display = mode === "rich" ? "" : "none";
    wrap.querySelectorAll(".mode-tabs button").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
    });
    wirePanel(mode);
  }

  function wirePanel(mode) {
    if (mode === "rich") {
      const ed = panels.querySelector(".editable");
      ed.innerHTML = note.html || "";
      ed.classList.toggle("note-empty", !note.html);
      ed.addEventListener("input", () => {
        ed.classList.toggle("note-empty", !ed.textContent.trim());
        schedule(harvestRich, 400);
      });
      ed.addEventListener("paste", onRichPaste);
      ed.addEventListener("keydown", onEditorKeys);
      requestAnimationFrame(() => ed.focus());
    } else if (mode === "md") {
      const ta = panels.querySelector(".md-input");
      const prev = panels.querySelector(".md-preview");
      ta.value = note.md != null ? note.md : htmlToMd(note.html);
      updatePreview(prev, ta.value);
      ta.addEventListener("input", () => schedule(() => harvestMd(prev), 250));
      ta.addEventListener("paste", (e) => onMdPaste(e, ta, prev));
      ta.addEventListener("keydown", onEditorKeys);
      requestAnimationFrame(() => ta.focus());
    } else {
      const ta = panels.querySelector(".src-input");
      ta.value = note.html || "";
      ta.addEventListener("input", () => schedule(harvestSource, 400));
      ta.addEventListener("keydown", onEditorKeys);
      requestAnimationFrame(() => ta.focus());
    }
  }

  function onEditorKeys(e) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      close();
    }
  }

  function schedule(fn, ms) {
    clearTimeout(current && current.timer);
    if (!current) return;
    current.timer = setTimeout(() => {
      if (current) fn();
    }, ms);
  }

  function flush() {
    if (current && current.timer) {
      clearTimeout(current.timer);
      current.timer = null;
      // Run the pending harvest for the active mode one last time.
      if (current.mode === "rich") harvestRich();
      else if (current.mode === "md") {
        const prev = current.wrap.querySelector(".md-preview");
        const ta = current.wrap.querySelector(".md-input");
        if (prev && ta) harvestMd(prev);
      } else harvestSource();
    }
  }

  function harvestRich() {
    const ed = current.wrap.querySelector(".editable");
    if (!ed) return;
    store.update(current.id, { html: sanitize(ed.innerHTML), md: null });
  }

  function harvestMd(prev) {
    const ta = current.wrap.querySelector(".md-input");
    if (!ta) return;
    const html = mdToHtml(ta.value);
    if (prev) prev.innerHTML = html;
    store.update(current.id, { md: ta.value, html });
  }

  function harvestSource() {
    const ta = current.wrap.querySelector(".src-input");
    if (!ta) return;
    store.update(current.id, { html: sanitize(ta.value), md: null });
  }

  function updatePreview(prev, value) {
    prev.innerHTML = mdToHtml(value);
  }

  function onRichPaste(e) {
    e.preventDefault();
    const cd = e.clipboardData;
    const html = cd.getData("text/html");
    const text = cd.getData("text/plain");
    if (html) {
      document.execCommand("insertHTML", false, sanitize(html));
    } else if (text) {
      document.execCommand("insertHTML", false, escapeHtml(text).replace(/\r?\n/g, "<br>"));
    }
    schedule(harvestRich, 100);
  }

  function onMdPaste(e, ta, prev) {
    const html = e.clipboardData.getData("text/html");
    if (!html) return; // plain text: default behavior
    e.preventDefault();
    const md = htmlToMd(html);
    const s = ta.selectionStart;
    const en = ta.selectionEnd;
    ta.value = ta.value.slice(0, s) + md + ta.value.slice(en);
    ta.setSelectionRange(s + md.length, s + md.length);
    schedule(() => harvestMd(prev), 50);
  }

  // Mode tabs
  wrap.querySelectorAll(".mode-tabs button").forEach((btn) => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
  });

  function setMode(next) {
    if (!current || next === current.mode) return;
    clearTimeout(current.timer);
    current.timer = null;
    // Harvest content from the mode we're leaving.
    if (current.mode === "rich") harvestRich();
    else if (current.mode === "md") {
      const prev = current.wrap.querySelector(".md-preview");
      if (prev) harvestMd(prev);
    } else harvestSource();

    const note = store.get(current.id);
    current.mode = next;
    if (note) store.update(current.id, { mode: next }, { touch: false });
    showPanel(next);
  }

  // Format toolbar
  const toolbar = wrap.querySelector(".fmt-toolbar");
  toolbar.addEventListener("mousedown", (e) => {
    if (e.target.closest("button")) e.preventDefault(); // keep the text selection
  });
  toolbar.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn || !current) return;
    const ed = current.wrap.querySelector(".editable");
    if (!ed) return;
    ed.focus();

    if (btn.dataset.block) {
      document.execCommand("formatBlock", false, "<" + btn.dataset.block + ">");
    } else if (btn.dataset.wrap === "code") {
      const sel = window.getSelection();
      if (sel && sel.rangeCount && !sel.isCollapsed) {
        document.execCommand("insertHTML", false, "<code>" + escapeHtml(sel.toString()) + "</code>");
      } else {
        document.execCommand("insertHTML", false, "<code>&#8203;</code>");
      }
    } else if (btn.dataset.cmd === "createLink") {
      const url = prompt("Link URL:");
      if (url) document.execCommand("createLink", false, url);
    } else if (btn.dataset.cmd) {
      document.execCommand(btn.dataset.cmd, false, null);
    }
    schedule(harvestRich, 150);
  });

  // Initial paint
  showPanel(current.mode);

  current.flush = flush;
  return wrap;
}

export function close() {
  if (!current) return;
  const { id, noteEl, onClose, wrap } = current;
  if (typeof current.flush === "function") current.flush();
  current = null;
  wrap.remove();
  noteEl.classList.remove("editing");
  const note = store.get(id);
  const view = noteEl.querySelector(".note-view");
  if (view && note) {
    view.innerHTML = note.html || "";
    view.classList.toggle("note-empty", !note.html);
    noteEl.dataset.html = note.html;
  }
  if (onClose) onClose();
}

// Close the editor when clicking outside the note.
document.addEventListener(
  "pointerdown",
  (e) => {
    if (!current) return;
    if (current.noteEl.contains(e.target)) return;
    close();
  },
  true
);
