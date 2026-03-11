import type FileProcessor from "./processor";
import type { ProcessedFile } from "./types.d";
import { resizeImage } from "$lib/images";
import { THUMBNAIL_SIZE, PROCESS_SIZE } from "./CONFIG";
import { apiFetch } from "$lib/api/client";
const DEFAULT_DELAY = 20;

export async function processImages(images: string[]): Promise<ProcessedFile> {
  return new Promise(async (resolve, reject) => {
    const resizedImages = await Promise.all(
      images.map(async (image) => resizeImage(image, PROCESS_SIZE)),
    );

    /*        console.log('Number of images', resizedImages.length);*/

    const response = await apiFetch("/v1/import/extract", {
      method: "POST",
      body: JSON.stringify({
        images: resizedImages,
      }),
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
    const taskThumbnail = processed.pages[0]?.thumbnail || "";
    processed.taskThumbnail = taskThumbnail;

    resolve(processed);
  });
}

export async function processImage(image: string): Promise<ProcessedFile> {
  return new Promise(async (resolve, reject) => {
    return processImages([image]);
  });
}
