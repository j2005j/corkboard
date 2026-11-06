# Corkboard

A self-hostable sticky-note board for your browser: cork, wood and a broom.
No build step, no backend, no dependencies - static files only.

Live: https://j2005j.github.io/corkboard/

## Run

```sh
python3 -m http.server 8080
# open http://localhost:8080
```

Any static file server works (`npx serve .`, nginx, GitHub Pages). Opening
`index.html` from disk does not work: ES modules need an http(s) origin.

## Features

- Rich text, Markdown and raw HTML editing, done in place on the note itself
- Pasting keeps formatting; stored HTML is sanitized with DOMPurify
- Drag a note by its top bar; a pill with broom and trash targets slides in while dragging
- Nine-dot grip: drag rotates (Shift = 15 degree steps), right-click straightens, left-click opens the menu (duplicate, color, pin, rotate, copy as Markdown/HTML/text)
- Dust bag for finished notes; trash keeps notes 30 days, then purges them
- Settings: note color (yellow / random / palette / hex), theme, sound and volume, animations, paper grain, export / import / erase all
- Light theme is a cork board with a wooden rail, dark is flat AMOLED black
- IndexedDB storage, JSON export/import backup
- Sounds on by default (mute + volume in settings); animations follow `prefers-reduced-motion`

## Shortcuts

| Key | Action |
| --- | --- |
| `N` | New note |
| `Esc` | Close editor / panel |
| `/` | Focus panel search (opens the dust bag) |
| `Ctrl/Cmd + Enter` | Save and close the editor |

## Storage

Everything stays in the browser: notes in IndexedDB (localStorage fallback),
preferences in localStorage. Export downloads all notes as one JSON file,
import replaces the current notes. Trash purges itself after 30 days.

## Layout

```
index.html        entry, pre-paint theme script, loads src/main.js
styles/app.css    all styling, both themes, responsive layout
src/              ES modules (board, editor, settings, menu, store, ...)
vendor/           marked, DOMPurify, turndown, recycle sounds
```

## Credits

- [Phosphor Icons](https://phosphoricons.com) (MIT), inlined in `src/icons.js`
- [marked](https://github.com/markedjs/marked), [DOMPurify](https://github.com/cure53/DOMPurify), [turndown](https://github.com/mixmark-io/turndown) vendored in `vendor/`
- Recycle sounds from a Samsung theme sound pack, vendored in `vendor/`
