import type FileProcessor from "./processor";
import type { ProcessedFile } from "./types.d";
import { resizeImage } from "$lib/images";
import { THUMBNAIL_SIZE, PROCESS_SIZE } from "./CONFIG";
import { apiFetch } from "$lib/api/client";
const DEFAULT_DELAY = 20;

export async function processImages(images: string[]): Promise<ProcessedFile> {
  const resizedImages = await Promise.all(
    images.map(async (image) => resizeImage(image, PROCESS_SIZE)),
  );

  const response = await apiFetch("/v1/import/extract", {
    method: "POST",
    body: JSON.stringify({
      images: resizedImages,
    }),
    timeout: 120000, // 2 minutes for heavy OCR
  });

  const processed = await response.json();

  // attach original images and thumbnails
  processed.pages = await Promise.all(
    processed.pages.map(async (page: any, index: number) => {
      const image = images[index];
      return {
        ...page,
        image,
        thumbnail: await resizeImage(image, THUMBNAIL_SIZE),
      };
    }),
  );

  // Extract first page thumbnail for task preview
  processed.taskThumbnail = processed.pages[0]?.thumbnail || "";

  return processed;
}

export async function processImage(image: string): Promise<ProcessedFile> {
  return processImages([image]);
}
