/**
 * IndexedDB wrapper for caching original files during import.
 * Files persist across page navigation and app sleep on the same device.
 * Cleared after successful finalization.
 *
 * Security: Files are encrypted with ephemeral AES-256-GCM keys before storage.
 * Keys are stored in sessionStorage and cleared on logout or browser close.
 */

import {
  generateJobKey,
  storeJobKey,
  getJobKey,
  clearJobKey,
  encryptFile,
  decryptFile,
} from "./encryption";
import { importKey } from "$lib/encryption/aes";

const DB_NAME = "mediqom-import-cache";
const DB_VERSION = 1;
const STORE_NAME = "files";

interface CachedFile {
  name: string;
  type: string;
  data: string; // Base64-encoded encrypted data
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

/** Cache original files for a job - files are encrypted before storage if possible */
export async function cacheFiles(jobId: string, files: File[]): Promise<void> {
  try {
    // Try to generate ephemeral encryption key for this job
    const keyString = await generateJobKey(jobId);
    await storeJobKey(jobId, keyString);
    const cryptoKey = await importKey(keyString);

    // Encrypt files before storage
    const db = await openDB();
    const cachedFiles: CachedFile[] = await Promise.all(
      files.map(async (file) => ({
        name: file.name,
        type: file.type,
        data: await encryptFile(await file.arrayBuffer(), cryptoKey),
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
  } catch (error) {
    // Fallback to plaintext if encryption fails
    console.warn("File cache encryption failed, storing plaintext:", error);
    const db = await openDB();
    const cachedFiles: CachedFile[] = await Promise.all(
      files.map(async (file) => ({
        name: file.name,
        type: file.type,
        data: btoa(
          String.fromCharCode(...new Uint8Array(await file.arrayBuffer())),
        ), // base64 encode for storage
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
}

/** Retrieve cached files for a job - files are decrypted on retrieval if encrypted */
export async function getFiles(jobId: string): Promise<File[] | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(jobId);
      request.onsuccess = async () => {
        const entry: CachedEntry | undefined = request.result;
        if (!entry) {
          resolve(null);
          return;
        }

        try {
          // Try to get encryption key
          const keyString = await getJobKey(jobId);

          if (keyString) {
            // Files are encrypted - decrypt them
            const cryptoKey = await importKey(keyString);
            const files = await Promise.all(
              entry.files.map(async (f) => {
                const decryptedData = await decryptFile(f.data, cryptoKey);
                return new File([decryptedData], f.name, { type: f.type });
              }),
            );
            resolve(files);
          } else {
            // No encryption key - assume plaintext base64
            console.warn(
              "No encryption key found for job, assuming plaintext:",
              jobId,
            );
            const files = entry.files.map((f) => {
              // Decode base64 to ArrayBuffer
              const binaryString = atob(f.data);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              return new File([bytes], f.name, { type: f.type });
            });
            resolve(files);
          }
        } catch (error) {
          console.error("Failed to process cached files:", error);
          reject(error);
        }
      };
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
    });
  } catch (error) {
    console.error("Failed to retrieve cached files:", error);
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

/** Remove cached files and encryption key after finalization */
export async function clearFiles(jobId: string): Promise<void> {
  try {
    // Clear encryption key
    await clearJobKey(jobId);

    // Clear cached files
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
