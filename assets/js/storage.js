import { DEFAULT_SETTINGS, STORAGE_KEYS } from "./config.js";
import { normalizedSettings } from "./core.js";

const DB_NAME = "fit-jarvis-db";
const DB_VERSION = 1;
const PHOTO_STORE = "photos";

function cloneFallback(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

export function safeReadJSON(key, fallback) {
  let raw;
  try {
    raw = localStorage.getItem(key);
  } catch (_) {
    return cloneFallback(fallback);
  }
  if (!raw) return cloneFallback(fallback);
  try {
    return JSON.parse(raw);
  } catch (error) {
    try {
      localStorage.setItem(`${key}_corrupt_${Date.now()}`, raw.slice(0, 200000));
      localStorage.removeItem(key);
    } catch (_) {
      // Storage may be unavailable; fallback is still returned.
    }
    return cloneFallback(fallback);
  }
}

export function loadState() {
  return {
    settings: normalizedSettings(safeReadJSON(STORAGE_KEYS.settings, DEFAULT_SETTINGS)),
    records: safeReadJSON(STORAGE_KEYS.records, {}),
    habitData: safeReadJSON(STORAGE_KEYS.habits, {}),
    gymData: safeReadJSON(STORAGE_KEYS.gym, []),
    measureData: safeReadJSON(STORAGE_KEYS.measures, []),
  };
}

export function saveState({ settings, records, habitData, gymData, measureData }) {
  const payloads = [
    [STORAGE_KEYS.settings, settings],
    [STORAGE_KEYS.records, records],
    [STORAGE_KEYS.habits, habitData],
    [STORAGE_KEYS.gym, gymData],
    [STORAGE_KEYS.measures, measureData],
  ];
  try {
    for (const [key, value] of payloads) localStorage.setItem(key, JSON.stringify(value));
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

export function loadTheme() {
  try {
    const theme = localStorage.getItem(STORAGE_KEYS.theme);
    return theme === "light" ? "light" : "dark";
  } catch (_) {
    return "dark";
  }
}

export function saveTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEYS.theme, theme === "light" ? "light" : "dark");
  } catch (_) {
    // Theme still changes for the current session even if persistence is blocked.
  }
}

function openPhotoDB() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB qo‘llab-quvvatlanmaydi"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PHOTO_STORE)) {
        const store = db.createObjectStore(PHOTO_STORE, { keyPath: "id" });
        store.createIndex("date", "date", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB ochilmadi"));
  });
}

async function withPhotoStore(mode, action) {
  const db = await openPhotoDB();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(PHOTO_STORE, mode);
      const store = transaction.objectStore(PHOTO_STORE);
      let actionResult;
      try {
        actionResult = action(store);
      } catch (error) {
        reject(error);
        return;
      }
      transaction.oncomplete = () => resolve(actionResult);
      transaction.onerror = () => reject(transaction.error || new Error("IndexedDB amali bajarilmadi"));
      transaction.onabort = () => reject(transaction.error || new Error("IndexedDB amali bekor qilindi"));
    });
  } finally {
    db.close();
  }
}

export async function getAllPhotos() {
  const db = await openPhotoDB();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(PHOTO_STORE, "readonly").objectStore(PHOTO_STORE).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error || new Error("Fotolar o‘qilmadi"));
    });
  } finally {
    db.close();
  }
}

export async function putPhoto(photo) {
  await withPhotoStore("readwrite", (store) => store.put(photo));
}

export async function deletePhoto(id) {
  await withPhotoStore("readwrite", (store) => store.delete(id));
}

export async function replacePhotos(photos) {
  const db = await openPhotoDB();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(PHOTO_STORE, "readwrite");
      const store = transaction.objectStore(PHOTO_STORE);
      store.clear();
      for (const photo of photos) store.put(photo);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("Fotolar import qilinmadi"));
      transaction.onabort = () => reject(transaction.error || new Error("Foto importi bekor qilindi"));
    });
  } finally {
    db.close();
  }
}

export function dataURLToBlob(dataURL) {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataURL);
  if (!match) throw new Error("Noto‘g‘ri rasm ma’lumoti");
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: match[1] });
}

export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Rasm o‘qilmadi"));
    reader.readAsDataURL(blob);
  });
}

export async function migrateLegacyPhotos() {
  const legacy = safeReadJSON(STORAGE_KEYS.legacyPhotos, []);
  if (!Array.isArray(legacy) || !legacy.length) {
    try { localStorage.removeItem(STORAGE_KEYS.legacyPhotos); } catch (_) {}
    return 0;
  }
  let migrated = 0;
  for (const item of legacy.slice(0, 250)) {
    try {
      if (!item?.data || !item?.date) continue;
      await putPhoto({
        id: String(item.id || `${Date.now()}-${migrated}`),
        date: String(item.date),
        type: String(item.type || "Old").slice(0, 30),
        blob: dataURLToBlob(item.data),
      });
      migrated += 1;
    } catch (_) {
      // Bad legacy photos are skipped; valid photos continue migrating.
    }
  }
  try { localStorage.removeItem(STORAGE_KEYS.legacyPhotos); } catch (_) {}
  return migrated;
}
