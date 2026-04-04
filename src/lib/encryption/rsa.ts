import { encryptString } from "./passphrase";
import { str2ab } from "./utils";
const crypto = globalThis.crypto;

export class KeyPair {
  publicKey: CryptoKey | null;
  privateKey: CryptoKey | null;

  constructor(
    publicKey: CryptoKey | null = null,
    privateKey: CryptoKey | null = null,
  ) {
    this.publicKey = publicKey;
    this.privateKey = privateKey;
  }
  set(publicKey: CryptoKey | null = null, privateKey: CryptoKey | null = null) {
    this.publicKey = publicKey;
    this.privateKey = privateKey;
  }

  encrypt(data: string): Promise<string> {
    if (!this.publicKey) {
      throw new Error("Public key not set");
    }
    return encrypt(this.publicKey, data);
  }
  decrypt(encryptedData: string): Promise<string> {
    if (!this.privateKey) {
      throw new Error("Private key not set");
    }
    return decrypt(this.privateKey, encryptedData);
  }
  isReady(): boolean {
    return this.publicKey !== null && this.privateKey !== null;
  }
  destroy() {
    this.publicKey = null;
    this.privateKey = null;
  }
}

// Generate a key pair (public/private) for encryption
async function generateKeyPair(): Promise<CryptoKeyPair> {
  return await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 4096, // Key size in bits
      publicExponent: new Uint8Array([1, 0, 1]), // Common exponent (65537)
      hash: "SHA-256",
    },
    true, // Extractable keys
    ["encrypt", "decrypt"],
  );
}

// Encrypt data using a public key
export async function encrypt(
  publicKey: CryptoKey,
  data: string,
): Promise<string> {
  const encodedData = new TextEncoder().encode(data);
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "RSA-OAEP",
    },
    publicKey,
    encodedData,
  );
  return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
}

// Decrypt data using a private key
export async function decrypt(
  privateKey: CryptoKey,
  encryptedData: string,
): Promise<string> {
  const decodedData = new Uint8Array(
    atob(encryptedData)
      .split("")
      .map((char) => char.charCodeAt(0)),
  );
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "RSA-OAEP",
    },
    privateKey,
    decodedData,
  );
  return new TextDecoder().decode(decrypted);
}

// Convert a public/private key to a PEM string format
export async function keyToPEM(
  key: CryptoKey,
  isPrivate: boolean,
): Promise<string> {
  const exported = await crypto.subtle.exportKey(
    isPrivate ? "pkcs8" : "spki",
    key,
  );
  const exportedAsString = String.fromCharCode(...new Uint8Array(exported));
  const exportedAsBase64 = btoa(exportedAsString);
  const type = isPrivate ? "PRIVATE" : "PUBLIC";
  return `-----BEGIN ${type} KEY-----\n${exportedAsBase64.match(/.{1,64}/g)?.join("\n")}\n-----END ${type} KEY-----`;
}

// Convert a PEM string to a CryptoKey object
export async function pemToKey(
  pem: string,
  isPrivate: boolean = false,
): Promise<CryptoKey> {
  const pemHeader = isPrivate
    ? "-----BEGIN PRIVATE KEY-----"
    : "-----BEGIN PUBLIC KEY-----";
  const pemFooter = isPrivate
    ? "-----END PRIVATE KEY-----"
    : "-----END PUBLIC KEY-----";
  const pemContents = pem
    .replace(pemHeader, "")
    .replace(pemFooter, "")
    .replace(/\n/g, "");
  const binaryDer = Uint8Array.from(atob(pemContents), (char) =>
    char.charCodeAt(0),
  );
  return await crypto.subtle.importKey(
    isPrivate ? "pkcs8" : "spki",
    binaryDer.buffer,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    true,
    isPrivate ? ["decrypt"] : ["encrypt"],
  );
}

export async function prepareKeys(
  passphrase: string,
): Promise<{ publicKeyPEM: string; encryptedPrivateKey: string }> {
  const keyPair = await generateKeyPair();
  const publicKeyPEM = await keyToPEM(keyPair.publicKey, false);
  const privateKeyPEM = await keyToPEM(keyPair.privateKey, true);
  const encryptedPrivateKey = await encryptString(privateKeyPEM, passphrase);
  return { publicKeyPEM, encryptedPrivateKey };
}

export async function importPublicKeySpki(pem: string): Promise<CryptoKey> {
  const pemHeader = "-----BEGIN PUBLIC KEY-----";
  const pemFooter = "-----END PUBLIC KEY-----";
  const pemContents = pem
    .replace(/(\r\n|\r|\n)/g, "")
    .replace(pemHeader, "")
    .replace(pemFooter, "")
    .trim();

  // base64 decode the string to get the binary data
  const binaryDerString = window.atob(pemContents);
  // convert from a binary string to an ArrayBuffer
  const binaryDer = str2ab(binaryDerString);

  return await window.crypto.subtle.importKey(
    "spki",
    binaryDer,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    true,
    ["encrypt"],
  );
}
