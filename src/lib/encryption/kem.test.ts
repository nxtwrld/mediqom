import { describe, it, expect } from "vitest";
import {
  generateKemKeyPair,
  kemEncapsulate,
  kemDecapsulate,
  serializeKemKey,
  deserializeKemKey,
  isKemKey,
} from "./kem";

describe("ML-KEM-768", () => {
  it("generates a keypair with correct sizes", async () => {
    const { publicKey, secretKey } = await generateKemKeyPair();
    // ML-KEM-768 public key: 1184 bytes, secret key: 2400 bytes
    expect(publicKey).toBeInstanceOf(Uint8Array);
    expect(secretKey).toBeInstanceOf(Uint8Array);
    expect(publicKey.length).toBe(1184);
    expect(secretKey.length).toBe(2400);
  });

  it("encap/decap roundtrip produces matching shared secrets", async () => {
    const { publicKey, secretKey } = await generateKemKeyPair();

    const { ciphertext, sharedSecret } = await kemEncapsulate(publicKey);
    const recovered = await kemDecapsulate(ciphertext, secretKey);

    expect(ciphertext.length).toBe(1088);
    expect(sharedSecret.length).toBe(32);
    expect(recovered.length).toBe(32);
    expect(Array.from(recovered)).toEqual(Array.from(sharedSecret));
  });

  it("decap with wrong secret key produces different shared secret", async () => {
    const alice = await generateKemKeyPair();
    const eve = await generateKemKeyPair();

    const { ciphertext, sharedSecret } = await kemEncapsulate(alice.publicKey);
    const eveSecret = await kemDecapsulate(ciphertext, eve.secretKey);

    // ML-KEM has implicit rejection — wrong key gives a pseudorandom result
    expect(Array.from(eveSecret)).not.toEqual(Array.from(sharedSecret));
  });

  it("serializes and deserializes keys correctly", async () => {
    const { publicKey, secretKey } = await generateKemKeyPair();

    const pubStr = serializeKemKey(publicKey);
    const secStr = serializeKemKey(secretKey);

    expect(pubStr.startsWith("mlkem768:")).toBe(true);
    expect(secStr.startsWith("mlkem768:")).toBe(true);

    const pubRecovered = deserializeKemKey(pubStr);
    const secRecovered = deserializeKemKey(secStr);

    expect(Array.from(pubRecovered)).toEqual(Array.from(publicKey));
    expect(Array.from(secRecovered)).toEqual(Array.from(secretKey));
  });

  it("isKemKey detects prefixed strings", () => {
    expect(isKemKey("mlkem768:abc")).toBe(true);
    expect(isKemKey("notakey")).toBe(false);
    expect(isKemKey("")).toBe(false);
  });

  it("deserializeKemKey throws on invalid prefix", () => {
    expect(() => deserializeKemKey("invalid:abc")).toThrow("Invalid KEM key format");
  });
});
