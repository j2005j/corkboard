# Corkboard

A self-hostable sticky-note board — cork, wood and a broom — that runs
entirely in your browser. Rich text, Markdown or raw HTML editing, and a drop
pill that slides down from the top while you drag a note onto the broom or the
trash.

No build step, no backend, no dependencies to install — just static files.

## Run it

Any static file server works:

```sh
python3 -m http.server 8080
# then open http://localhost:8080
```

or `npx serve .`, `php -S localhost:8080`, GitHub Pages, Netlify, a NAS, a
Raspberry Pi behind nginx… anything that serves `index.html`.

Opening `index.html` straight from the filesystem does **not** work: ES modules
need an `http(s)` origin. The server can be remote — everything runs client-side.

## Using it

| Action | How |
| --- | --- |
| New note | **N**, the **+** button in the rail, or double-click the board — it lands in a random spot on the board |
| Edit a note | Click its body (the top bar is for dragging) — editing happens **in place**, right on the note |
| Move a note | Drag anywhere on its top bar — hovering shows faint stripes; the buttons stay put |
| Rotate a note | Drag the nine-dot grip — deliberately slow (half the mouse sweep); hold **Shift** for 15° steps |
| Straighten a note | **Right-click** the nine-dot grip (back to 0°) |
| Note menu | **Left-click** the nine-dot grip — duplicate, color, pin, rotate, copy-as |
| Pin a note | Grip menu → **Pin to top** — pinned notes float above the board (badge in the top bar) |
| Resize a note | Drag the hook in its bottom-right corner |
| Sweep a note away | Hover → **✔**, or drag it onto the broom ball |
| Trash a note | Hover → **🗑**, or drag it onto the trash ball |
| Open the dust bag / trash | The **broom** / **trash** buttons at the bottom of the left rail |
| Erase the trash | Trash panel → **Erase all** (red, asks first) |
| Settings | The **gear** button in the rail — color, theme, sound, animations, **data** |
| Switch theme | Settings → **App → Theme** (the rail keeps only the essentials now) |
| Export / import / erase everything | Settings → **Data** (erase is red and asks first) |
| Close panel or editor | **Esc** |
| Focus the panel search | **/** |
| Save while editing | **Ctrl/Cmd + Enter** or click away |

While a note is being dragged, a pill with the broom and trash balls slides
down from the top of the screen as the drop targets. The rest of the time the
rail's buttons open those panels.

### Editing

Editing is WYSIWYG: clicking a note puts the cursor **on the note itself** —
the text area is transparent over the paper and uses the same typography as the
rendered view, so what you type is exactly what the note shows. A slim top
strip keeps the three mode tabs over the formatting toolbar:

- **Rich** — contenteditable with a formatting toolbar (headings, lists, quote,
  link, code). Pasting from a browser or Word keeps the formatting. Note color
  is **not** in the toolbar — the grip menu is the single color picker.
- **MD** — Markdown source with a live preview. Pasting rich text converts it
  to Markdown.
- **Source** — the raw HTML, if you want full control.

Stored HTML is sanitized with DOMPurify on every save and on import.

### The grip menu

The nine-dot grip in a note's top bar does triple duty:

- **Left-drag** — rotate the note around that corner (**Shift** = 15° steps)
- **Left-click** — open the menu: **Duplicate**, **Pin/Unpin**, six palette
  swatches plus a **custom color picker**, **−15° / 0° / +15°** rotate, and
  **Copy as** Markdown / HTML / plain text
- **Right-click** — straighten the note back to 0°

### Settings

The gear button in the rail opens the settings panel; the rail itself now
holds just **new, settings, dust bag, trash**:

- **New note color** — stock yellow, a random palette color, a fixed palette
  color, or a custom **HEX** with a color picker. Custom hex notes pick dark or
  light text automatically.
- **App** — theme (light/dark), sound effects with a **volume slider**
  (default 100%), animations (turning animations off disables every transition
  and fly-out, same as `prefers-reduced-motion`), and **paper grain** — the
  subtle fibrous tooth on every note, on by default.
- **Data** — **Export** / **Import** JSON, and a red **Erase all notes**
  button that wipes the board, dust bag and trash behind a confirmation.
  The trash panel has its own red **Erase all** for just the bin — the cards
  blur away into a puff of dust with a recycle chime (`vendor/ss-recycle2.wav`,
  synthesized dust-poof fallback).

Clicking **+** zooms the fresh note out of the button, every new note lands in
a **random spot** on the visible board (avoiding pile-ups when it can) and
slightly askew (its own angle within ±5°).

### Lifecycle

```
board ──✔──▶ dust bag ──Pull out──▶ board
board ──🗑──▶ trash (30 days) ──Restore──▶ board
                    └──auto-purged after 30 days
```

Trash purges automatically on page load, when the tab regains focus, and hourly
while open. Notes in the dust bag never expire.

## Storage & backup

Notes live in **IndexedDB** (falling back to localStorage when IndexedDB is
unavailable, e.g. some private-browsing modes), scoped to this origin and this
browser profile. **Export** downloads everything as one JSON file; **Import**
replaces the current notes with the file's contents (with a confirmation).

Import/export is the backup story: there is no server, so sync between devices
means exporting on one and importing on the other.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `N` | New note |
| `Esc` | Close editor / close panel |
| `/` | Focus panel search (opens the dust bag if no panel is open) |
| `Ctrl/Cmd + Enter` | Save and close the editor |

## Project layout

```
index.html          markup; loads vendor scripts, then src/main.js
styles/app.css      all styling, including both themes and the responsive layout
vendor/             vendored libs: marked, DOMPurify, turndown, the recycle sounds
src/
  main.js           orchestration: drop pill, rail tools, theme, actions, boot
  board.js          note DOM, positioning, drag, rotate, resize, edit entry
  editor.js         in-place rich / Markdown / source modes + toolbar
  menu.js           grip context menu (duplicate, color, pin, rotate, copy)
  panels.js         dust bag & trash side panel + the settings panel
  settings.js       user settings: note color, theme, motion (localStorage)
  store.js          in-memory store mirrored to IndexedDB
  db.js             IndexedDB with localStorage fallback
  markdown.js       Markdown ↔ HTML, sanitization, text extraction
  animations.js     suck / crumple / inflate animations (Web Animations API)
  sound.js          optional synthesized sound effects (off by default)
  export.js         JSON export / import
  icons.js          Phosphor icons inlined as SVG
  ui.js             toast + confirm dialog
```

## Notes

- **No build step.** Plain ES modules; `vendor/` holds the three libraries so
  the app works with no network access after first load.
- **Themes.** Light is a cork bulletin board with a wooden tool rail; dark is a
  flat AMOLED black with the dotted board (no cork or wood). The choice is
  stored, and with no stored choice the app follows the system preference.
- **The board texture** (vignette + grain) lives on a viewport-fixed layer, so
  opening the panel never shifts it; the old scattered cork pores are gone.
  Dark mode keeps its uniform dot grid.
- **Rotation** is normalized into (−180°, 180°] — spinning a note forever
  never accumulates degrees, and sweeping across the ±180° seam mid-drag
  continues smoothly instead of yanking a full turn.
- **Icons:** [Phosphor Icons](https://phosphoricons.com) (MIT), vendored as
  inline SVG in `src/icons.js`. Phosphor has no vacuum glyph, so the **broom**
  stands in for it; the broom and trash use the duotone weight.
- **Animations** honor `prefers-reduced-motion: reduce`, and can be switched
  off entirely in **Settings → App → Animations**.
- **Sound** is synthesized with the Web Audio API (plus the vendored recycle
  sample) and off by default — toggled and volume-adjusted in **Settings →
  App**; the preference sticks.
- **Note colors** are six palette papers plus any custom hex; the color
  preference lives in `localStorage` (`sticky-settings`), the theme in its own
  key (`sticky-theme`) so it can be applied before first paint.
- **Layering:** pinned notes sit in their own z band above the board; the drag
  pill, flying clones, panel, toast, modal and grip menu each have a band above
  that (see the comment in `styles/app.css`).
- **Mobile** (≤ 700px): notes stack vertically instead of floating, and the
  panel becomes an overlay.
