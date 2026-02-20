/**
 * Recovery Key System for Zero-Knowledge Encryption
 *
 * Generates a human-readable recovery key that can be used to recover
 * access to encrypted data if the passphrase or passkey is lost.
 */

const crypto = globalThis.crypto;

// Base32 alphabet (Crockford's Base32 - excludes I, L, O, U to avoid confusion)
const BASE32_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Generate a cryptographically secure recovery key
 * Format: XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX (40 chars = 200 bits of entropy)
 */
export function generateRecoveryKey(): string {
  // Generate 25 bytes (200 bits) of random data
  const bytes = crypto.getRandomValues(new Uint8Array(25));

  // Convert to base32
  let base32 = "";
  let buffer = 0;
  let bitsInBuffer = 0;

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bitsInBuffer += 8;

    while (bitsInBuffer >= 5) {
      bitsInBuffer -= 5;
      const index = (buffer >> bitsInBuffer) & 0x1f;
      base32 += BASE32_ALPHABET[index];
    }
  }

  // Pad to 40 characters
  base32 = base32.padEnd(40, "0");

  // Format as XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX
  return base32.match(/.{1,4}/g)?.join("-") || base32;
}

/**
 * Validate recovery key format
 */
export function validateRecoveryKeyFormat(key: string): boolean {
  // Remove dashes and spaces
  const cleanKey = key.replace(/[-\s]/g, "").toUpperCase();

  // Should be exactly 40 characters
  if (cleanKey.length !== 40) {
    return false;
  }

  // Should only contain valid base32 characters
  for (const char of cleanKey) {
    if (!BASE32_ALPHABET.includes(char)) {
      return false;
    }
  }

  return true;
}

/**
 * Normalize recovery key (remove formatting, uppercase)
 */
export function normalizeRecoveryKey(key: string): string {
  return key.replace(/[-\s]/g, "").toUpperCase();
}

/**
 * Derive an AES-256 key from the recovery key using HKDF
 */
async function deriveKeyFromRecoveryKey(
  recoveryKey: string,
): Promise<CryptoKey> {
  const normalizedKey = normalizeRecoveryKey(recoveryKey);
  const encoder = new TextEncoder();
  const keyMaterial = encoder.encode(normalizedKey);

  // Import the recovery key as key material for HKDF
  const baseKey = await crypto.subtle.importKey(
    "raw",
    keyMaterial,
    { name: "HKDF" },
    false,
    ["deriveKey"],
  );

  // Use a fixed salt for recovery key derivation
  // This is acceptable since the recovery key itself has sufficient entropy
  const salt = encoder.encode("mediqom-recovery-key-v1");
  const info = encoder.encode("private-key-encryption");

  // Derive the AES-256-GCM key
  return await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: salt,
      info: info,
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Encrypt the private key with the recovery key
 * Returns base64-encoded encrypted data (IV + ciphertext)
 */
export async function encryptWithRecoveryKey(
  privateKeyPEM: string,
  recoveryKey: string,
): Promise<string> {
  if (!validateRecoveryKeyFormat(recoveryKey)) {
    throw new Error("Invalid recovery key format");
  }

  const encoder = new TextEncoder();
  const plaintext = encoder.encode(privateKeyPEM);

  // Derive encryption key from recovery key
  const aesKey = await deriveKeyFromRecoveryKey(recoveryKey);

  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    aesKey,
    plaintext,
  );

  // Combine IV + ciphertext
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  // Return as base64
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt the private key using the recovery key
 * Returns the decrypted PEM string
 */
export async function recoverPrivateKey(
  encryptedData: string,
  recoveryKey: string,
): Promise<string> {
  if (!validateRecoveryKeyFormat(recoveryKey)) {
    throw new Error("Invalid recovery key format");
  }

  // Decode base64
  const combined = new Uint8Array(
    atob(encryptedData)
      .split("")
      .map((char) => char.charCodeAt(0)),
  );

  // Extract IV and ciphertext
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  // Derive decryption key
  const aesKey = await deriveKeyFromRecoveryKey(recoveryKey);

  // Decrypt
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv },
    aesKey,
    ciphertext,
  );

  return new TextDecoder().decode(plaintext);
}

/**
 * Create a hash of the recovery key for verification
 * This can be stored server-side to verify recovery attempts
 */
export async function hashRecoveryKey(recoveryKey: string): Promise<string> {
  const normalizedKey = normalizeRecoveryKey(recoveryKey);
  const encoder = new TextEncoder();
  const data = encoder.encode(normalizedKey + "mediqom-recovery-hash-v1");

  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);

  return btoa(String.fromCharCode(...hashArray));
}

/**
 * Verify a recovery key against a stored hash
 */
export async function verifyRecoveryKeyHash(
  recoveryKey: string,
  storedHash: string,
): Promise<boolean> {
  const computedHash = await hashRecoveryKey(recoveryKey);
  return computedHash === storedHash;
}

export type RecoveryKeyData = {
  recoveryKey: string;
  recoveryEncryptedKey: string;
  recoveryKeyHash: string;
};

/**
 * Generate complete recovery key data for a private key
 * Returns the recovery key (to show user), encrypted private key, and hash
 */
export async function generateRecoveryData(
  privateKeyPEM: string,
): Promise<RecoveryKeyData> {
  const recoveryKey = generateRecoveryKey();
  const recoveryEncryptedKey = await encryptWithRecoveryKey(
    privateKeyPEM,
    recoveryKey,
  );
  const recoveryKeyHash = await hashRecoveryKey(recoveryKey);

  return {
    recoveryKey,
    recoveryEncryptedKey,
    recoveryKeyHash,
  };
}
