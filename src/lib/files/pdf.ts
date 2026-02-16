import type { ProcessedFile, ProcessedPage } from "./types.d";
import type { PDFPageProxy, PDFDocumentProxy } from "pdfjs-dist";
import { PDFDocument } from "pdf-lib";
import { processImages } from "./image";
import { merge as mergeImages, getImageMimeTypeFromBuffer } from "$lib/images";
import { THUMBNAIL_SIZE, PROCESS_SIZE } from "./CONFIG";
import { typedArrayToBuffer } from "$lib/arrays";

export enum CODES {
  PASSWORD = "require.password",
  PASSWORD_INCORRECT = "password.incorrect",
}

const TOLERANCE = 3;
const TOP_OFFSET = 15;
const SCALE = 2;

export async function processPDF(
  arrayBuffer: ArrayBuffer,
  password: string | undefined = undefined,
): Promise<ProcessedFile> {
  try {
    console.log("Processing PDF", password);
    const options: {
      data: ArrayBuffer;
      password?: string;
    } = {
      data: arrayBuffer.slice(0),
    };
    if (password) {
      options.password = password;
    }

    const pdfDoc = await loadPdfDocument(options);

    return processInternal(pdfDoc);
  } catch (error: any) {
    if (error.name === "PasswordException") {
      const passwordNew = prompt("Enter password");
      if (passwordNew) {
        return processPDF(arrayBuffer, passwordNew);
      } else {
        throw new Error(CODES.PASSWORD);
      }
      //throw new Error(CODES.PASSWORD);
    } else {
      throw new Error(error);
    }
  }
}

export async function selectPagesFromPdf(
  sourcePdfArrayBuffer: ArrayBuffer,
  pagesForFirstPdf: number[],
  //pagesForSecondPdf: number[]
  password: string | undefined = undefined,
): Promise<ArrayBuffer> {
  // Load the source PDF document from the ArrayBuffer
  const sourcePdf = await PDFDocument.load(sourcePdfArrayBuffer, {
    ignoreEncryption: true,
  });

  // Validate page count — pdf-lib may not load all pages from certain PDF structures
  const pageCount = sourcePdf.getPageCount();
  const validIndices = pagesForFirstPdf
    .map((n) => n - 1)
    .filter((i) => i >= 0 && i < pageCount);

  if (validIndices.length === 0) {
    throw new Error(
      `No valid pages (requested: [${pagesForFirstPdf}], pdf-lib found: ${pageCount})`,
    );
  }

  // Create new PDF documents for the split PDFs
  const firstPdf = await PDFDocument.create();

  // Copy selected pages to the first PDF
  const firstPdfPages = await firstPdf.copyPages(sourcePdf, validIndices);
  firstPdfPages.forEach((page) => firstPdf.addPage(page));

  // Copy selected pages to the second PDF
  /*
    const secondPdfPages = await secondPdf.copyPages(
      sourcePdf,
      pagesForSecondPdf.map((pageNumber) => pageNumber - 1)
    );
    */
  //secondPdfPages.forEach((page) => secondPdf.addPage(page));

  // Save the new PDFs as Uint8Array
  const firstPdfBytes = typedArrayToBuffer(await firstPdf.save());
  //const secondPdfBytes = typedArrayToBuffer(await secondPdf.save());
  return firstPdfBytes;
  //return { firstPdfBytes, secondPdfBytes };
}

export async function createPdfFromImageBuffers(
  imageBuffers: ArrayBuffer[],
): Promise<ArrayBuffer> {
  // Create a new PDFDocument
  const pdfDoc = await PDFDocument.create();

  for (const imageBuffer of imageBuffers) {
    let img;
    const mimeType = getImageMimeTypeFromBuffer(imageBuffer);
    if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
      img = await pdfDoc.embedJpg(imageBuffer);
    } else if (mimeType === "image/png") {
      img = await pdfDoc.embedPng(imageBuffer);
    } else {
      throw new Error(`Unsupported image type: ${mimeType}`);
    }

    const imgDims = img.scale(1);

    // Add a page with dimensions matching the image
    const page = pdfDoc.addPage([imgDims.width, imgDims.height]);

    // Draw the image onto the page
    page.drawImage(img, {
      x: 0,
      y: 0,
      width: imgDims.width,
      height: imgDims.height,
    });
  }

  // Serialize the PDFDocument to bytes (a Uint8Array)
  const pdfBytes = await pdfDoc.save();
  return typedArrayToBuffer(pdfBytes);
}

export async function checkPassword(
  data: ArrayBuffer,
  name: string = "file",
): Promise<string | undefined | Error> {
  let password: string | null | undefined = undefined;
  while (password !== null) {
    try {
      const options: {
        data: ArrayBuffer;
        password?: string;
      } = {
        data: data.slice(0),
      };
      if (password) {
        options.password = password;
      }
      await loadPdfDocument(options);
      return password;
    } catch (error: any) {
      if (error.name === "PasswordException") {
        password = prompt("Please, enter password for " + name);
      } else {
        throw new Error(error);
      }
    }
  }
  return new Error("Password not provided");
}

async function processInternal(
  pdfDoc: PDFDocumentProxy,
): Promise<ProcessedFile> {
  const thumbnail = await makeThumb(await pdfDoc.getPage(1));
  //fileProcessor?.emit('thumbnail', thumbnail);

  // no text was extracted, it is probably PDF scan so we'll try to extract images instead and OCR them
  const base64Images = await renderPDFToBase64Images(pdfDoc);

  let imagesCount = base64Images.length;

  let text: string = "";
  let tags: string[] = [];
  const pages: ProcessedPage[] = [];

  let index = 0;

  const processedImages = await processImages(base64Images);

  //if (fileProcessor) fileProcessor.emit('progress', 'extract', 100);

  // Extract first page thumbnail for task preview
  const taskThumbnail = processedImages.pages[0]?.thumbnail || "";

  return {
    ...processedImages,
    taskThumbnail,
  };
}

export async function loadPdfDocument(config: any) {
  // Dynamically import pdf.js
  const { pdfjsLib } = await import("./lazyPdfjs");

  // Now, use getDocument to load your PDF
  const loadingTask = pdfjsLib.getDocument(config);
  return loadingTask.promise;
}

// Export for use in createTasks() to pre-process PDFs
export async function renderPDFToBase64Images(
  pdfDoc: PDFDocumentProxy,
): Promise<string[]> {
  let base64Images: string[] = [];

  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    //await page.render({ canvasContext: ctx, viewport }).promise;
    base64Images.push(await renderPDFPageToBase64Image(page)); // Get base64 representation
  }

  return base64Images;
}

async function renderPDFPageToBase64Image(page: PDFPageProxy): Promise<string> {
  const viewport = page.getViewport({ scale: SCALE });
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2D context from canvas");
  canvas.height = viewport.height;
  canvas.width = viewport.width;

  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL();
}

export async function makeThumb(page: PDFPageProxy): Promise<string> {
  const viewport = page.getViewport({ scale: 1 });
  const canvas = document.createElement("canvas");
  const scale = Math.min(
    THUMBNAIL_SIZE / viewport.width,
    THUMBNAIL_SIZE / viewport.height,
  );
  canvas.width = viewport.width * scale;
  canvas.height = viewport.height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2D context from canvas");

  return page
    .render({
      canvasContext: ctx,
      viewport: page.getViewport({ scale }),
    })
    .promise.then(function () {
      return canvas.toDataURL("image/png");
    });
}
