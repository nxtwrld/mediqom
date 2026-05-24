import { describe, it, expect } from "vitest";
import { encryptString, decryptString, generatePassphrase } from "./passphrase";

describe("encryption/passphrase", () => {
  describe("encryptString / decryptString roundtrip", () => {
    it("encrypts and decrypts a simple string", async () => {
      const message = "Hello, World!";
      const passphrase = "test-passphrase-123";

      const encrypted = await encryptString(message, passphrase);
      expect(encrypted).toBeTruthy();
      expect(encrypted).not.toBe(message);

      const decrypted = await decryptString(encrypted, passphrase);
      expect(decrypted).toBe(message);
    });

    it("encrypts and decrypts unicode content", async () => {
      const message = "Příliš žluťoučký kůň 🏥";
      const passphrase = "unicode-pass-ěščřž";

      const encrypted = await encryptString(message, passphrase);
      const decrypted = await decryptString(encrypted, passphrase);
      expect(decrypted).toBe(message);
    });

    it("produces different ciphertext for same input (random salt/IV)", async () => {
      const message = "same message";
      const passphrase = "same-pass";

      const enc1 = await encryptString(message, passphrase);
      const enc2 = await encryptString(message, passphrase);
      expect(enc1).not.toBe(enc2);
    });

    it("fails to decrypt with wrong passphrase", async () => {
      const encrypted = await encryptString("secret", "correct-pass");

      await expect(decryptString(encrypted, "wrong-pass")).rejects.toThrow();
    });

    it("handles empty string", async () => {
      const encrypted = await encryptString("", "pass");
      const decrypted = await decryptString(encrypted, "pass");
      expect(decrypted).toBe("");
    });

    it("handles long message", async () => {
      const message = "A".repeat(10000);
      const passphrase = "long-message-pass";

      const encrypted = await encryptString(message, passphrase);
      const decrypted = await decryptString(encrypted, passphrase);
      expect(decrypted).toBe(message);
    });
  });

  describe("generatePassphrase", () => {
    it("generates a passphrase of default length", () => {
      const pass = generatePassphrase();
      expect(pass.length).toBe(20);
    });

    it("generates a passphrase of custom length", () => {
      const pass = generatePassphrase(32);
      expect(pass.length).toBe(32);
    });

    it("contains at least one lowercase letter", () => {
      const pass = generatePassphrase(20);
      expect(pass).toMatch(/[a-z]/);
    });

    it("contains at least one uppercase letter", () => {
      const pass = generatePassphrase(20);
      expect(pass).toMatch(/[A-Z]/);
    });

    it("contains at least one digit", () => {
      const pass = generatePassphrase(20);
      expect(pass).toMatch(/[0-9]/);
    });

    it("contains at least one special character", () => {
      const pass = generatePassphrase(20);
      expect(pass).toMatch(/[.,:;\-_()=*!@#$%]/);
    });

    it("throws for length less than 4 (one per pool)", () => {
      expect(() => generatePassphrase(3)).toThrow(
        "Passphrase length must be at least 4",
      );
    });

    it("generates minimum length 4 passphrase", () => {
      const pass = generatePassphrase(4);
      expect(pass.length).toBe(4);
    });

    it("generates unique passphrases", () => {
      const set = new Set<string>();
      for (let i = 0; i < 10; i++) {
        set.add(generatePassphrase());
      }
      expect(set.size).toBe(10);
    });
  });
});
