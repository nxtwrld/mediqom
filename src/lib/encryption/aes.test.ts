import { describe, it, expect, beforeAll } from "vitest";

// Polyfill window.btoa for Node test environment (used by arrayBufferToBase64)
beforeAll(() => {
  if (typeof globalThis.window === "undefined") {
    (globalThis as any).window = { btoa: globalThis.btoa, atob: globalThis.atob };
  }
});

import { exportKey, importKey, encrypt, decrypt, prepareKey } from "./aes";

describe("encryption/aes", () => {
  describe("prepareKey", () => {
    it("generates an AES-GCM-256 key", async () => {
      const key = await prepareKey();
      expect(key).toBeDefined();
      expect(key.type).toBe("secret");
      expect(key.algorithm).toMatchObject({ name: "AES-GCM", length: 256 });
      expect(key.extractable).toBe(true);
      expect(key.usages).toContain("encrypt");
      expect(key.usages).toContain("decrypt");
    });
  });

  describe("exportKey / importKey roundtrip", () => {
    it("exports and re-imports a key", async () => {
      const original = await prepareKey();
      const exported = await exportKey(original);

      expect(typeof exported).toBe("string");
      expect(exported.length).toBeGreaterThan(0);

      const reimported = await importKey(exported);
      expect(reimported.type).toBe("secret");
      expect(reimported.algorithm).toMatchObject({ name: "AES-GCM" });

      // Verify they produce same raw bytes
      const exportedAgain = await exportKey(reimported);
      expect(exportedAgain).toBe(exported);
    });
  });

  describe("encrypt / decrypt roundtrip", () => {
    it("encrypts and decrypts a simple string", async () => {
      const key = await prepareKey();
      const message = "Hello, AES!";

      const encrypted = await encrypt(key, message);
      expect(typeof encrypted).toBe("string");
      expect(encrypted).not.toBe(message);

      const decrypted = await decrypt(key, encrypted);
      expect(decrypted).toBe(message);
    });

    it("encrypts and decrypts unicode text", async () => {
      const key = await prepareKey();
      const message = "Příliš žluťoučký kůň 🔐";

      const encrypted = await encrypt(key, message);
      const decrypted = await decrypt(key, encrypted);
      expect(decrypted).toBe(message);
    });

    it("produces different ciphertext for same plaintext (random IV)", async () => {
      const key = await prepareKey();
      const message = "same message";

      const enc1 = await encrypt(key, message);
      const enc2 = await encrypt(key, message);
      expect(enc1).not.toBe(enc2);
    });

    it("fails to decrypt with wrong key", async () => {
      const key1 = await prepareKey();
      const key2 = await prepareKey();

      const encrypted = await encrypt(key1, "secret");
      await expect(decrypt(key2, encrypted)).rejects.toThrow();
    });

    it("handles empty string", async () => {
      const key = await prepareKey();
      const encrypted = await encrypt(key, "");
      const decrypted = await decrypt(key, encrypted);
      expect(decrypted).toBe("");
    });

    it("handles large message", async () => {
      const key = await prepareKey();
      const message = "X".repeat(100000);

      const encrypted = await encrypt(key, message);
      const decrypted = await decrypt(key, encrypted);
      expect(decrypted).toBe(message);
    });
  });
});
