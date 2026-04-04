import { describe, it, expect } from "vitest";
import {
  wrapKey,
  unwrapKey,
  detectWrappedKeyMode,
  importKemPublicKey,
  generateKeys,
  HybridKeyPair,
  keyToPEM,
  pemToKey,
} from "./keys";
import { generateKemKeyPair, serializeKemKey } from "./kem";

const crypto = globalThis.crypto;

async function generateRsaKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048, // Smaller for faster tests
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"],
  );
}

describe("keys.ts — unified key management", () => {
  describe("wrapKey / unwrapKey", () => {
    it("RSA-only wrap/unwrap when kemPublicKey is null", async () => {
      const rsa = await generateRsaKeyPair();
      const rsaPubPEM = await keyToPEM(rsa.publicKey, false);

      const original = "dGVzdC1hZXMta2V5"; // test AES key

      const wrapped = await wrapKey(rsaPubPEM, null, original);
      expect(detectWrappedKeyMode(wrapped)).toBe("rsa-only");

      const unwrapped = await unwrapKey(rsa.privateKey, null, wrapped);
      expect(unwrapped).toBe(original);
    });

    it("hybrid wrap/unwrap when kemPublicKey is provided", async () => {
      const rsa = await generateRsaKeyPair();
      const rsaPubPEM = await keyToPEM(rsa.publicKey, false);
      const kem = await generateKemKeyPair();
      const kemPubStr = serializeKemKey(kem.publicKey);

      const original = "dGVzdC1hZXMta2V5";

      const wrapped = await wrapKey(rsaPubPEM, kemPubStr, original);
      expect(detectWrappedKeyMode(wrapped)).toBe("hybrid");

      const unwrapped = await unwrapKey(rsa.privateKey, kem.secretKey, wrapped);
      expect(unwrapped).toBe(original);
    });

    it("hybrid-wrapped key requires KEM secret for unwrap", async () => {
      const rsa = await generateRsaKeyPair();
      const rsaPubPEM = await keyToPEM(rsa.publicKey, false);
      const kem = await generateKemKeyPair();
      const kemPubStr = serializeKemKey(kem.publicKey);

      const wrapped = await wrapKey(rsaPubPEM, kemPubStr, "test");

      await expect(unwrapKey(rsa.privateKey, null, wrapped)).rejects.toThrow(
        "KEM secret key",
      );
    });

    it("RSA-only wrapped key ignores kemSecretKey", async () => {
      const rsa = await generateRsaKeyPair();
      const rsaPubPEM = await keyToPEM(rsa.publicKey, false);
      const kem = await generateKemKeyPair();

      const wrapped = await wrapKey(rsaPubPEM, null, "test-rsa-only");

      // Passing a KEM secret key should be fine — it's ignored for RSA-only
      const unwrapped = await unwrapKey(rsa.privateKey, kem.secretKey, wrapped);
      expect(unwrapped).toBe("test-rsa-only");
    });
  });

  describe("detectWrappedKeyMode", () => {
    it("detects hybrid format", () => {
      expect(detectWrappedKeyMode("hybrid1:abc")).toBe("hybrid");
    });

    it("detects RSA-only format", () => {
      expect(detectWrappedKeyMode("abc123base64==")).toBe("rsa-only");
    });
  });

  describe("importKemPublicKey", () => {
    it("returns null for null/undefined", () => {
      expect(importKemPublicKey(null)).toBeNull();
      expect(importKemPublicKey(undefined)).toBeNull();
    });

    it("returns null for non-KEM strings", () => {
      expect(importKemPublicKey("not-a-kem-key")).toBeNull();
    });

    it("deserializes valid KEM key", async () => {
      const kem = await generateKemKeyPair();
      const serialized = serializeKemKey(kem.publicKey);
      const result = importKemPublicKey(serialized);
      expect(result).not.toBeNull();
      expect(result!.length).toBe(1184);
    });
  });

  describe("generateKeys", () => {
    it("generates RSA-only keys", async () => {
      const keys = await generateKeys("test-passphrase", "rsa-only");
      expect(keys.mode).toBe("rsa-only");
      expect(keys.rsaPublicKeyPEM).toContain("BEGIN PUBLIC KEY");
      expect(keys.encryptedRsaPrivateKey).toBeTruthy();
      expect(keys.kemPublicKey).toBeNull();
      expect(keys.encryptedKemSecretKey).toBeNull();
    });

    it("generates hybrid keys by default", async () => {
      const keys = await generateKeys("test-passphrase");
      expect(keys.mode).toBe("hybrid");
      expect(keys.rsaPublicKeyPEM).toContain("BEGIN PUBLIC KEY");
      expect(keys.encryptedRsaPrivateKey).toBeTruthy();
      expect(keys.kemPublicKey).not.toBeNull();
      expect(keys.kemPublicKey!.startsWith("mlkem768:")).toBe(true);
      expect(keys.encryptedKemSecretKey).not.toBeNull();
    });
  });

  describe("HybridKeyPair", () => {
    it("works in RSA-only mode", async () => {
      const rsa = await generateRsaKeyPair();
      const pair = new HybridKeyPair(rsa.publicKey, rsa.privateKey);

      expect(pair.isReady()).toBe(true);
      expect(pair.mode).toBe("rsa-only");

      const encrypted = await pair.encrypt("test-data");
      expect(detectWrappedKeyMode(encrypted)).toBe("rsa-only");

      const decrypted = await pair.decrypt(encrypted);
      expect(decrypted).toBe("test-data");
    });

    it("works in hybrid mode", async () => {
      const rsa = await generateRsaKeyPair();
      const kem = await generateKemKeyPair();
      const pair = new HybridKeyPair(
        rsa.publicKey,
        rsa.privateKey,
        kem.publicKey,
        kem.secretKey,
      );

      expect(pair.isReady()).toBe(true);
      expect(pair.mode).toBe("hybrid");

      const encrypted = await pair.encrypt("test-data");
      expect(detectWrappedKeyMode(encrypted)).toBe("hybrid");

      const decrypted = await pair.decrypt(encrypted);
      expect(decrypted).toBe("test-data");
    });

    it("hybrid pair can decrypt RSA-only wrapped keys (backward compat)", async () => {
      const rsa = await generateRsaKeyPair();
      const kem = await generateKemKeyPair();

      // Wrap with RSA-only
      const rsaPubPEM = await keyToPEM(rsa.publicKey, false);
      const rsaWrapped = await wrapKey(rsaPubPEM, null, "legacy-data");

      // Decrypt with hybrid keypair
      const pair = new HybridKeyPair(
        rsa.publicKey,
        rsa.privateKey,
        kem.publicKey,
        kem.secretKey,
      );
      const decrypted = await pair.decrypt(rsaWrapped);
      expect(decrypted).toBe("legacy-data");
    });

    it("destroy clears all keys", async () => {
      const rsa = await generateRsaKeyPair();
      const kem = await generateKemKeyPair();
      const pair = new HybridKeyPair(
        rsa.publicKey,
        rsa.privateKey,
        kem.publicKey,
        kem.secretKey,
      );

      pair.destroy();
      expect(pair.isReady()).toBe(false);
      expect(pair.rsaPublicKey).toBeNull();
      expect(pair.kemPublicKey).toBeNull();
      expect(pair.kemSecretKey).toBeNull();
    });

    it("backward compat: publicKey/privateKey getters", async () => {
      const rsa = await generateRsaKeyPair();
      const pair = new HybridKeyPair(rsa.publicKey, rsa.privateKey);

      expect(pair.publicKey).toBe(rsa.publicKey);
      expect(pair.privateKey).toBe(rsa.privateKey);
    });
  });
});
