// IndexedDB persistence with a localStorage fallback (e.g. private mode).

const DB_NAME = "sticky-notes";
const STORE = "notes";
const FALLBACK_KEY = "sticky-notes-fallback";

let dbPromise = null;
let useFallback = false;

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
    console.warn("IndexedDB unavailable, falling back to localStorage:", err);
    useFallback = true;
    return null;
  });
  return dbPromise;
}

function readFallback() {
  try {
    return JSON.parse(localStorage.getItem(FALLBACK_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeFallback(list) {
  try {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(list));
  } catch (err) {
    console.error("Could not persist notes:", err);
  }
}

function withStore(mode, fn) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        if (!db) return resolve(undefined);
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        let req;
        try {
          req = fn(store);
        } catch (err) {
          reject(err);
          return;
        }
        tx.oncomplete = () => resolve(req && "result" in req ? req.result : undefined);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error("aborted"));
      }),
    () => resolve(undefined)
  );
}

export async function getAll() {
  const db = await openDB();
  if (!db) return readFallback();
  const list = await withStore("readonly", (s) => s.getAll());
  return list || [];
}

export async function put(note) {
  const db = await openDB();
  if (!db) {
    const list = readFallback();
    const i = list.findIndex((n) => n.id === note.id);
    if (i >= 0) list[i] = note;
    else list.push(note);
    writeFallback(list);
    return;
  }
  await withStore("readwrite", (s) => s.put(note));
}

export async function putMany(notes) {
  const db = await openDB();
  if (!db) {
    writeFallback(notes.slice());
    return;
  }
  await withStore("readwrite", (s) => {
    notes.forEach((n) => s.put(n));
    return null;
  });
}

export async function remove(id) {
  const db = await openDB();
  if (!db) {
    writeFallback(readFallback().filter((n) => n.id !== id));
    return;
  }
  await withStore("readwrite", (s) => s.delete(id));
}

export async function clear() {
  const db = await openDB();
  if (!db) {
    writeFallback([]);
    return;
  }
  await withStore("readwrite", (s) => s.clear());
}
