import { describe, it, expect } from "vitest";
import { nms, type BBox } from "./nms";

describe("nms", () => {
  it("returns empty array for empty input", () => {
    expect(nms([])).toEqual([]);
  });

  it("keeps a single box", () => {
    const boxes: BBox[] = [
      { x1: 0, y1: 0, x2: 100, y2: 100, confidence: 0.9, classIndex: 0 },
    ];
    expect(nms(boxes)).toHaveLength(1);
  });

  it("suppresses overlapping boxes", () => {
    const boxes: BBox[] = [
      { x1: 0, y1: 0, x2: 100, y2: 100, confidence: 0.9, classIndex: 0 },
      { x1: 10, y1: 10, x2: 110, y2: 110, confidence: 0.8, classIndex: 0 },
    ];
    // IoU is high (overlapping), should keep only the higher confidence one
    const result = nms(boxes, 0.3);
    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe(0.9);
  });

  it("keeps non-overlapping boxes", () => {
    const boxes: BBox[] = [
      { x1: 0, y1: 0, x2: 50, y2: 50, confidence: 0.9, classIndex: 0 },
      { x1: 200, y1: 200, x2: 300, y2: 300, confidence: 0.8, classIndex: 1 },
    ];
    const result = nms(boxes, 0.45);
    expect(result).toHaveLength(2);
  });

  it("sorts output by confidence descending", () => {
    const boxes: BBox[] = [
      { x1: 0, y1: 0, x2: 50, y2: 50, confidence: 0.5, classIndex: 0 },
      { x1: 200, y1: 200, x2: 300, y2: 300, confidence: 0.9, classIndex: 1 },
      { x1: 400, y1: 400, x2: 500, y2: 500, confidence: 0.7, classIndex: 2 },
    ];
    const result = nms(boxes, 0.45);
    expect(result[0].confidence).toBe(0.9);
    expect(result[1].confidence).toBe(0.7);
    expect(result[2].confidence).toBe(0.5);
  });
});
