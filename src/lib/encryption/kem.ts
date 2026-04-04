/**
 * ML-KEM-768 (FIPS 203) wrapper for post-quantum key encapsulation.
 *
 * Uses the `mlkem` npm package — pure TypeScript, browser + Node.js compatible.
 * ML-KEM-768 provides ~192-bit classical security and is the NIST-recommended
 * parameter set for general use.
 */
import { MlKem768 } from "mlkem";

const KEM_PREFIX = "mlkem768:";

/**
 * Generate a new ML-KEM-768 keypair.
 * Returns raw Uint8Array keys — serialize with `serializeKemKey()` for storage.
 */
export async function generateKemKeyPair(): Promise<{
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}> {
  const kem = new MlKem768();
  const [publicKey, secretKey] = await kem.generateKeyPair();
  return { publicKey, secretKey };
}

/**
 * Encapsulate: produce a ciphertext + shared secret using the recipient's public key.
 * The ciphertext is sent to the recipient; the shared secret is used locally.
 */
export async function kemEncapsulate(publicKey: Uint8Array): Promise<{
  ciphertext: Uint8Array;
  sharedSecret: Uint8Array;
}> {
  const kem = new MlKem768();
  const [ciphertext, sharedSecret] = await kem.encap(publicKey);
  return { ciphertext, sharedSecret };
}

/**
 * Decapsulate: recover the shared secret from a ciphertext using the secret key.
 */
export async function kemDecapsulate(
  ciphertext: Uint8Array,
  secretKey: Uint8Array,
): Promise<Uint8Array> {
  const kem = new MlKem768();
  return await kem.decap(ciphertext, secretKey);
}

/**
 * Serialize a KEM key (public or secret) to a prefixed Base64 string for storage.
 * Format: "mlkem768:<base64>"
 */
export function serializeKemKey(key: Uint8Array): string {
  return KEM_PREFIX + btoa(String.fromCharCode(...key));
}

/**
 * Deserialize a prefixed KEM key string back to Uint8Array.
 * Throws if the prefix is missing or invalid.
 */
export function deserializeKemKey(s: string): Uint8Array {
  if (!s.startsWith(KEM_PREFIX)) {
    throw new Error(`Invalid KEM key format: expected "${KEM_PREFIX}" prefix`);
  }
  const b64 = s.slice(KEM_PREFIX.length);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/**
 * Check whether a string looks like a serialized ML-KEM key.
 */
export function isKemKey(s: string): boolean {
  return s.startsWith(KEM_PREFIX);
}
