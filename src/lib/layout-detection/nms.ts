/**
 * Non-Maximum Suppression (NMS) for bounding box filtering.
 * Pure TypeScript, no dependencies.
 */

export interface BBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  confidence: number;
  classIndex: number;
}

/** Compute Intersection over Union between two boxes */
function iou(a: BBox, b: BBox): number {
  const x1 = Math.max(a.x1, b.x1);
  const y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2);
  const y2 = Math.min(a.y2, b.y2);

  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (intersection === 0) return 0;

  const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
  const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
  return intersection / (areaA + areaB - intersection);
}

/**
 * Apply Non-Maximum Suppression to a list of bounding boxes.
 * @param boxes - raw detections
 * @param iouThreshold - IoU threshold for suppression (default 0.45)
 * @returns filtered boxes
 */
export function nms(boxes: BBox[], iouThreshold = 0.45): BBox[] {
  // Sort by confidence descending
  const sorted = [...boxes].sort((a, b) => b.confidence - a.confidence);
  const kept: BBox[] = [];
  const suppressed = new Set<number>();

  for (let i = 0; i < sorted.length; i++) {
    if (suppressed.has(i)) continue;
    kept.push(sorted[i]);

    for (let j = i + 1; j < sorted.length; j++) {
      if (suppressed.has(j)) continue;
      if (iou(sorted[i], sorted[j]) >= iouThreshold) {
        suppressed.add(j);
      }
    }
  }

  return kept;
}
