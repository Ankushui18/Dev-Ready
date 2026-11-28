import type { DevReadyBundle } from '../types';

const DB_NAME = 'devready-studio-db';
const DB_VERSION = 1;
const STORE_NAME = 'screens';
const FALLBACK_KEY = 'devready-studio-screens-v1';
const RECENTS_KEY = 'devready-studio-recents-v1';
const PINNED_KEY = 'devready-studio-pinned-v1';

export function loadRecentsMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function touchRecentScreen(id: string): Record<string, number> {
  const next = { ...loadRecentsMap(), [id]: Date.now() };
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // ignore quota error
  }
  return next;
}

export function loadPinnedIds(): string[] {
  try {
    const raw = localStorage.getItem(PINNED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function togglePinScreen(id: string): string[] {
  const current = loadPinnedIds();
  const next = current.includes(id) ? current.filter(x => x !== id) : [id, ...current];
  try {
    localStorage.setItem(PINNED_KEY, JSON.stringify(next));
  } catch {
    // ignore quota error
  }
  return next;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB'));
  });
}

export async function loadSavedScreens(): Promise<DevReadyBundle[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve((req.result as DevReadyBundle[]) || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    try {
      const raw = localStorage.getItem(FALLBACK_KEY);
      return raw ? (JSON.parse(raw) as DevReadyBundle[]) : [];
    } catch {
      return [];
    }
  }
}

export async function saveScreen(bundle: DevReadyBundle): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(bundle);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    try {
      const list = await loadSavedScreens();
      const idx = list.findIndex(s => s.id === bundle.id);
      if (idx >= 0) list[idx] = bundle;
      else list.unshift(bundle);
      localStorage.setItem(FALLBACK_KEY, JSON.stringify(list));
    } catch {
      // ignore quota error
    }
  }
}

export async function deleteScreen(id: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    try {
      const list = (await loadSavedScreens()).filter(s => s.id !== id);
      localStorage.setItem(FALLBACK_KEY, JSON.stringify(list));
    } catch {
      // ignore
    }
  }
}
