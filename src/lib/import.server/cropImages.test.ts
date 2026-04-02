import { describe, it, expect } from "vitest";

/**
 * Test the crop calculation logic extracted from cropImages.ts.
 * We test the pure math separately because sharp's native bindings
 * conflict with vitest's Buffer polyfill in worker processes.
 */

const PADDING_PCT = 5;
const MIN_CROP_PX = 20;

interface CropRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Pure function matching the logic in cropDetectedImages */
function calculateCropRegion(
  position: { x: number; y: number; width: number; height: number },
  imgWidth: number,
  imgHeight: number,
): CropRegion | null {
  let left = Math.round((position.x / 100) * imgWidth);
  let top = Math.round((position.y / 100) * imgHeight);
  let width = Math.round((position.width / 100) * imgWidth);
  let height = Math.round((position.height / 100) * imgHeight);

  const padX = Math.round((PADDING_PCT / 100) * imgWidth);
  const padY = Math.round((PADDING_PCT / 100) * imgHeight);
  left = Math.max(0, left - padX);
  top = Math.max(0, top - padY);
  width = Math.min(imgWidth - left, width + 2 * padX);
  height = Math.min(imgHeight - top, height + 2 * padY);

  if (width < MIN_CROP_PX || height < MIN_CROP_PX) {
    return null;
  }

  return { left, top, width, height };
}

describe("cropImages - crop region calculation", () => {
  it("converts percentage positions to pixel coordinates with padding", () => {
    // 10% x, 20% y, 40% width, 30% height on a 1000x1500 image
    const result = calculateCropRegion(
      { x: 10, y: 20, width: 40, height: 30 },
      1000,
      1500,
    );

    expect(result).toEqual({
      left: 50, // max(0, 100-50)
      top: 225, // max(0, 300-75)
      width: 500, // min(1000-50, 400+100)
      height: 600, // min(1500-225, 450+150)
    });
  });

  it("clamps crop region to image bounds at edges", () => {
    // 90% x, 90% y — extends beyond image with padding
    const result = calculateCropRegion(
      { x: 90, y: 90, width: 20, height: 20 },
      1000,
      1500,
    );

    expect(result).toEqual({
      left: 850,
      top: 1275,
      width: 150, // clamped: 1000-850 < 200+100
      height: 225, // clamped: 1500-1275 < 300+150
    });
  });

  it("clamps to origin when position near top-left", () => {
    const result = calculateCropRegion(
      { x: 0, y: 0, width: 30, height: 20 },
      800,
      1200,
    );

    // padX=40, padY=60
    expect(result!.left).toBe(0); // max(0, 0-40) = 0
    expect(result!.top).toBe(0); // max(0, 0-60) = 0
  });

  it("returns null for regions smaller than minimum size", () => {
    // 1% of 100px = 1px, +2*5px padding = 11px — below 20px minimum
    const result = calculateCropRegion(
      { x: 50, y: 50, width: 1, height: 1 },
      100,
      100,
    );

    expect(result).toBeNull();
  });

  it("passes minimum size threshold with larger images", () => {
    // 1% of 1000px = 10px, +2*50px padding = 110px — above 20px
    const result = calculateCropRegion(
      { x: 50, y: 50, width: 1, height: 1 },
      1000,
      1000,
    );

    expect(result).not.toBeNull();
    expect(result!.width).toBeGreaterThanOrEqual(MIN_CROP_PX);
    expect(result!.height).toBeGreaterThanOrEqual(MIN_CROP_PX);
  });

  it("handles full-page image (0,0 100x100)", () => {
    const result = calculateCropRegion(
      { x: 0, y: 0, width: 100, height: 100 },
      800,
      1200,
    );

    // With padding the width/height are clamped to image bounds
    expect(result!.left).toBe(0);
    expect(result!.top).toBe(0);
    expect(result!.width).toBe(800); // clamped to image width
    expect(result!.height).toBe(1200); // clamped to image height
  });

  it("handles center region correctly", () => {
    const result = calculateCropRegion(
      { x: 25, y: 25, width: 50, height: 50 },
      1000,
      1000,
    );

    // x=250, y=250, w=500, h=500, padX=50, padY=50
    expect(result).toEqual({
      left: 200, // 250-50
      top: 200, // 250-50
      width: 600, // min(1000-200, 500+100)
      height: 600, // min(1000-200, 500+100)
    });
  });
});
