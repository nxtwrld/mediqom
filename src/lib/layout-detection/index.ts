/**
 * Client-side document layout detection using DocLayout-YOLO via ONNX Runtime.
 *
 * Detects figures, tables, text regions etc. in scanned document pages.
 * Used to provide accurate bounding boxes for image cropping, replacing
 * unreliable LLM-based image detection.
 *
 * Model: DocLayout-YOLO (YOLOv10-based, NMS-free)
 * Output: [N, 6] where each row is [x1, y1, x2, y2, confidence, class_id]
 */

import { preprocessImage, MODEL_SIZE, type LetterboxInfo } from "./preprocess";

// DocLayout-YOLO DocStructBench class names (10 classes)
// Source: https://github.com/opendatalab/DocLayout-YOLO/issues/84
const CLASS_NAMES: Record<number, string> = {
  0: "title",
  1: "plain_text",
  2: "abandon",
  3: "figure",
  4: "figure_caption",
  5: "table",
  6: "table_caption",
  7: "table_footnote",
  8: "isolate_formula",
  9: "formula_caption",
};

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

// Cached ONNX session (lazy-loaded)
let sessionPromise: Promise<any> | null = null;

/**
 * Load a script tag and wait for it to execute.
 */
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
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
 * Loads ORT v1.22 from static/onnx/ (supports IR version 9).
 */
async function getSession(): Promise<any> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      await loadScript("/onnx/ort.js");

      const ort = (window as any).ort;
      if (!ort) {
        throw new Error("ONNX Runtime not available");
      }

      // Point WASM backend to the same directory
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
 * Scale bounding boxes from padded/resized image space back to original image space.
 * Matches the reference implementation's scale_boxes function.
 */
function scaleBox(
  x1: number, y1: number, x2: number, y2: number,
  letterbox: LetterboxInfo,
): { x1: number; y1: number; x2: number; y2: number } {
  // Remove letterbox padding and scale back
  const origX1 = (x1 - letterbox.padX) / letterbox.scale;
  const origY1 = (y1 - letterbox.padY) / letterbox.scale;
  const origX2 = (x2 - letterbox.padX) / letterbox.scale;
  const origY2 = (y2 - letterbox.padY) / letterbox.scale;

  // Clamp to image bounds
  return {
    x1: Math.max(0, origX1),
    y1: Math.max(0, origY1),
    x2: Math.min(letterbox.originalWidth, origX2),
    y2: Math.min(letterbox.originalHeight, origY2),
  };
}

/**
 * Parse YOLOv10 output tensor into layout detections.
 *
 * YOLOv10 is NMS-free. Output shape: [N, 6]
 * Each detection: [x1, y1, x2, y2, confidence, class_id]
 * Coordinates are in the padded/resized image pixel space.
 */
function parseYoloOutput(
  output: Float32Array,
  dims: number[],
  letterbox: LetterboxInfo,
): LayoutDetection[] {
  // Output shape: [N, 6] or [1, N, 6]
  // Flatten to handle both cases
  const cols = dims[dims.length - 1]; // 6
  const rows = dims.length === 3 ? dims[1] : dims[0]; // N

  if (typeof window !== "undefined" && (window as any).__LAYOUT_DEBUG) {
    console.log(
      `[LayoutDetection] parseYoloOutput: dims=[${dims}], rows=${rows}, cols=${cols}, ` +
      `dataLen=${output.length}, first6=[${Array.from(output.slice(0, 6)).map(v => v.toFixed(2))}]`,
    );
  }

  const detections: LayoutDetection[] = [];

  for (let i = 0; i < rows; i++) {
    const offset = i * cols;
    const confidence = output[offset + 4];

    if (confidence < CONFIDENCE_THRESHOLD) continue;

    const x1 = output[offset + 0];
    const y1 = output[offset + 1];
    const x2 = output[offset + 2];
    const y2 = output[offset + 3];
    const classId = Math.round(output[offset + 5]);

    const className = CLASS_NAMES[classId];
    if (!className) continue;

    // Scale from padded image space to original image space
    const box = scaleBox(x1, y1, x2, y2, letterbox);

    // Convert to percentage of original image
    const xPct = (box.x1 / letterbox.originalWidth) * 100;
    const yPct = (box.y1 / letterbox.originalHeight) * 100;
    const wPct = ((box.x2 - box.x1) / letterbox.originalWidth) * 100;
    const hPct = ((box.y2 - box.y1) / letterbox.originalHeight) * 100;

    // Skip tiny detections
    if (wPct < 0.5 || hPct < 0.5) continue;

    detections.push({
      class: className,
      confidence: Math.round(confidence * 1000) / 1000,
      position: {
        x: Math.round(xPct * 100) / 100,
        y: Math.round(yPct * 100) / 100,
        width: Math.round(wPct * 100) / 100,
        height: Math.round(hPct * 100) / 100,
      },
    });
  }

  // Sort by confidence descending
  detections.sort((a, b) => b.confidence - a.confidence);

  return detections;
}

/**
 * Run DocLayout-YOLO layout detection on provided page images.
 *
 * @param images - Array of base64 data URL page images
 * @param pageFilter - Optional 1-indexed page numbers to process. When set, only
 *   these pages are run through ONNX; others are skipped. This avoids running
 *   inference on pages that don't contain embedded images.
 * @returns Layout detections per page (1-indexed)
 *
 * If ONNX fails (model missing, WASM not supported, etc.),
 * returns an empty array — caller should fall back to LLM detection.
 */
export async function detectLayoutForPages(
  images: string[],
  pageFilter?: number[],
): Promise<PageLayoutResult[]> {
  if (!images || images.length === 0) return [];

  // Build set of pages to process (0-indexed internally)
  const filterSet = pageFilter
    ? new Set(pageFilter.map(p => p - 1))
    : null;

  try {
    const session = await getSession();

    const results: PageLayoutResult[] = [];

    for (let i = 0; i < images.length; i++) {
      // Skip pages not in the filter
      if (filterSet && !filterSet.has(i)) continue;

      const { tensor, letterbox } = await preprocessImage(images[i]);

      // Create input tensor [1, 3, MODEL_SIZE, MODEL_SIZE]
      const ort = (window as any).ort;
      const inputTensor = new ort.Tensor("float32", tensor, [
        1,
        3,
        MODEL_SIZE,
        MODEL_SIZE,
      ]);

      // Run inference — input name is "images"
      const feeds: Record<string, any> = {};
      feeds[session.inputNames[0]] = inputTensor;

      const outputMap = await session.run(feeds);
      const outputTensor = outputMap[session.outputNames[0]];

      // YOLOv10 output: [N, 6] or [1, N, 6] — NMS-free
      const outputData = outputTensor.data as Float32Array;
      const dims = outputTensor.dims as number[];

      const detections = parseYoloOutput(outputData, dims, letterbox);

      const isDebug = typeof window !== "undefined" && (window as any).__LAYOUT_DEBUG;

      if (isDebug) {
        console.log(
          `[LayoutDetection] Page ${i + 1}: dims=${dims.join("x")}, ` +
          `originalSize=${letterbox.originalWidth}x${letterbox.originalHeight}, ` +
          `scale=${letterbox.scale.toFixed(3)}, pad=(${letterbox.padX},${letterbox.padY}), ` +
          `rawRows=${dims.length === 3 ? dims[1] : dims[0]}, ` +
          `detections=${detections.length}`,
        );
      }

      if (detections.length > 0) {
        if (isDebug) {
          for (const d of detections) {
            console.log(
              `  [LayoutDetection]   ${d.class} conf=${d.confidence} ` +
              `pos=(${d.position.x.toFixed(1)}%, ${d.position.y.toFixed(1)}%, ` +
              `${d.position.width.toFixed(1)}%x${d.position.height.toFixed(1)}%)`,
            );
          }
        }
        results.push({
          page: i + 1,
          detections,
        });
      }
    }

    if (results.length > 0) {
      const totalDetections = results.reduce((sum, r) => sum + r.detections.length, 0);
      console.log(`[LayoutDetection] ${totalDetections} detection(s) across ${results.length} page(s)`);
    }

    return results;
  } catch (err) {
    console.warn("[LayoutDetection] ONNX detection failed, will use LLM fallback:", err);
    return [];
  }
}
