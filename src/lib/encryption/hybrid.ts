/**
 * Hybrid RSA-4096 + ML-KEM-768 key wrapping.
 *
 * Scheme (wrap):
 *   1. KEM encapsulate → (kemCiphertext, kemSharedSecret)
 *   2. Derive AES-256 wrapping key from kemSharedSecret via HKDF
 *   3. RSA-OAEP encrypt the AES document key → rsaCiphertext
 *   4. AES-GCM encrypt rsaCiphertext with the KEM-derived wrapping key → hybridCiphertext
 *   5. Output: "hybrid1:" + base64(kemCiphertext ∥ iv ∥ hybridCiphertext)
 *
 * An attacker must break BOTH ML-KEM and RSA to recover the AES document key.
 * The KEM shared secret protects the RSA ciphertext (via AES-GCM), and the RSA
 * ciphertext protects the actual document AES key.
 *
 * ML-KEM-768 ciphertext: 1088 bytes
 * AES-GCM IV: 12 bytes
 * RSA-4096 ciphertext after AES-GCM: 512 + 16 (GCM tag) = 528 bytes
 * Total: 1088 + 12 + 528 = 1628 bytes → ~2172 Base64 chars + prefix
 */

import { kemEncapsulate, kemDecapsulate } from "./kem";
import { encrypt as rsaEncrypt, decrypt as rsaDecrypt } from "./rsa";

const crypto = globalThis.crypto;
const HYBRID_PREFIX = "hybrid1:";
const HKDF_INFO = new TextEncoder().encode("mediqom-hybrid-v1");
const HKDF_SALT = new TextEncoder().encode("mediqom-hybrid-salt-v1");

// ML-KEM-768 ciphertext size
const KEM_CT_SIZE = 1088;
// AES-GCM IV size
const IV_SIZE = 12;

/**
 * Derive an AES-256-GCM key from the KEM shared secret using HKDF-SHA256.
 */
async function deriveWrappingKey(
  sharedSecret: Uint8Array,
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    sharedSecret.buffer as ArrayBuffer,
    { name: "HKDF" },
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: HKDF_SALT,
      info: HKDF_INFO,
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Hybrid wrap: encrypt an AES key string using BOTH RSA and ML-KEM.
 *
 * @param rsaPublicKey  - WebCrypto RSA-OAEP public key
 * @param kemPublicKey  - Raw ML-KEM-768 public key bytes
 * @param aesKey        - The AES key string (Base64-encoded) to protect
 * @returns Prefixed Base64 string: "hybrid1:<base64>"
 */
export async function hybridWrapKey(
  rsaPublicKey: CryptoKey,
  kemPublicKey: Uint8Array,
  aesKey: string,
): Promise<string> {
  // 1. KEM encapsulate
  const { ciphertext: kemCt, sharedSecret } =
    await kemEncapsulate(kemPublicKey);

  // 2. Derive AES wrapping key from KEM shared secret
  const wrappingKey = await deriveWrappingKey(sharedSecret);

  // 3. RSA-OAEP encrypt the AES document key
  const rsaCt = await rsaEncrypt(rsaPublicKey, aesKey);
  const rsaCtBytes = Uint8Array.from(atob(rsaCt), (c) => c.charCodeAt(0));

  // 4. AES-GCM encrypt the RSA ciphertext with the KEM-derived wrapping key
  const iv = crypto.getRandomValues(new Uint8Array(IV_SIZE));
  const hybridCtBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    wrappingKey,
    rsaCtBytes,
  );
  const hybridCt = new Uint8Array(hybridCtBuffer);

  // 5. Combine: kemCt ∥ iv ∥ hybridCt
  const combined = new Uint8Array(
    kemCt.length + iv.length + hybridCt.length,
  );
  combined.set(kemCt, 0);
  combined.set(iv, kemCt.length);
  combined.set(hybridCt, kemCt.length + iv.length);

  return HYBRID_PREFIX + btoa(String.fromCharCode(...combined));
}

/**
 * Hybrid unwrap: decrypt an AES key string using BOTH RSA and ML-KEM.
 *
 * @param rsaPrivateKey - WebCrypto RSA-OAEP private key
 * @param kemSecretKey  - Raw ML-KEM-768 secret key bytes
 * @param wrappedKey    - Prefixed Base64 string from hybridWrapKey()
 * @returns The original AES key string
 */
export async function hybridUnwrapKey(
  rsaPrivateKey: CryptoKey,
  kemSecretKey: Uint8Array,
  wrappedKey: string,
): Promise<string> {
  if (!wrappedKey.startsWith(HYBRID_PREFIX)) {
    throw new Error("Invalid hybrid wrapped key format");
  }

  // Parse combined bytes
  const combined = Uint8Array.from(
    atob(wrappedKey.slice(HYBRID_PREFIX.length)),
    (c) => c.charCodeAt(0),
  );

  const kemCt = combined.slice(0, KEM_CT_SIZE);
  const iv = combined.slice(KEM_CT_SIZE, KEM_CT_SIZE + IV_SIZE);
  const hybridCt = combined.slice(KEM_CT_SIZE + IV_SIZE);

  // 1. KEM decapsulate → shared secret
  const sharedSecret = await kemDecapsulate(kemCt, kemSecretKey);

  // 2. Derive AES wrapping key
  const wrappingKey = await deriveWrappingKey(sharedSecret);

  // 3. AES-GCM decrypt → RSA ciphertext bytes
  const rsaCtBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    wrappingKey,
    hybridCt,
  );
  const rsaCtB64 = btoa(
    String.fromCharCode(...new Uint8Array(rsaCtBuffer)),
  );

  // 4. RSA-OAEP decrypt → original AES key
  return rsaDecrypt(rsaPrivateKey, rsaCtB64);
}

/**
 * Check if a wrapped key string is in hybrid format.
 */
export function isHybridWrappedKey(wrappedKey: string): boolean {
  return wrappedKey.startsWith(HYBRID_PREFIX);
}
