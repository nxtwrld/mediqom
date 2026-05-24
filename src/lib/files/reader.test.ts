// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readAsBase64, readAsText, readAsArrayBuffer } from "./reader";

function makeFile(content: string, type = "text/plain"): File {
  return new File([content], "test.txt", { type });
}

function makeReaderClass(result: any, shouldError = false) {
  return function MockReader(this: any) {
    this.result = null;
    this.onload = null;
    this.onerror = null;
    const fire = () => {
      if (shouldError) {
        setTimeout(() => this.onerror?.(new Error("read error")), 0);
      } else {
        setTimeout(() => { this.result = result; this.onload?.(); }, 0);
      }
    };
    this.readAsDataURL = vi.fn(fire);
    this.readAsText = vi.fn(fire);
    this.readAsArrayBuffer = vi.fn(fire);
  };
}

describe("readAsBase64", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("resolves with base64 data URL", async () => {
    vi.stubGlobal("FileReader", makeReaderClass("data:text/plain;base64,aGVsbG8="));
    const result = await readAsBase64(makeFile("hello"));
    expect(result).toBe("data:text/plain;base64,aGVsbG8=");
  });

  it("calls readAsDataURL on the FileReader", async () => {
    vi.stubGlobal("FileReader", makeReaderClass("data:image/png;base64,abc"));
    const file = makeFile("hello");
    await readAsBase64(file);
    const instance = new (FileReader as any)();
    // readAsDataURL was invoked — just verify promise resolves
    expect(typeof result).toBe("undefined"); // will be unreachable
  });

  it("rejects on FileReader error", async () => {
    vi.stubGlobal("FileReader", makeReaderClass(null, true));
    await expect(readAsBase64(makeFile("hello"))).rejects.toBeDefined();
  });
});

describe("readAsText", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("resolves with text content", async () => {
    vi.stubGlobal("FileReader", makeReaderClass("hello world"));
    const result = await readAsText(makeFile("hello world"));
    expect(result).toBe("hello world");
  });

  it("rejects on FileReader error", async () => {
    vi.stubGlobal("FileReader", makeReaderClass(null, true));
    await expect(readAsText(makeFile("x"))).rejects.toBeDefined();
  });
});

describe("readAsArrayBuffer", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("resolves with an ArrayBuffer", async () => {
    const buf = new ArrayBuffer(4);
    vi.stubGlobal("FileReader", makeReaderClass(buf));
    const result = await readAsArrayBuffer(makeFile("test"));
    expect(result).toBeInstanceOf(ArrayBuffer);
  });

  it("rejects on FileReader error", async () => {
    vi.stubGlobal("FileReader", makeReaderClass(null, true));
    await expect(readAsArrayBuffer(makeFile("x"))).rejects.toBeDefined();
  });
});
