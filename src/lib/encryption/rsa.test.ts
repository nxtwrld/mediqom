import { describe, it, expect } from "vitest";
import {
  KeyPair,
  encrypt,
  decrypt,
  keyToPEM,
  pemToKey,
  prepareKeys,
} from "./rsa";

// Helper: generate RSA key pair using WebCrypto
async function generateTestKeyPair() {
  return await globalThis.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048, // smaller for test speed
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"],
  );
}

describe("encryption/rsa", () => {
  describe("encrypt / decrypt", () => {
    it("encrypts and decrypts a string", async () => {
      const { publicKey, privateKey } = await generateTestKeyPair();
      const message = "Hello RSA!";

      const encrypted = await encrypt(publicKey, message);
      expect(typeof encrypted).toBe("string");
      expect(encrypted).not.toBe(message);

      const decrypted = await decrypt(privateKey, encrypted);
      expect(decrypted).toBe(message);
    });

    it("produces different ciphertext each time (OAEP padding)", async () => {
      const { publicKey } = await generateTestKeyPair();
      const message = "same";

      const enc1 = await encrypt(publicKey, message);
      const enc2 = await encrypt(publicKey, message);
      expect(enc1).not.toBe(enc2);
    });

    it("fails to decrypt with wrong key", async () => {
      const kp1 = await generateTestKeyPair();
      const kp2 = await generateTestKeyPair();

      const encrypted = await encrypt(kp1.publicKey, "secret");
      await expect(decrypt(kp2.privateKey, encrypted)).rejects.toThrow();
    });
  });

  describe("KeyPair class", () => {
    it("starts with null keys", () => {
      const kp = new KeyPair();
      expect(kp.publicKey).toBeNull();
      expect(kp.privateKey).toBeNull();
      expect(kp.isReady()).toBe(false);
    });

    it("accepts keys in constructor", async () => {
      const { publicKey, privateKey } = await generateTestKeyPair();
      const kp = new KeyPair(publicKey, privateKey);
      expect(kp.isReady()).toBe(true);
    });

    it("encrypts and decrypts via instance methods", async () => {
      const { publicKey, privateKey } = await generateTestKeyPair();
      const kp = new KeyPair(publicKey, privateKey);

      const encrypted = await kp.encrypt("test data");
      const decrypted = await kp.decrypt(encrypted);
      expect(decrypted).toBe("test data");
    });

    it("throws when encrypting without public key", async () => {
      const kp = new KeyPair();
      expect(() => kp.encrypt("test")).toThrow("Public key not set");
    });

    it("throws when decrypting without private key", async () => {
      const { publicKey } = await generateTestKeyPair();
      const kp = new KeyPair(publicKey, null);
      expect(() => kp.decrypt("test")).toThrow("Private key not set");
    });

    it("set() updates keys", async () => {
      const kp = new KeyPair();
      const { publicKey, privateKey } = await generateTestKeyPair();

      kp.set(publicKey, privateKey);
      expect(kp.isReady()).toBe(true);
    });

    it("destroy() clears keys", async () => {
      const { publicKey, privateKey } = await generateTestKeyPair();
      const kp = new KeyPair(publicKey, privateKey);

      kp.destroy();
      expect(kp.publicKey).toBeNull();
      expect(kp.privateKey).toBeNull();
      expect(kp.isReady()).toBe(false);
    });
  });

  describe("keyToPEM / pemToKey roundtrip", () => {
    it("converts public key to PEM and back", async () => {
      const { publicKey } = await generateTestKeyPair();

      const pem = await keyToPEM(publicKey, false);
      expect(pem).toContain("-----BEGIN PUBLIC KEY-----");
      expect(pem).toContain("-----END PUBLIC KEY-----");

      const reimported = await pemToKey(pem, false);
      expect(reimported.type).toBe("public");

      // Verify the reimported key works
      const encrypted = await encrypt(reimported, "pem test");
      expect(typeof encrypted).toBe("string");
    });

    it("converts private key to PEM and back", async () => {
      const { publicKey, privateKey } = await generateTestKeyPair();

      const privatePem = await keyToPEM(privateKey, true);
      expect(privatePem).toContain("-----BEGIN PRIVATE KEY-----");
      expect(privatePem).toContain("-----END PRIVATE KEY-----");

      const reimported = await pemToKey(privatePem, true);
      expect(reimported.type).toBe("private");

      // Verify decrypt works with reimported key
      const encrypted = await encrypt(publicKey, "pem private test");
      const decrypted = await decrypt(reimported, encrypted);
      expect(decrypted).toBe("pem private test");
    });
  });

  describe("prepareKeys", () => {
    it("generates PEM public key and encrypted private key", async () => {
      const result = await prepareKeys("my-passphrase");

      expect(result.publicKeyPEM).toContain("-----BEGIN PUBLIC KEY-----");
      expect(typeof result.encryptedPrivateKey).toBe("string");
      // Encrypted private key should not contain PEM markers (it's encrypted)
      expect(result.encryptedPrivateKey).not.toContain("-----BEGIN");
    });
  });
});
