import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the AES encryption module
vi.mock("$lib/encryption/aes", () => ({
  prepareKey: vi.fn().mockResolvedValue("mock-crypto-key"),
  exportKey: vi.fn().mockResolvedValue("base64-exported-key"),
  importKey: vi.fn().mockResolvedValue("mock-crypto-key"),
  encrypt: vi.fn().mockResolvedValue("encrypted-base64-data"),
  decrypt: vi.fn().mockResolvedValue("SGVsbG8="), // base64 "Hello"
}));

import {
  storeJobKey,
  getJobKey,
  clearJobKey,
  clearAllJobKeys,
  generateJobKey,
  encryptFile,
  decryptFile,
} from "./encryption";
import { encrypt, decrypt } from "$lib/encryption/aes";

describe("import/encryption — key management", () => {
  beforeEach(async () => {
    await clearAllJobKeys();
  });

  it("stores and retrieves a job key", async () => {
    await storeJobKey("job-1", "my-secret-key");
    const key = await getJobKey("job-1");
    expect(key).toBe("my-secret-key");
  });

  it("returns null for unknown job ID", async () => {
    const key = await getJobKey("nonexistent");
    expect(key).toBeNull();
  });

  it("clears a specific job key", async () => {
    await storeJobKey("job-1", "key-1");
    await storeJobKey("job-2", "key-2");
    await clearJobKey("job-1");
    expect(await getJobKey("job-1")).toBeNull();
    expect(await getJobKey("job-2")).toBe("key-2");
  });

  it("clearAllJobKeys removes everything", async () => {
    await storeJobKey("job-1", "key-1");
    await storeJobKey("job-2", "key-2");
    await clearAllJobKeys();
    expect(await getJobKey("job-1")).toBeNull();
    expect(await getJobKey("job-2")).toBeNull();
  });

  it("generateJobKey returns a base64 string", async () => {
    const key = await generateJobKey("job-1");
    expect(key).toBe("base64-exported-key");
  });

  it("updates lastAccessed on retrieval", async () => {
    await storeJobKey("job-1", "key-1");
    // Access it to update lastAccessed
    const key = await getJobKey("job-1");
    expect(key).toBe("key-1");
  });
});

describe("import/encryption — file encryption", () => {
  it("encrypts an ArrayBuffer", async () => {
    const data = new TextEncoder().encode("Hello World").buffer;
    const result = await encryptFile(data, "mock-key" as any);
    expect(encrypt).toHaveBeenCalled();
    expect(typeof result).toBe("string");
  });

  it("decrypts to ArrayBuffer", async () => {
    const result = await decryptFile("encrypted-data", "mock-key" as any);
    expect(decrypt).toHaveBeenCalled();
    expect(result).toBeInstanceOf(ArrayBuffer);
  });

  it("throws on encryption failure", async () => {
    (encrypt as any).mockRejectedValueOnce(new Error("Crypto error"));
    const data = new ArrayBuffer(8);
    await expect(encryptFile(data, "bad-key" as any)).rejects.toThrow(
      "File encryption failed",
    );
  });

  it("throws on decryption failure", async () => {
    (decrypt as any).mockRejectedValueOnce(new Error("Bad key"));
    await expect(decryptFile("bad-data", "bad-key" as any)).rejects.toThrow(
      "File decryption failed",
    );
  });
});
