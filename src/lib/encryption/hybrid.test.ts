import { describe, it, expect } from "vitest";
import { hybridWrapKey, hybridUnwrapKey, isHybridWrappedKey } from "./hybrid";
import { generateKemKeyPair } from "./kem";
import { encrypt as rsaEncrypt, decrypt as rsaDecrypt } from "./rsa";

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

describe("Hybrid RSA + ML-KEM wrapping", () => {
  it("wrap/unwrap roundtrip succeeds", async () => {
    const rsaKeys = await generateRsaKeyPair();
    const kemKeys = await generateKemKeyPair();

    const originalKey = "dGVzdC1hZXMta2V5LWJhc2U2NA=="; // test AES key

    const wrapped = await hybridWrapKey(
      rsaKeys.publicKey,
      kemKeys.publicKey,
      originalKey,
    );

    expect(wrapped.startsWith("hybrid1:")).toBe(true);
    expect(isHybridWrappedKey(wrapped)).toBe(true);

    const unwrapped = await hybridUnwrapKey(
      rsaKeys.privateKey,
      kemKeys.secretKey,
      wrapped,
    );

    expect(unwrapped).toBe(originalKey);
  });

  it("unwrap fails with wrong RSA key", async () => {
    const rsaKeys = await generateRsaKeyPair();
    const wrongRsaKeys = await generateRsaKeyPair();
    const kemKeys = await generateKemKeyPair();

    const wrapped = await hybridWrapKey(
      rsaKeys.publicKey,
      kemKeys.publicKey,
      "test-key",
    );

    await expect(
      hybridUnwrapKey(wrongRsaKeys.privateKey, kemKeys.secretKey, wrapped),
    ).rejects.toThrow();
  });

  it("unwrap fails with wrong KEM key", async () => {
    const rsaKeys = await generateRsaKeyPair();
    const kemKeys = await generateKemKeyPair();
    const wrongKemKeys = await generateKemKeyPair();

    const wrapped = await hybridWrapKey(
      rsaKeys.publicKey,
      kemKeys.publicKey,
      "test-key",
    );

    // ML-KEM implicit rejection produces wrong shared secret → AES-GCM decrypt fails
    await expect(
      hybridUnwrapKey(rsaKeys.privateKey, wrongKemKeys.secretKey, wrapped),
    ).rejects.toThrow();
  });

  it("isHybridWrappedKey returns false for RSA-only keys", () => {
    expect(isHybridWrappedKey("abc123base64==")).toBe(false);
    expect(isHybridWrappedKey("")).toBe(false);
  });

  it("hybridUnwrapKey rejects non-hybrid format", async () => {
    const rsaKeys = await generateRsaKeyPair();
    const kemKeys = await generateKemKeyPair();

    await expect(
      hybridUnwrapKey(rsaKeys.privateKey, kemKeys.secretKey, "not-hybrid"),
    ).rejects.toThrow("Invalid hybrid wrapped key format");
  });
});
