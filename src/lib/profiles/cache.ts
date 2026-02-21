/**
 * IndexedDB cache for non-sensitive profile metadata.
 * Only caches: id, fullName, avatarUrl, status, owner_id, language
 * Never caches: health, vcard, insurance, document contents.
 * TTL: 5 minutes.
 */

const DB_NAME = "mediqom-profiles-cache";
const STORE_NAME = "profiles";
const TTL_MS = 5 * 60 * 1000;

export interface BasicProfile {
  id: string;
  fullName: string;
  avatarUrl?: string;
  status?: string;
  owner_id?: string;
  language?: string;
}

interface CacheEntry {
  profiles: BasicProfile[];
  cachedAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror = () => reject(req.error);
  });
}

export async function getCachedProfiles(
  userId: string,
): Promise<BasicProfile[] | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(userId);
      req.onsuccess = () => {
        const entry: CacheEntry | undefined = req.result;
        if (!entry) return resolve(null);
        if (Date.now() - entry.cachedAt > TTL_MS) return resolve(null);
        resolve(entry.profiles);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function setCachedProfiles(
  userId: string,
  profiles: BasicProfile[],
): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const entry: CacheEntry = { profiles, cachedAt: Date.now() };
      tx.objectStore(STORE_NAME).put(entry, userId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // cache writes are best-effort
  }
}
