/**
 * IndexedDB wrapper for caching original files during import.
 * Files persist across page navigation and app sleep on the same device.
 * Cleared after successful finalization.
 */

const DB_NAME = "mediqom-import-cache";
const DB_VERSION = 1;
const STORE_NAME = "files";

interface CachedFile {
  name: string;
  type: string;
  data: ArrayBuffer;
}

interface CachedEntry {
  jobId: string;
  files: CachedFile[];
  createdAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "jobId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Cache original files for a job */
export async function cacheFiles(jobId: string, files: File[]): Promise<void> {
  const db = await openDB();
  const cachedFiles: CachedFile[] = await Promise.all(
    files.map(async (file) => ({
      name: file.name,
      type: file.type,
      data: await file.arrayBuffer(),
    })),
  );

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const entry: CachedEntry = {
      jobId,
      files: cachedFiles,
      createdAt: Date.now(),
    };
    const request = store.put(entry);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

/** Retrieve cached files for a job */
export async function getFiles(jobId: string): Promise<File[] | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(jobId);
      request.onsuccess = () => {
        const entry: CachedEntry | undefined = request.result;
        if (!entry) {
          resolve(null);
          return;
        }
        const files = entry.files.map(
          (f) => new File([f.data], f.name, { type: f.type }),
        );
        resolve(files);
      };
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
    });
  } catch {
    // IndexedDB not available or entry missing
    return null;
  }
}

/** Check if files exist in cache without loading them */
export async function hasFiles(jobId: string): Promise<boolean> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.getKey(jobId);
      request.onsuccess = () => resolve(request.result !== undefined);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return false;
  }
}

/** Remove cached files after finalization */
export async function clearFiles(jobId: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(jobId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
    });
  } catch {
    // Ignore cleanup errors
  }
}
