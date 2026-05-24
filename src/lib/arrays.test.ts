import { describe, it, expect } from "vitest";
import {
  typedArrayToBuffer,
  base64ToArrayBuffer,
  stringToUint,
  arrayBufferToBase64,
} from "./arrays";

describe("typedArrayToBuffer", () => {
  it("returns an ArrayBuffer for a standard Uint8Array", () => {
    const src = new Uint8Array([1, 2, 3, 4]);
    const buf = typedArrayToBuffer(src);
    expect(buf).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(buf)).toEqual(src);
  });

  it("respects byteOffset and byteLength when slicing", () => {
    const big = new Uint8Array([0, 0, 1, 2, 3, 0, 0]);
    const view = new Uint8Array(big.buffer, 2, 3);
    const buf = typedArrayToBuffer(view);
    expect(new Uint8Array(buf)).toEqual(new Uint8Array([1, 2, 3]));
  });
});

describe("base64ToArrayBuffer + arrayBufferToBase64", () => {
  it("round-trips a simple ASCII payload", () => {
    // atob/btoa used directly — node provides them in globalThis.
    (globalThis as any).window = globalThis;
    const base64 = btoa("hello");
    const buf = base64ToArrayBuffer(base64);
    expect(Buffer.from(buf).toString("binary")).toBe("hello");
    const re = arrayBufferToBase64(buf);
    expect(re).toBe(base64);
  });
});

describe("stringToUint", () => {
  it("produces the same bytes as base64ToArrayBuffer", () => {
    const payload = "xyz123";
    const b64 = btoa(payload);
    const viaStringToUint = Array.from(stringToUint(b64));
    const viaBuffer = Array.from(new Uint8Array(base64ToArrayBuffer(b64)));
    expect(viaStringToUint).toEqual(viaBuffer);
  });
});
