const crypto = globalThis.crypto;

// Version markers for iteration count migration
const VERSION_V2 = new Uint8Array([0x00, 0x01]);
const LEGACY_ITERATIONS = 100000;
const CURRENT_ITERATIONS = 300000;

// encrypt string with passphrase
export async function encryptString(
  message: string,
  passphrase: string,
): Promise<string> {
  // Convert message and passphrase to ArrayBuffer
  const encoder = new TextEncoder();
  const encodedMessage = encoder.encode(message);
  const encodedPassphrase = encoder.encode(passphrase);

  // Derive a key from the passphrase using PBKDF2
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encodedPassphrase,
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: CURRENT_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );

  // Encrypt the message using AES-GCM
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    derivedKey,
    encodedMessage,
  );

  // Prepend version marker, then salt, IV, ciphertext
  const encryptedBytes = new Uint8Array(encrypted);
  const combinedData = new Uint8Array(
    VERSION_V2.length + salt.length + iv.length + encryptedBytes.length,
  );
  combinedData.set(VERSION_V2);
  combinedData.set(salt, VERSION_V2.length);
  combinedData.set(iv, VERSION_V2.length + salt.length);
  combinedData.set(encryptedBytes, VERSION_V2.length + salt.length + iv.length);

  return btoa(String.fromCharCode(...combinedData));
}

export async function decryptString(
  encryptedData: string,
  passphrase: string,
): Promise<string> {
  // Decode the Base64 input back to a Uint8Array
  const combinedData = new Uint8Array(
    atob(encryptedData)
      .split("")
      .map((char) => char.charCodeAt(0)),
  );

  // Detect version: if first 2 bytes are [0x00, 0x01] → v2 (300k), otherwise legacy (100k)
  let iterations: number;
  let offset: number;

  if (
    combinedData.length > 2 &&
    combinedData[0] === VERSION_V2[0] &&
    combinedData[1] === VERSION_V2[1]
  ) {
    iterations = CURRENT_ITERATIONS;
    offset = 2;
  } else {
    iterations = LEGACY_ITERATIONS;
    offset = 0;
  }

  // Extract salt, IV, and the actual encrypted message
  const salt = combinedData.slice(offset, offset + 16);
  const iv = combinedData.slice(offset + 16, offset + 28);
  const encryptedMessage = combinedData.slice(offset + 28);

  // Convert passphrase to ArrayBuffer
  const encoder = new TextEncoder();
  const encodedPassphrase = encoder.encode(passphrase);

  // Derive a key from the passphrase using PBKDF2
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encodedPassphrase,
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );

  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );

  // Decrypt the message using AES-GCM
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    derivedKey,
    encryptedMessage,
  );

  // Decode the decrypted ArrayBuffer to a string
  return new TextDecoder().decode(decrypted);
}

const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";
const SPECIAL = ".,:;-_()=*!@#$%";

/**
 * Generate a cryptographically secure passphrase with unbiased character selection.
 * Uses rejection sampling to avoid modulo bias and Fisher-Yates for shuffling.
 */
export function generatePassphrase(length: number = 20): string {
  const pools = [LOWERCASE, UPPERCASE, DIGITS, SPECIAL];
  const allChars = pools.join("");

  if (length < pools.length) {
    throw new Error(`Passphrase length must be at least ${pools.length}`);
  }

  // Ensure at least one character from each pool
  const result: string[] = [];
  for (const pool of pools) {
    result.push(pool[uniformRandom(pool.length)]);
  }

  // Fill remaining with characters from the full pool
  for (let i = pools.length; i < length; i++) {
    result.push(allChars[uniformRandom(allChars.length)]);
  }

  // Fisher-Yates shuffle
  for (let i = result.length - 1; i > 0; i--) {
    const j = uniformRandom(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result.join("");
}

/**
 * Rejection sampling for unbiased random integer in [0, max).
 * Rejects values >= floor(256/max)*max to eliminate modulo bias.
 */
function uniformRandom(max: number): number {
  const limit = Math.floor(256 / max) * max;
  let value: number;
  do {
    value = crypto.getRandomValues(new Uint8Array(1))[0];
  } while (value >= limit);
  return value % max;
}
