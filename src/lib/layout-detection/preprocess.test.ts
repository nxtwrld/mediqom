// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MODEL_SIZE, preprocessImage } from "./preprocess";

function setupImageMock(width: number, height: number) {
  const MockImage = vi.fn().mockImplementation(function (this: any) {
    this.width = width;
    this.height = height;
    Object.defineProperty(this, "src", {
      set(_v: string) {
        setTimeout(() => this.onload?.(), 0);
      },
      get() {
        return "";
      },
      configurable: true,
    });
  });
  (global as any).Image = MockImage;
}

function setupCanvasMock(pixelData?: Uint8ClampedArray) {
  const data =
    pixelData || new Uint8ClampedArray(MODEL_SIZE * MODEL_SIZE * 4).fill(128);
  const mockCtx = {
    fillStyle: "",
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    getImageData: vi.fn().mockReturnValue({ data }),
  };
  const mockCanvas = {
    width: 0,
    height: 0,
    getContext: vi.fn().mockReturnValue(mockCtx),
    toDataURL: vi.fn().mockReturnValue("data:image/png;base64,abc"),
  };
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    if (tag === "canvas") return mockCanvas as any;
    return document.createElement(tag);
  });
  return { mockCtx, mockCanvas };
}

describe("MODEL_SIZE constant", () => {
  it("is 1024", () => {
    expect(MODEL_SIZE).toBe(1024);
  });
});

describe("preprocessImage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a tensor with correct size (3 * 1024 * 1024)", async () => {
    setupImageMock(800, 600);
    setupCanvasMock();
    const { tensor } = await preprocessImage("data:image/png;base64,abc");
    expect(tensor).toBeInstanceOf(Float32Array);
    expect(tensor.length).toBe(3 * MODEL_SIZE * MODEL_SIZE);
  });

  it("returns correct letterbox for 800x600 image (height constrains)", async () => {
    setupImageMock(800, 600);
    setupCanvasMock();
    const { letterbox } = await preprocessImage("data:image/png;base64,abc");
    const expectedScale = Math.min(1024 / 800, 1024 / 600);
    expect(letterbox.scale).toBeCloseTo(expectedScale, 10);
    expect(letterbox.originalWidth).toBe(800);
    expect(letterbox.originalHeight).toBe(600);
  });

  it("returns correct padX and padY for 800x600 image", async () => {
    setupImageMock(800, 600);
    setupCanvasMock();
    const { letterbox } = await preprocessImage("data:image/png;base64,abc");
    const scale = Math.min(1024 / 800, 1024 / 600);
    const newW = Math.round(800 * scale);
    const newH = Math.round(600 * scale);
    expect(letterbox.padX).toBe(Math.round((1024 - newW) / 2));
    expect(letterbox.padY).toBe(Math.round((1024 - newH) / 2));
  });

  it("tensor values are normalized to [0, 1]", async () => {
    setupImageMock(512, 512);
    const pixelData = new Uint8ClampedArray(MODEL_SIZE * MODEL_SIZE * 4).fill(
      200,
    );
    setupCanvasMock(pixelData);
    const { tensor } = await preprocessImage("data:image/png;base64,abc");
    // Spot-check a sample of values rather than iterating all 3M entries
    const sample = [0, 1000, 100000, tensor.length - 1];
    for (const idx of sample) {
      expect(tensor[idx]).toBeGreaterThanOrEqual(0);
      expect(tensor[idx]).toBeLessThanOrEqual(1.0);
    }
    // All values should be 200/255 ≈ 0.784
    expect(tensor[0]).toBeCloseTo(200 / 255);
  });

  it("calls ctx.fillRect to fill gray background", async () => {
    setupImageMock(800, 600);
    const { mockCtx } = setupCanvasMock();
    await preprocessImage("data:image/png;base64,abc");
    expect(mockCtx.fillRect).toHaveBeenCalledWith(0, 0, MODEL_SIZE, MODEL_SIZE);
  });

  it("calls ctx.drawImage to draw the resized image", async () => {
    setupImageMock(800, 600);
    const { mockCtx } = setupCanvasMock();
    await preprocessImage("data:image/png;base64,abc");
    expect(mockCtx.drawImage).toHaveBeenCalledTimes(1);
  });

  it("for square 1024x1024 image: scale=1, padX=0, padY=0", async () => {
    setupImageMock(1024, 1024);
    setupCanvasMock();
    const { letterbox } = await preprocessImage("data:image/png;base64,abc");
    expect(letterbox.scale).toBe(1);
    expect(letterbox.padX).toBe(0);
    expect(letterbox.padY).toBe(0);
  });

  it("for 2048x1024 image: scale=0.5 (width constrains)", async () => {
    setupImageMock(2048, 1024);
    setupCanvasMock();
    const { letterbox } = await preprocessImage("data:image/png;base64,abc");
    expect(letterbox.scale).toBe(0.5);
  });

  it("for 2048x1024 image padY=256 (height is scaled to 512, padded by 256 each side)", async () => {
    setupImageMock(2048, 1024);
    setupCanvasMock();
    const { letterbox } = await preprocessImage("data:image/png;base64,abc");
    // scale=0.5: newH=round(1024*0.5)=512, padY=round((1024-512)/2)=256
    expect(letterbox.padY).toBe(256);
  });

  it("correctly separates R, G, B channels in NCHW layout", async () => {
    setupImageMock(512, 512);
    // Fill with distinct R=10, G=20, B=30, A=255
    const pixelData = new Uint8ClampedArray(MODEL_SIZE * MODEL_SIZE * 4);
    for (let i = 0; i < MODEL_SIZE * MODEL_SIZE; i++) {
      pixelData[i * 4] = 10; // R
      pixelData[i * 4 + 1] = 20; // G
      pixelData[i * 4 + 2] = 30; // B
      pixelData[i * 4 + 3] = 255; // A
    }
    setupCanvasMock(pixelData);
    const { tensor } = await preprocessImage("data:image/png;base64,abc");
    const totalPixels = MODEL_SIZE * MODEL_SIZE;
    // R channel: indices 0..totalPixels-1
    expect(tensor[0]).toBeCloseTo(10 / 255);
    // G channel: indices totalPixels..2*totalPixels-1
    expect(tensor[totalPixels]).toBeCloseTo(20 / 255);
    // B channel: indices 2*totalPixels..3*totalPixels-1
    expect(tensor[2 * totalPixels]).toBeCloseTo(30 / 255);
  });

  it("for portrait image (400x800): padX > 0, padY = 0", async () => {
    setupImageMock(400, 800);
    setupCanvasMock();
    const { letterbox } = await preprocessImage("data:image/png;base64,abc");
    expect(letterbox.padX).toBeGreaterThan(0);
    expect(letterbox.padY).toBe(0);
  });

  it("for landscape image (800x400): padY > 0, padX = 0", async () => {
    setupImageMock(800, 400);
    setupCanvasMock();
    const { letterbox } = await preprocessImage("data:image/png;base64,abc");
    expect(letterbox.padY).toBeGreaterThan(0);
    expect(letterbox.padX).toBe(0);
  });

  it("sets canvas dimensions to MODEL_SIZE x MODEL_SIZE", async () => {
    setupImageMock(640, 480);
    const { mockCanvas } = setupCanvasMock();
    await preprocessImage("data:image/png;base64,abc");
    expect(mockCanvas.width).toBe(MODEL_SIZE);
    expect(mockCanvas.height).toBe(MODEL_SIZE);
  });

  it("uses document.createElement('canvas')", async () => {
    setupImageMock(640, 480);
    setupCanvasMock();
    const spy = vi.spyOn(document, "createElement");
    await preprocessImage("data:image/png;base64,abc");
    expect(spy).toHaveBeenCalledWith("canvas");
  });
});
