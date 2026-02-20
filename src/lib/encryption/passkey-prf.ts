/**
 * Passkey PRF (Pseudo-Random Function) Key Derivation
 *
 * Uses the WebAuthn PRF extension to derive encryption keys from passkey
 * authentication. This provides a secure, biometric-backed key derivation
 * that doesn't require users to remember a passphrase.
 *
 * Browser Support:
 * - Chrome 108+: Full support
 * - Safari 16.6+: Full support
 * - Edge 108+: Full support
 * - Firefox: Partial (behind flag)
 */

import type {
  PublicKeyCredentialCreationOptionsWithPRF,
  PublicKeyCredentialRequestOptionsWithPRF,
  PublicKeyCredentialWithPRF,
} from "../../types/webauthn-prf";

const crypto = globalThis.crypto;

// Salt used for PRF input - unique per application
const PRF_SALT_PREFIX = "mediqom-passkey-prf-v1";

export interface PasskeyPRFSupport {
  webauthnSupported: boolean;
  prfSupported: boolean;
  platformAuthenticatorAvailable: boolean;
}

export interface PasskeyCredential {
  credentialId: string; // Base64 encoded
  prfSalt: string; // Base64 encoded salt used for PRF
  userHandle: string; // Base64 encoded user handle
}

export interface PasskeyAuthResult {
  credential: PasskeyCredential;
  derivedKey: CryptoKey;
}

/**
 * Check if the browser supports Passkey PRF
 */
export async function checkPasskeyPRFSupport(): Promise<PasskeyPRFSupport> {
  const result: PasskeyPRFSupport = {
    webauthnSupported: false,
    prfSupported: false,
    platformAuthenticatorAvailable: false,
  };

  // Check basic WebAuthn support
  if (!window.PublicKeyCredential) {
    return result;
  }
  result.webauthnSupported = true;

  // Check platform authenticator availability (Face ID, Touch ID, Windows Hello)
  try {
    result.platformAuthenticatorAvailable =
      await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    // Method not available in some browsers
    result.platformAuthenticatorAvailable = false;
  }

  // Check PRF support
  // Note: PRF is an authenticator-level extension, not a browser capability.
  // getClientCapabilities() doesn't report PRF support - it's verified during credential creation.
  // Modern platform authenticators (macOS, Windows Hello, iOS, Android) support PRF.
  // We assume PRF is supported if a platform authenticator is available.
  // Actual PRF support will be verified when creating/using the credential.
  if (result.platformAuthenticatorAvailable) {
    result.prfSupported = true;
  }

  return result;
}

/**
 * Generate a random PRF salt
 */
function generatePRFSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

/**
 * Create the PRF input from salt
 */
function createPRFInput(salt: Uint8Array): Uint8Array {
  const encoder = new TextEncoder();
  const prefix = encoder.encode(PRF_SALT_PREFIX);

  const input = new Uint8Array(prefix.length + salt.length);
  input.set(prefix);
  input.set(salt, prefix.length);

  return input;
}

/**
 * Derive an AES-256 key from PRF output using HKDF
 */
async function deriveKeyFromPRF(prfOutput: ArrayBuffer): Promise<CryptoKey> {
  // Import PRF output as key material
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    prfOutput,
    { name: "HKDF" },
    false,
    ["deriveKey"],
  );

  const encoder = new TextEncoder();
  const salt = encoder.encode("mediqom-prf-derived-key-v1");
  const info = encoder.encode("private-key-encryption");

  // Derive AES-256-GCM key
  return await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: salt,
      info: info,
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Convert ArrayBuffer or Uint8Array to Base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const uint8Array =
    buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return btoa(String.fromCharCode(...uint8Array));
}

/**
 * Convert Base64 string to Uint8Array
 */
function base64ToUint8Array(base64: string): Uint8Array {
  return new Uint8Array(
    atob(base64)
      .split("")
      .map((c) => c.charCodeAt(0)),
  );
}

/**
 * Create a new passkey with PRF support
 */
export async function createPasskeyWithPRF(
  userId: string,
  userEmail: string,
  userName: string,
): Promise<PasskeyAuthResult> {
  const support = await checkPasskeyPRFSupport();
  if (!support.webauthnSupported) {
    throw new Error("WebAuthn is not supported in this browser");
  }

  // Generate challenge and PRF salt
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const prfSalt = generatePRFSalt();
  const prfInput = createPRFInput(prfSalt);

  // Create user handle
  const userHandle = new TextEncoder().encode(userId);

  const createOptions: PublicKeyCredentialCreationOptionsWithPRF = {
    challenge: challenge,
    rp: {
      name: "Mediqom",
      id: window.location.hostname,
    },
    user: {
      id: userHandle,
      name: userEmail,
      displayName: userName,
    },
    pubKeyCredParams: [
      { type: "public-key", alg: -7 }, // ES256
      { type: "public-key", alg: -257 }, // RS256
    ],
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      userVerification: "required",
      residentKey: "required",
    },
    timeout: 60000,
    attestation: "none",
    extensions: {
      prf: {
        eval: {
          first: prfInput,
        },
      },
    },
  };

  // Create the credential
  const credential = (await navigator.credentials.create({
    publicKey: createOptions,
  })) as PublicKeyCredentialWithPRF | null;

  if (!credential) {
    throw new Error("Failed to create passkey");
  }

  // Check if PRF was enabled
  const extensionResults = credential.getClientExtensionResults();
  if (!extensionResults.prf?.enabled) {
    throw new Error("PRF extension not supported by this authenticator");
  }

  // Get PRF output
  const prfOutput = extensionResults.prf.results?.first;
  if (!prfOutput) {
    throw new Error("PRF output not available");
  }

  // Derive encryption key from PRF output
  const derivedKey = await deriveKeyFromPRF(prfOutput);

  return {
    credential: {
      credentialId: arrayBufferToBase64(credential.rawId),
      prfSalt: arrayBufferToBase64(prfSalt),
      userHandle: arrayBufferToBase64(userHandle),
    },
    derivedKey,
  };
}

/**
 * Authenticate with an existing passkey and derive the encryption key
 */
export async function authenticateWithPasskeyPRF(
  credentialId: string,
  prfSalt: string,
): Promise<CryptoKey> {
  const support = await checkPasskeyPRFSupport();
  if (!support.webauthnSupported) {
    throw new Error("WebAuthn is not supported in this browser");
  }

  // Generate challenge
  const challenge = crypto.getRandomValues(new Uint8Array(32));

  // Reconstruct PRF input from stored salt
  const salt = base64ToUint8Array(prfSalt);
  const prfInput = createPRFInput(salt);

  const requestOptions: PublicKeyCredentialRequestOptionsWithPRF = {
    challenge: challenge,
    rpId: window.location.hostname,
    allowCredentials: [
      {
        type: "public-key",
        id: base64ToUint8Array(credentialId),
      },
    ],
    userVerification: "required",
    timeout: 60000,
    extensions: {
      prf: {
        eval: {
          first: prfInput,
        },
      },
    },
  };

  // Authenticate with the credential
  const credential = (await navigator.credentials.get({
    publicKey: requestOptions,
  })) as PublicKeyCredentialWithPRF | null;

  if (!credential) {
    throw new Error("Failed to authenticate with passkey");
  }

  // Get PRF output
  const extensionResults = credential.getClientExtensionResults();
  const prfOutput = extensionResults.prf?.results?.first;

  if (!prfOutput) {
    throw new Error(
      "PRF output not available - authenticator may not support PRF",
    );
  }

  // Derive encryption key from PRF output
  return await deriveKeyFromPRF(prfOutput);
}

/**
 * Authenticate with any available passkey (discoverable credential)
 * This is used when the credential ID is not known
 */
export async function authenticateWithDiscoverablePasskey(
  storedCredentials: Array<{ credentialId: string; prfSalt: string }>,
): Promise<{ derivedKey: CryptoKey; credentialId: string }> {
  const support = await checkPasskeyPRFSupport();
  if (!support.webauthnSupported) {
    throw new Error("WebAuthn is not supported in this browser");
  }

  // Generate challenge
  const challenge = crypto.getRandomValues(new Uint8Array(32));

  // Build evalByCredential map for all stored credentials
  const evalByCredential: Record<string, { first: BufferSource }> = {};
  const saltMap = new Map<string, Uint8Array>();

  for (const cred of storedCredentials) {
    const salt = base64ToUint8Array(cred.prfSalt);
    const prfInput = createPRFInput(salt);
    evalByCredential[cred.credentialId] = { first: prfInput };
    saltMap.set(cred.credentialId, salt);
  }

  const requestOptions: PublicKeyCredentialRequestOptionsWithPRF = {
    challenge: challenge,
    rpId: window.location.hostname,
    allowCredentials: storedCredentials.map((cred) => ({
      type: "public-key" as const,
      id: base64ToUint8Array(cred.credentialId),
    })),
    userVerification: "required",
    timeout: 60000,
    extensions: {
      prf: {
        evalByCredential,
      },
    },
  };

  // Authenticate
  const credential = (await navigator.credentials.get({
    publicKey: requestOptions,
  })) as PublicKeyCredentialWithPRF | null;

  if (!credential) {
    throw new Error("Failed to authenticate with passkey");
  }

  const usedCredentialId = arrayBufferToBase64(credential.rawId);

  // Get PRF output
  const extensionResults = credential.getClientExtensionResults();
  const prfOutput = extensionResults.prf?.results?.first;

  if (!prfOutput) {
    throw new Error("PRF output not available");
  }

  // Derive encryption key from PRF output
  const derivedKey = await deriveKeyFromPRF(prfOutput);

  return { derivedKey, credentialId: usedCredentialId };
}

/**
 * Encrypt the private key using a PRF-derived key
 */
export async function encryptWithPRFKey(
  privateKeyPEM: string,
  prfDerivedKey: CryptoKey,
): Promise<string> {
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(privateKeyPEM);

  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    prfDerivedKey,
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
 * Decrypt the private key using a PRF-derived key
 */
export async function decryptWithPRFKey(
  encryptedData: string,
  prfDerivedKey: CryptoKey,
): Promise<string> {
  // Decode base64
  const combined = new Uint8Array(
    atob(encryptedData)
      .split("")
      .map((char) => char.charCodeAt(0)),
  );

  // Extract IV and ciphertext
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  // Decrypt
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv },
    prfDerivedKey,
    ciphertext,
  );

  return new TextDecoder().decode(plaintext);
}

export type KeyDerivationMethod = "passphrase" | "passkey_prf";
