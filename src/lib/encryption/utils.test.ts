import { describe, it, expect } from "vitest";
import { str2ab } from "./utils";

describe("str2ab", () => {
  it("converts a simple ASCII string to an ArrayBuffer with matching byte length", () => {
    const buf = str2ab("hello");
    expect(buf).toBeInstanceOf(ArrayBuffer);
    expect(buf.byteLength).toBe(5);

    const view = new Uint8Array(buf);
    expect(Array.from(view)).toEqual([0x68, 0x65, 0x6c, 0x6c, 0x6f]);
  });

  it("returns an empty ArrayBuffer for an empty string", () => {
    const buf = str2ab("");
    expect(buf.byteLength).toBe(0);
  });

  it("is lossy for non-ASCII (stores only low byte via charCodeAt)", () => {
    // Documenting behavior — charCodeAt returns the 16-bit code unit,
    // which gets truncated into a Uint8Array byte. This is intended
    // for ASCII/binary PEM data only.
    const buf = str2ab("€"); // 0x20AC → truncated to 0xAC
    const view = new Uint8Array(buf);
    expect(view[0]).toBe(0xac);
  });
});
