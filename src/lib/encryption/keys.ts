/**
 * Unified key management abstraction.
 *
 * Dispatches to RSA-only (legacy) or hybrid RSA + ML-KEM based on available keys.
 * All consumer files should import from this module instead of rsa.ts directly.
 *
 * Key modes:
 * - 'rsa-only': Legacy users — RSA-4096 only (existing behavior, no KEM keys)
 * - 'hybrid':   New users — RSA-4096 + ML-KEM-768 (post-quantum secure)
 */

import {
  KeyPair as RsaKeyPair,
  encrypt as rsaEncrypt,
  decrypt as rsaDecrypt,
  keyToPEM,
  pemToKey,
  prepareKeys as rsaPrepareKeys,
  importPublicKeySpki,
} from "./rsa";
import { encryptString } from "./passphrase";
import {
  generateKemKeyPair,
  serializeKemKey,
  deserializeKemKey,
  isKemKey,
} from "./kem";
import {
  hybridWrapKey,
  hybridUnwrapKey,
  isHybridWrappedKey,
} from "./hybrid";

export type KeyMode = "rsa-only" | "hybrid";

// Re-export for backward compat during migration
export { keyToPEM, pemToKey, importPublicKeySpki };

/**
 * Detect the wrapping mode from a wrapped key string.
 */
export function detectWrappedKeyMode(wrappedKey: string): KeyMode {
  return isHybridWrappedKey(wrappedKey) ? "hybrid" : "rsa-only";
}

/**
 * Import a KEM public key from its serialized form, or return null.
 */
export function importKemPublicKey(
  serialized: string | null | undefined,
): Uint8Array | null {
  if (!serialized || !isKemKey(serialized)) return null;
  return deserializeKemKey(serialized);
}

/**
 * Wrap an AES key for a recipient.
 *
 * If the recipient has a KEM public key → hybrid wrapping.
 * Otherwise → RSA-only wrapping (legacy).
 *
 * @param rsaPublicKeyPEM - Recipient's RSA public key PEM string
 * @param kemPublicKey    - Recipient's serialized KEM key ("mlkem768:...") or null
 * @param aesKey          - The AES key string to wrap
 */
export async function wrapKey(
  rsaPublicKeyPEM: string,
  kemPublicKey: string | null | undefined,
  aesKey: string,
): Promise<string> {
  const rsaPub = await pemToKey(rsaPublicKeyPEM, false);

  if (kemPublicKey && isKemKey(kemPublicKey)) {
    const kemPub = deserializeKemKey(kemPublicKey);
    return hybridWrapKey(rsaPub, kemPub, aesKey);
  }

  // RSA-only fallback
  return rsaEncrypt(rsaPub, aesKey);
}

/**
 * Unwrap an AES key. Auto-detects format:
 * - "hybrid1:" prefix → hybrid unwrap (requires both keys)
 * - Otherwise → RSA-only unwrap
 *
 * @param rsaPrivateKey  - WebCrypto RSA-OAEP private key
 * @param kemSecretKey   - Raw KEM secret key bytes, or null for RSA-only keys
 * @param wrappedKey     - The wrapped key string
 */
export async function unwrapKey(
  rsaPrivateKey: CryptoKey,
  kemSecretKey: Uint8Array | null,
  wrappedKey: string,
): Promise<string> {
  if (isHybridWrappedKey(wrappedKey)) {
    if (!kemSecretKey) {
      throw new Error(
        "Hybrid wrapped key requires KEM secret key for unwrapping",
      );
    }
    return hybridUnwrapKey(rsaPrivateKey, kemSecretKey, wrappedKey);
  }

  // RSA-only
  return rsaDecrypt(rsaPrivateKey, wrappedKey);
}

/**
 * Result of generating all keys for a user.
 */
export interface GeneratedKeys {
  rsaPublicKeyPEM: string;
  encryptedRsaPrivateKey: string;
  kemPublicKey: string | null;
  encryptedKemSecretKey: string | null;
  mode: KeyMode;
}

/**
 * Generate all encryption keys for a new user.
 *
 * - 'hybrid' (default): RSA-4096 + ML-KEM-768 keypairs, both private keys encrypted
 * - 'rsa-only': RSA-4096 only (legacy mode)
 *
 * @param passphrase - Passphrase for encrypting private keys
 * @param mode       - 'hybrid' (default) or 'rsa-only'
 */
export async function generateKeys(
  passphrase: string,
  mode: KeyMode = "hybrid",
): Promise<GeneratedKeys> {
  // Always generate RSA keys
  const { publicKeyPEM, encryptedPrivateKey } =
    await rsaPrepareKeys(passphrase);

  if (mode === "rsa-only") {
    return {
      rsaPublicKeyPEM: publicKeyPEM,
      encryptedRsaPrivateKey: encryptedPrivateKey,
      kemPublicKey: null,
      encryptedKemSecretKey: null,
      mode: "rsa-only",
    };
  }

  // Generate ML-KEM-768 keypair
  const { publicKey: kemPub, secretKey: kemSec } = await generateKemKeyPair();
  const kemPublicKeySerialized = serializeKemKey(kemPub);
  const kemSecretKeySerialized = serializeKemKey(kemSec);

  // Encrypt the KEM secret key with the same passphrase
  const encryptedKemSecretKey = await encryptString(
    kemSecretKeySerialized,
    passphrase,
  );

  return {
    rsaPublicKeyPEM: publicKeyPEM,
    encryptedRsaPrivateKey: encryptedPrivateKey,
    kemPublicKey: kemPublicKeySerialized,
    encryptedKemSecretKey,
    mode: "hybrid",
  };
}

/**
 * Extended KeyPair that supports both RSA and optional ML-KEM keys.
 * Drop-in replacement for the original RSA-only KeyPair class.
 */
export class HybridKeyPair {
  rsaPublicKey: CryptoKey | null;
  rsaPrivateKey: CryptoKey | null;
  kemPublicKey: Uint8Array | null;
  kemSecretKey: Uint8Array | null;
  mode: KeyMode;

  constructor(
    rsaPublicKey: CryptoKey | null = null,
    rsaPrivateKey: CryptoKey | null = null,
    kemPublicKey: Uint8Array | null = null,
    kemSecretKey: Uint8Array | null = null,
  ) {
    this.rsaPublicKey = rsaPublicKey;
    this.rsaPrivateKey = rsaPrivateKey;
    this.kemPublicKey = kemPublicKey;
    this.kemSecretKey = kemSecretKey;
    this.mode =
      kemPublicKey || kemSecretKey ? "hybrid" : "rsa-only";
  }

  /**
   * Set RSA keys (backward-compatible with old KeyPair.set()).
   * Optionally set KEM keys too.
   */
  set(
    publicKey: CryptoKey | null = null,
    privateKey: CryptoKey | null = null,
    kemPublicKey: Uint8Array | null = null,
    kemSecretKey: Uint8Array | null = null,
  ) {
    this.rsaPublicKey = publicKey;
    this.rsaPrivateKey = privateKey;
    this.kemPublicKey = kemPublicKey;
    this.kemSecretKey = kemSecretKey;
    this.mode =
      kemPublicKey || kemSecretKey ? "hybrid" : "rsa-only";
  }

  /**
   * Wrap (encrypt) an AES key using available keys.
   * Uses hybrid if KEM keys are available, RSA-only otherwise.
   */
  async encrypt(data: string): Promise<string> {
    if (!this.rsaPublicKey) {
      throw new Error("Public key not set");
    }

    if (this.kemPublicKey) {
      return hybridWrapKey(this.rsaPublicKey, this.kemPublicKey, data);
    }

    return rsaEncrypt(this.rsaPublicKey, data);
  }

  /**
   * Unwrap (decrypt) an AES key. Auto-detects hybrid vs RSA-only format.
   */
  async decrypt(encryptedData: string): Promise<string> {
    if (!this.rsaPrivateKey) {
      throw new Error("Private key not set");
    }

    return unwrapKey(this.rsaPrivateKey, this.kemSecretKey, encryptedData);
  }

  isReady(): boolean {
    return this.rsaPublicKey !== null && this.rsaPrivateKey !== null;
  }

  destroy() {
    this.rsaPublicKey = null;
    this.rsaPrivateKey = null;
    this.kemPublicKey = null;
    this.kemSecretKey = null;
    this.mode = "rsa-only";
  }

  // Backward compat: expose as publicKey/privateKey for code that reads keyPair.publicKey
  get publicKey(): CryptoKey | null {
    return this.rsaPublicKey;
  }

  get privateKey(): CryptoKey | null {
    return this.rsaPrivateKey;
  }
}
