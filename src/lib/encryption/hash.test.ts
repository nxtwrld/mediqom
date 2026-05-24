import { describe, it, expect } from "vitest";
import { createHash, verifyHash } from "./hash";

describe("encryption/hash", () => {
  it("creates a bcrypt hash from passphrase", async () => {
    const hash = await createHash("test-passphrase");
    expect(hash).toBeTruthy();
    expect(hash).toMatch(/^\$2[aby]?\$/); // bcrypt prefix
  });

  it("creates different hashes for same passphrase (salted)", async () => {
    const hash1 = await createHash("same-pass");
    const hash2 = await createHash("same-pass");
    expect(hash1).not.toBe(hash2);
  });

  it("verifies correct passphrase", async () => {
    const hash = await createHash("my-secret");
    const isValid = await verifyHash("my-secret", hash);
    expect(isValid).toBe(true);
  });

  it("rejects incorrect passphrase", async () => {
    const hash = await createHash("my-secret");
    const isValid = await verifyHash("wrong-secret", hash);
    expect(isValid).toBe(false);
  });

  it("uses custom salt rounds", async () => {
    const hash = await createHash("test", 4); // low rounds for speed
    const isValid = await verifyHash("test", hash);
    expect(isValid).toBe(true);
  });
});
