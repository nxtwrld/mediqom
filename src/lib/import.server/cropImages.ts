/**
 * Image cropping utility for extracting detected image regions from document pages.
 * Uses sharp for server-side image processing.
 */
import { Buffer } from "node:buffer";
import sharp from "sharp";
import { DEBUG_IMPORT } from "$env/static/private";

const VERBOSE = DEBUG_IMPORT === "true";

export interface DetectedImage {
  type: string;
  description?: string;
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface CroppedImage {
  type: string;
  description?: string;
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  data: string; // base64 data URL
}

/** Padding percentage to add around each crop for AI bounding box imprecision */
const PADDING_PCT = 5;
/** Minimum crop size in pixels — skip smaller regions as noise */
const MIN_CROP_PX = 20;

/**
 * Crop detected image regions from a page image.
 *
 * @param pageImageBase64 - The full page image as a base64 data URL (data:image/...) or raw base64
 * @param detectedImages - Array of image regions detected by OCR with percentage-based positions
 * @returns Array of cropped images with base64 data URLs
 */
export async function cropDetectedImages(
  pageImageBase64: string,
  detectedImages: DetectedImage[],
): Promise<CroppedImage[]> {
  if (!detectedImages || detectedImages.length === 0) {
    return [];
  }

  // Strip data URL prefix if present
  const base64Data = pageImageBase64.includes(",")
    ? pageImageBase64.split(",")[1]
    : pageImageBase64;

  const imageBuffer = Buffer.from(base64Data, "base64");

  // Get image dimensions
  const metadata = await sharp(imageBuffer).metadata();
  const imgWidth = metadata.width;
  const imgHeight = metadata.height;

  if (!imgWidth || !imgHeight) {
    console.warn("Could not determine image dimensions for cropping");
    return [];
  }

  const results: CroppedImage[] = [];

  if (VERBOSE) console.log(`[cropImages] ${imgWidth}x${imgHeight}, ${detectedImages.length} regions`);

  for (const detected of detectedImages) {
    const { position } = detected;

    // Convert percentage positions to pixels
    let left = Math.round((position.x / 100) * imgWidth);
    let top = Math.round((position.y / 100) * imgHeight);
    let width = Math.round((position.width / 100) * imgWidth);
    let height = Math.round((position.height / 100) * imgHeight);

    // Add padding for AI bounding box imprecision
    const padX = Math.round((PADDING_PCT / 100) * imgWidth);
    const padY = Math.round((PADDING_PCT / 100) * imgHeight);
    left = Math.max(0, left - padX);
    top = Math.max(0, top - padY);
    width = Math.min(imgWidth - left, width + 2 * padX);
    height = Math.min(imgHeight - top, height + 2 * padY);

    if (VERBOSE) {
      console.log(`[cropImages] ${detected.type}: (${left},${top} ${width}x${height})`);
    }

    // Skip crops smaller than minimum size
    if (width < MIN_CROP_PX || height < MIN_CROP_PX) {
      if (VERBOSE) console.log(`[cropImages]   SKIPPED: too small (min ${MIN_CROP_PX}px)`);
      continue;
    }

    try {
      const croppedBuffer = await sharp(imageBuffer)
        .extract({ left, top, width, height })
        .jpeg({ quality: 85 })
        .toBuffer();

      const croppedBase64 = `data:image/jpeg;base64,${croppedBuffer.toString("base64")}`;

      results.push({
        type: detected.type,
        description: detected.description,
        position: detected.position,
        data: croppedBase64,
      });
    } catch (err) {
      console.warn(
        `Failed to crop image region (${left},${top} ${width}x${height}):`,
        err,
      );
    }
  }

  return results;
}
