// Pasted images live in their own IndexedDB ("sticky-images"), NOT inside the
// note HTML: the JSON export stays small and images stay browser-local.
// The note only carries a reference (<img data-cork-img="id">); src is filled
// in at render time from the blob store and stripped again before every save,
// so the bytes never touch the note record or a backup file.

const DB_NAME = "sticky-images";
const STORE = "images";

let dbPromise = null;
const urls = new Map(); // id -> object URL (one per image, reused)
const blobs = new Map(); // id -> Blob | null (session cache)

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) return reject(new Error("IndexedDB unavailable"));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IndexedDB blocked"));
  }).catch((err) => {
    console.warn("Image store unavailable:", err);
    return null;
  });
  return dbPromise;
}

function tx(mode, fn) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        if (!db) return reject(new Error("no image store"));
        const t = db.transaction(STORE, mode);
        let req;
        try {
          req = fn(t.objectStore(STORE));
        } catch (err) {
          reject(err);
          return;
        }
        t.oncomplete = () => resolve(req && "result" in req ? req.result : undefined);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error || new Error("aborted"));
      })
  );
}

function makeId() {
  if (crypto.randomUUID) return "img-" + crypto.randomUUID();
  return "img-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** Store a pasted file and return its reference id. */
export async function put(file) {
  const id = makeId();
  await tx("readwrite", (s) => s.put({ id, blob: file }));
  blobs.set(id, file);
  return id;
}

/** Blob for a reference id (cached; null when this browser does not have it). */
export async function get(id) {
  if (blobs.has(id)) return blobs.get(id);
  let rec = null;
  try {
    rec = await tx("readonly", (s) => s.get(id));
  } catch {
    rec = null;
  }
  const blob = rec && rec.blob ? rec.blob : null;
  blobs.set(id, blob);
  return blob;
}

/** How many images this browser stores (tests / diagnostics). */
export async function count() {
  try {
    return (await tx("readonly", (s) => s.count())) || 0;
  } catch {
    return 0;
  }
}

/**
 * Fill in src for every <img data-cork-img> under root from the blob store.
 * Images the store does not have (e.g. after a JSON import elsewhere) get the
 * .img-missing class instead of a broken picture.
 */
export async function resolve(root) {
  if (!root) return;
  const imgs = [...root.querySelectorAll("img[data-cork-img]")];
  for (const img of imgs) {
    if (img.getAttribute("src")) continue;
    const id = img.dataset.corkImg;
    const blob = await get(id);
    if (blob) {
      let url = urls.get(id);
      if (!url) {
        url = URL.createObjectURL(blob);
        urls.set(id, url);
      }
      img.src = url;
      img.classList.remove("img-missing");
    } else {
      img.classList.add("img-missing");
      img.alt = "image not stored in this browser";
      img.title = "Images are not part of JSON backups";
    }
  }
}

/** Storage form of an html string: image references keep the id, drop the src. */
export function toStorage(html) {
  if (!html || html.indexOf("data-cork-img") === -1) return html;
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  tpl.content.querySelectorAll("img[data-cork-img]").forEach((im) => {
    im.removeAttribute("src");
    im.classList.remove("img-missing");
  });
  return tpl.innerHTML;
}

/** Delete every stored image whose id is not in `keep`. Serialized to avoid
    overlapping deletions (erase loops call it per destroyed note). */
let chain = Promise.resolve();
export function prune(keep) {
  const set = keep instanceof Set ? keep : new Set(keep || []);
  chain = chain.then(() => doPrune(set)).catch(() => {});
  return chain;
}

async function doPrune(keep) {
  const db = await openDB();
  if (!db) return;
  const ids = await tx("readonly", (s) => s.getAllKeys());
  const dead = (ids || []).filter((id) => !keep.has(id));
  if (!dead.length) return;
  await tx("readwrite", (s) => {
    dead.forEach((id) => {
      s.delete(id);
      const url = urls.get(id);
      if (url) {
        URL.revokeObjectURL(url);
        urls.delete(id);
      }
      blobs.delete(id);
    });
    return null;
  });
}
