/**
 * Client-side document layout detection using DocLayout-YOLO via ONNX Runtime.
 *
 * Detects figures, tables, text regions etc. in scanned document pages.
 * Used to provide accurate bounding boxes for image cropping, replacing
 * unreliable LLM-based image detection.
 */

import { preprocessImage, MODEL_SIZE, type LetterboxInfo } from "./preprocess";
import { nms, type BBox } from "./nms";

// DocLayout-YOLO class names (10 classes)
const CLASS_NAMES = [
  "text",
  "title",
  "list",
  "table",
  "figure",
  "formula",
  "caption",
  "header",
  "footer",
  "footnote",
];

export interface LayoutDetection {
  class: string;
  confidence: number;
  /** Position as percentage of page dimensions (0-100) */
  position: { x: number; y: number; width: number; height: number };
}

export interface PageLayoutResult {
  page: number; // 1-indexed
  detections: LayoutDetection[];
}

/** Confidence threshold for keeping detections */
const CONFIDENCE_THRESHOLD = 0.25;
/** IoU threshold for NMS */
const NMS_IOU_THRESHOLD = 0.45;

// Cached ONNX session (lazy-loaded)
let sessionPromise: Promise<any> | null = null;

/**
 * Load ONNX Runtime scripts (same as VAD uses).
 */
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

/**
 * Get or create the ONNX inference session.
 * Lazily loads the model on first call and caches it.
 */
async function getSession(): Promise<any> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      // Load ONNX Runtime (shared with VAD)
      await loadScript("/onnx/ort.js");

      const ort = (window as any).ort;
      if (!ort) {
        throw new Error("ONNX Runtime not available");
      }

      // Configure WASM paths
      ort.env.wasm.wasmPaths = "/onnx/";

      const session = await ort.InferenceSession.create(
        "/models/doclayout-yolo.onnx",
        {
          executionProviders: ["wasm"],
          graphOptimizationLevel: "all",
        },
      );

      return session;
    })();
  }
  return sessionPromise;
}

/**
 * Parse raw YOLO output tensor into bounding boxes.
 *
 * YOLO output shape: [1, numClasses + 4, numDetections]
 * - First 4 rows: cx, cy, w, h (in model pixel coords)
 * - Remaining rows: class scores
 */
function parseYoloOutput(
  output: Float32Array,
  numDetections: number,
  letterbox: LetterboxInfo,
): LayoutDetection[] {
  const numClasses = CLASS_NAMES.length;
  const stride = numDetections; // columns per row

  const boxes: BBox[] = [];

  for (let d = 0; d < numDetections; d++) {
    // Extract center coords and dimensions (model pixel space)
    const cx = output[0 * stride + d];
    const cy = output[1 * stride + d];
    const w = output[2 * stride + d];
    const h = output[3 * stride + d];

    // Find best class
    let maxScore = 0;
    let bestClass = 0;
    for (let c = 0; c < numClasses; c++) {
      const score = output[(4 + c) * stride + d];
      if (score > maxScore) {
        maxScore = score;
        bestClass = c;
      }
    }

    if (maxScore < CONFIDENCE_THRESHOLD) continue;

    // Convert from center coords to corner coords
    const x1 = cx - w / 2;
    const y1 = cy - h / 2;
    const x2 = cx + w / 2;
    const y2 = cy + h / 2;

    boxes.push({ x1, y1, x2, y2, confidence: maxScore, classIndex: bestClass });
  }

  // Apply NMS
  const filtered = nms(boxes, NMS_IOU_THRESHOLD);

  // Convert from model pixel coords to percentage of original image
  return filtered.map((box) => {
    // Remove letterbox padding and scale back to original image coords
    const origX1 = (box.x1 - letterbox.padX) / letterbox.scale;
    const origY1 = (box.y1 - letterbox.padY) / letterbox.scale;
    const origX2 = (box.x2 - letterbox.padX) / letterbox.scale;
    const origY2 = (box.y2 - letterbox.padY) / letterbox.scale;

    // Clamp to image bounds
    const clampedX1 = Math.max(0, origX1);
    const clampedY1 = Math.max(0, origY1);
    const clampedX2 = Math.min(letterbox.originalWidth, origX2);
    const clampedY2 = Math.min(letterbox.originalHeight, origY2);

    // Convert to percentage
    const xPct = (clampedX1 / letterbox.originalWidth) * 100;
    const yPct = (clampedY1 / letterbox.originalHeight) * 100;
    const wPct =
      ((clampedX2 - clampedX1) / letterbox.originalWidth) * 100;
    const hPct =
      ((clampedY2 - clampedY1) / letterbox.originalHeight) * 100;

    return {
      class: CLASS_NAMES[box.classIndex],
      confidence: box.confidence,
      position: {
        x: Math.round(xPct * 100) / 100,
        y: Math.round(yPct * 100) / 100,
        width: Math.round(wPct * 100) / 100,
        height: Math.round(hPct * 100) / 100,
      },
    };
  });
}

/**
 * Run DocLayout-YOLO layout detection on all provided page images.
 *
 * @param images - Array of base64 data URL page images
 * @returns Layout detections per page (1-indexed)
 *
 * If ONNX fails (model missing, WASM not supported, etc.),
 * returns an empty array — caller should fall back to LLM detection.
 */
export async function detectLayoutForPages(
  images: string[],
): Promise<PageLayoutResult[]> {
  if (!images || images.length === 0) return [];

  try {
    const session = await getSession();
    const ort = (window as any).ort;

    const results: PageLayoutResult[] = [];

    for (let i = 0; i < images.length; i++) {
      const { tensor, letterbox } = await preprocessImage(images[i]);

      // Create input tensor [1, 3, MODEL_SIZE, MODEL_SIZE]
      const inputTensor = new ort.Tensor("float32", tensor, [
        1,
        3,
        MODEL_SIZE,
        MODEL_SIZE,
      ]);

      // Run inference
      const inputName = session.inputNames[0];
      const feeds: Record<string, any> = {};
      feeds[inputName] = inputTensor;

      const outputMap = await session.run(feeds);
      const outputName = session.outputNames[0];
      const outputTensor = outputMap[outputName];

      // Output shape: [1, numClasses+4, numDetections]
      const outputData = outputTensor.data as Float32Array;
      const numDetections = outputTensor.dims[2];

      const detections = parseYoloOutput(outputData, numDetections, letterbox);

      if (detections.length > 0) {
        results.push({
          page: i + 1,
          detections,
        });
      }
    }

    return results;
  } catch (err) {
    console.warn("[LayoutDetection] ONNX detection failed, will use LLM fallback:", err);
    return [];
  }
}
