// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock merge-images before any imports that reference it
vi.mock("merge-images", () => ({
  default: vi.fn().mockResolvedValue("data:image/png;base64,merged=="),
}));

import { getImageMimeTypeFromBuffer, resizeImage, cropImage, getImageHeight, merge } from "./images";

// ── DOM mocking helpers ───────────────────────────────────────────────────────

function setupImageMock(width = 800, height = 600) {
  const OriginalImage = (global as any).Image;
  const MockImage = vi.fn().mockImplementation(function(this: any) {
    this.width = width;
    this.height = height;
    Object.defineProperty(this, 'src', {
      set(value: string) {
        // Fire onload synchronously when src is set
        setTimeout(() => this.onload?.(), 0);
      },
      get() { return ''; },
      configurable: true,
    });
  });
  (global as any).Image = MockImage;
  return () => { (global as any).Image = OriginalImage; };
}

function setupCanvasMock() {
  const mockCtx = {
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '',
    getImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(4) }),
    putImageData: vi.fn(),
  };
  const mockCanvas = {
    width: 0,
    height: 0,
    getContext: vi.fn().mockReturnValue(mockCtx),
    toDataURL: vi.fn().mockReturnValue("data:image/png;base64,canvas=="),
  };
  const origCreate = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'canvas') return mockCanvas as any;
    return origCreate(tag);
  });
  return mockCanvas;
}

/**
 * Helper: build an ArrayBuffer with a specific header byte sequence.
 */
function bufferFromHex(hex: string, pad = 4): ArrayBuffer {
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  while (bytes.length < pad) bytes.push(0);
  return new Uint8Array(bytes).buffer;
}

describe("getImageMimeTypeFromBuffer — from ArrayBuffer", () => {
  it.each([
    ["ffd8ffdb", "image/jpg"],
    ["89504e470d0a1a0a", "image/png"],
    ["4749463839610000", "image/jpeg"], // "GIF" header also flagged as jpeg per current impl
    ["424d00000000", "image/bmp"],
    ["49492a000000", "image/tiff"],
    ["4d4d002a0000", "image/tiff"],
  ])("returns %s for %s header", (hex, mime) => {
    expect(getImageMimeTypeFromBuffer(bufferFromHex(hex, 8))).toBe(mime);
  });

  it("returns image/webp when RIFF header is followed by WEBP", () => {
    // bytes 0-3: 52 49 46 46 (RIFF), bytes 4-7: size (any), bytes 8-11: 57 45 42 50 (WEBP)
    const bytes = new Uint8Array(12);
    bytes.set([0x52, 0x49, 0x46, 0x46], 0);
    bytes.set([0x00, 0x00, 0x00, 0x00], 4);
    bytes.set([0x57, 0x45, 0x42, 0x50], 8);
    expect(getImageMimeTypeFromBuffer(bytes.buffer)).toBe("image/webp");
  });

  it("returns application/octet-stream for RIFF with non-WEBP inner type", () => {
    const bytes = new Uint8Array(12);
    bytes.set([0x52, 0x49, 0x46, 0x46], 0);
    bytes.set([0x41, 0x56, 0x49, 0x20], 8); // "AVI "
    expect(getImageMimeTypeFromBuffer(bytes.buffer)).toBe(
      "application/octet-stream",
    );
  });

  it("returns application/octet-stream for unknown header", () => {
    expect(getImageMimeTypeFromBuffer(bufferFromHex("00000000"))).toBe(
      "application/octet-stream",
    );
  });
});

describe("getImageMimeTypeFromBuffer — from base64 string", () => {
  it("strips data URL prefix before decoding", () => {
    // Create a base64 PNG header
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const b64 = btoa(String.fromCharCode(...bytes));
    const dataUrl = `data:image/png;base64,${b64}`;
    expect(getImageMimeTypeFromBuffer(dataUrl)).toBe("image/png");
  });

  it("returns undefined for malformed data URL (no comma)", () => {
    expect(getImageMimeTypeFromBuffer("data:image/png;base64")).toBeUndefined();
  });

  it("decodes raw base64 without data URL prefix", () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xdb]);
    const b64 = btoa(String.fromCharCode(...bytes));
    expect(getImageMimeTypeFromBuffer(b64)).toBe("image/jpg");
  });
});

// ── resizeImage ───────────────────────────────────────────────────────────────

describe("resizeImage", () => {
  let restoreImage: () => void;

  beforeEach(() => {
    restoreImage = setupImageMock(800, 600);
    setupCanvasMock();
  });

  afterEach(() => {
    restoreImage();
    vi.restoreAllMocks();
  });

  it("resolves with canvas data URL when ctx is available", async () => {
    const result = await resizeImage("data:image/png;base64,abc", 400);
    expect(typeof result).toBe("string");
  });

  it("scales width down when image is wider than MAX_WIDTH", async () => {
    restoreImage();
    restoreImage = setupImageMock(1600, 600); // wide image
    const canvas = setupCanvasMock();
    await resizeImage("data:image/png;base64,abc", 800);
    expect(canvas.width).toBeLessThanOrEqual(800);
  });

  it("scales height down when image is taller than MAX_WIDTH (square mode)", async () => {
    restoreImage();
    restoreImage = setupImageMock(400, 1200); // tall image
    const canvas = setupCanvasMock();
    await resizeImage("data:image/png;base64,abc", 800);
    expect(canvas.height).toBeLessThanOrEqual(800);
  });

  it("accepts both MAX_WIDTH and MAX_HEIGHT", async () => {
    restoreImage();
    restoreImage = setupImageMock(1000, 800);
    const canvas = setupCanvasMock();
    await resizeImage("data:image/png;base64,abc", 500, 400);
    expect(typeof canvas.width).toBe("number");
  });
});

// ── cropImage ────────────────────────────────────────────────────────────────

describe("cropImage", () => {
  let restoreImage: () => void;

  beforeEach(() => {
    restoreImage = setupImageMock(800, 600);
    setupCanvasMock();
  });

  afterEach(() => {
    restoreImage();
    vi.restoreAllMocks();
  });

  it("resolves with a data URL string", async () => {
    const result = await cropImage("data:image/png;base64,abc");
    expect(typeof result).toBe("string");
  });

  it("uses default dimensions 400x300", async () => {
    const canvas = setupCanvasMock();
    vi.restoreAllMocks(); // clear previous spy
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') return canvas as any;
      return origCreate(tag);
    });
    await cropImage("data:image/png;base64,abc");
    expect(canvas.width).toBe(400);
    expect(canvas.height).toBe(300);
  });

  it("accepts custom crop dimensions", async () => {
    const canvas = setupCanvasMock();
    vi.restoreAllMocks();
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') return canvas as any;
      return origCreate(tag);
    });
    await cropImage("data:image/png;base64,abc", 200, 150, 10, 20);
    expect(canvas.width).toBe(200);
    expect(canvas.height).toBe(150);
  });
});

// ── getImageHeight ────────────────────────────────────────────────────────────

describe("getImageHeight", () => {
  let restoreImage: () => void;

  beforeEach(() => {
    restoreImage = setupImageMock(800, 600);
  });

  afterEach(() => {
    restoreImage();
  });

  it("returns src and height from image", async () => {
    const result = await getImageHeight("data:image/png;base64,abc");
    expect(result).toHaveProperty("src", "data:image/png;base64,abc");
    expect(result).toHaveProperty("height", 600);
  });
});

// ── merge ─────────────────────────────────────────────────────────────────────

describe("merge", () => {
  let restoreImage: () => void;

  beforeEach(() => {
    restoreImage = setupImageMock(800, 600);
    vi.clearAllMocks();
  });

  afterEach(() => {
    restoreImage();
  });

  it("calls mergeImages and returns data URL", async () => {
    const result = await merge(["data:image/png;base64,a", "data:image/png;base64,b"]);
    expect(result).toBe("data:image/png;base64,merged==");
  });

  it("handles empty array", async () => {
    const result = await merge([]);
    expect(typeof result).toBe("string");
  });
});
