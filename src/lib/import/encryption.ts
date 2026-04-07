/**
 * Ephemeral key management for import jobs
 *
 * This module manages temporary encryption keys for import jobs in an in-memory Map.
 * Keys are automatically pruned after 30 minutes of inactivity. Keys are lost on
 * page reload (acceptable — job-manager regenerates on retry).
 */

import {
  prepareKey,
  exportKey,
  importKey,
  encrypt,
  decrypt,
} from "$lib/encryption/aes";

const KEY_EXPIRY_MS = 30 * 60 * 1000; // 30 min inactivity

interface KeyEntry {
  key: string;
  lastAccessed: number;
}

const keyStore = new Map<string, KeyEntry>();

/**
 * Remove expired keys (lazy pruning)
 */
function pruneExpiredKeys(): void {
  const now = Date.now();
  for (const [id, entry] of keyStore) {
    if (now - entry.lastAccessed > KEY_EXPIRY_MS) {
      keyStore.delete(id);
    }
  }
}

/**
 * Generate a new AES-256-GCM key for a job
 * @param jobId - Unique job identifier
 * @returns Base64-encoded encryption key
 */
export async function generateJobKey(jobId: string): Promise<string> {
  const cryptoKey = await prepareKey();
  const keyString = await exportKey(cryptoKey);
  return keyString;
}

/**
 * Store a job encryption key in memory
 * @param jobId - Unique job identifier
 * @param key - Base64-encoded encryption key
 */
export async function storeJobKey(jobId: string, key: string): Promise<void> {
  pruneExpiredKeys();
  keyStore.set(jobId, { key, lastAccessed: Date.now() });
}

/**
 * Retrieve a job encryption key from memory
 * @param jobId - Unique job identifier
 * @returns Base64-encoded encryption key or null if not found
 */
export async function getJobKey(jobId: string): Promise<string | null> {
  pruneExpiredKeys();
  const entry = keyStore.get(jobId);
  if (!entry) return null;
  entry.lastAccessed = Date.now();
  return entry.key;
}

/**
 * Clear a specific job encryption key from memory
 * @param jobId - Unique job identifier
 */
export async function clearJobKey(jobId: string): Promise<void> {
  keyStore.delete(jobId);
}

/**
 * Clear all job encryption keys from memory
 * Should be called on logout or when clearing all import data
 */
export async function clearAllJobKeys(): Promise<void> {
  keyStore.clear();
}

/**
 * Encrypt a file's ArrayBuffer for cache storage
 * @param file - File data as ArrayBuffer
 * @param key - CryptoKey for encryption
 * @returns Base64-encoded encrypted data with IV
 */
export async function encryptFile(
  file: ArrayBuffer,
  key: CryptoKey,
): Promise<string> {
  try {
    // Convert ArrayBuffer to base64 string for encryption
    const base64 = arrayBufferToBase64(file);
    const encrypted = await encrypt(key, base64);
    return encrypted;
  } catch (error) {
    console.error("Failed to encrypt file:", error);
    throw new Error("File encryption failed");
  }
}

/**
 * Decrypt a file from cache storage
 * @param encryptedData - Base64-encoded encrypted data with IV
 * @param key - CryptoKey for decryption
 * @returns Decrypted file as ArrayBuffer
 */
export async function decryptFile(
  encryptedData: string,
  key: CryptoKey,
): Promise<ArrayBuffer> {
  try {
    const decrypted = await decrypt(key, encryptedData);
    // Convert base64 back to ArrayBuffer
    const arrayBuffer = base64ToArrayBuffer(decrypted);
    return arrayBuffer;
  } catch (error) {
    console.error("Failed to decrypt file:", error);
    throw new Error(
      "File decryption failed - key may be invalid or data corrupted",
    );
  }
}

/**
 * Convert ArrayBuffer to base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert base64 string to ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}
