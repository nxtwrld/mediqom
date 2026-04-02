/**
 * Image pre-processing for DocLayout-YOLO model input.
 * Loads base64 images, letterboxes to model size, and extracts NCHW tensor.
 */

/** Model input dimensions */
export const MODEL_SIZE = 1024;

/** Letterbox fill color (gray, normalized 114/255) */
const PAD_VALUE = 114;

export interface LetterboxInfo {
  scale: number;
  padX: number;
  padY: number;
  originalWidth: number;
  originalHeight: number;
}

/**
 * Load a base64 data URL image into an ImageData object via OffscreenCanvas/Canvas.
 */
async function loadImage(base64DataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = base64DataUrl;
  });
}

/**
 * Pre-process a base64 image for YOLO model input.
 * - Letterbox to MODEL_SIZE x MODEL_SIZE (preserving aspect ratio, gray padding)
 * - Extract NCHW Float32Array normalized to [0, 1]
 *
 * @returns tensor data and letterbox info for coordinate conversion
 */
export async function preprocessImage(
  base64DataUrl: string,
): Promise<{ tensor: Float32Array; letterbox: LetterboxInfo }> {
  const img = await loadImage(base64DataUrl);
  const { width: origW, height: origH } = img;

  // Compute letterbox scale and padding
  const scale = Math.min(MODEL_SIZE / origW, MODEL_SIZE / origH);
  const newW = Math.round(origW * scale);
  const newH = Math.round(origH * scale);
  const padX = Math.round((MODEL_SIZE - newW) / 2);
  const padY = Math.round((MODEL_SIZE - newH) / 2);

  // Draw onto canvas with letterbox
  const canvas = document.createElement("canvas");
  canvas.width = MODEL_SIZE;
  canvas.height = MODEL_SIZE;
  const ctx = canvas.getContext("2d")!;

  // Fill with gray padding
  ctx.fillStyle = `rgb(${PAD_VALUE}, ${PAD_VALUE}, ${PAD_VALUE})`;
  ctx.fillRect(0, 0, MODEL_SIZE, MODEL_SIZE);

  // Draw resized image centered
  ctx.drawImage(img, padX, padY, newW, newH);

  // Extract pixel data
  const imageData = ctx.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE);
  const { data } = imageData;

  // Convert to NCHW Float32Array [1, 3, H, W] normalized to [0, 1]
  const totalPixels = MODEL_SIZE * MODEL_SIZE;
  const tensor = new Float32Array(3 * totalPixels);

  for (let i = 0; i < totalPixels; i++) {
    const offset = i * 4; // RGBA
    tensor[i] = data[offset] / 255; // R channel
    tensor[totalPixels + i] = data[offset + 1] / 255; // G channel
    tensor[2 * totalPixels + i] = data[offset + 2] / 255; // B channel
  }

  return {
    tensor,
    letterbox: {
      scale,
      padX,
      padY,
      originalWidth: origW,
      originalHeight: origH,
    },
  };
}
