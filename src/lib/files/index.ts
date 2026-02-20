import { readAsArrayBuffer, readAsText, readAsBase64 } from "./reader";
import {
  processPDF,
  CODES as PDF_CODES,
  loadPdfDocument,
  renderPDFToBase64Images,
  makeThumb,
} from "./pdf";
import { processImages } from "./image";
import type {
  Assessment,
  AssessmentDocument,
  AssessmentPage,
} from "../import.server/assessInputs";
import { type Document, DocumentState } from "../import/index";
import type { DocumentNew } from "$lib/documents/types.d";
import { DocumentType } from "$lib/documents/types.d";
import { writable, type Writable } from "svelte/store";
import { selectPagesFromPdf, createPdfFromImageBuffers } from "$lib/files/pdf";
import { type Task, TaskState } from "../import/index";

// Re-export Task and TaskState for use in other modules
export { type Task, TaskState };
import { toBase64, base64ToArrayBuffer } from "$lib/arrays";
import { checkPassword } from "./pdf";
// IMPORTANT: Do not import dicomHandler at module level - causes server-side issues on Vercel
// import { dicomHandler } from "./dicom-handler";
import { resizeImage } from "$lib/images";
import { THUMBNAIL_SIZE, PROCESS_SIZE } from "./CONFIG";
import { browser } from "$app/environment";

export const files: Writable<File[]> = writable([]);

/**
 * Process DICOM-extracted images (already converted to PNG)
 */
async function processDicomImages(
  images: string[],
  dicomMetadata: any,
): Promise<AssessmentClient> {
  return new Promise(async (resolve, reject) => {
    try {
      // Resize images for processing (if needed)
      const resizedImages = await Promise.all(
        images.map(async (image) => resizeImage(image, PROCESS_SIZE)),
      );

      // Enhanced request with DICOM metadata - call specialized medical imaging endpoint
      const response = await fetch("/v1/import/medical-imaging", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          images: resizedImages,
          language: "English", // Default language for DICOM processing
          metadata: {
            isDicomExtracted: true,
            imageSource: "dicom",
            dicomMetadata: dicomMetadata,
          },
        }),
      });

      const processed = await response.json();

      // Attach original images and thumbnails
      processed.pages = await Promise.all(
        processed.pages.map(async (page: any, index: number) => {
          const image = images[index];
          return {
            ...page,
            image,
            thumbnail: await resizeImage(image, THUMBNAIL_SIZE),
            dicomMetadata: dicomMetadata, // Include DICOM context
          };
        }),
      );

      resolve(processed);
    } catch (error) {
      console.error("❌ Error processing DICOM images:", error);
      reject(error);
    }
  });
}

interface AssessmentPagesClient extends AssessmentPage {
  image?: string;
  thumbnail?: string;
  type?: string;
}

interface AssessmentClient extends Assessment {
  pages: AssessmentPagesClient[];
}

export async function createTasks(files: File[]): Promise<Task[]> {
  const tasks: Task[] = [];

  console.log(
    "🔍 FILE ANALYSIS - Analyzing",
    files.length,
    "file(s) for import:",
  );
  console.log(
    "Files:",
    files.map(
      (f) => `${f.name} (${(f.size / 1024 / 1024).toFixed(2)}MB, ${f.type})`,
    ),
  );

  // split the files into images, DICOM, and the rest
  const groupped = {
    images: [] as File[],
    dicom: [] as File[],
    rest: [] as File[],
  };

  for (let file of files) {
    const fileSizeMB = (file.size / 1024 / 1024).toFixed(2);

    if (file.type.startsWith("image")) {
      console.log(
        `📷 IMAGE DETECTED: ${file.name} (${fileSizeMB}MB) - Will process as image document`,
      );
      groupped.images.push(file);
    } else if (
      browser &&
      (await (async () => {
        // Dynamically import DICOM handler only in browser
        const { dicomHandler } = await import("./dicom-handler");
        return dicomHandler.detectDicomFile(file);
      })())
    ) {
      console.log(
        `🏥 DICOM DETECTED: ${file.name} (${fileSizeMB}MB) - Will extract medical imaging data`,
      );
      groupped.dicom.push(file);
    } else {
      console.log(
        `📄 DOCUMENT DETECTED: ${file.name} (${fileSizeMB}MB, ${file.type}) - Will process as document`,
      );
      groupped.rest.push(file);
    }
  }

  // Log processing strategy summary
  console.log("📋 PROCESSING STRATEGY SUMMARY:");
  console.log(
    `  • Images: ${groupped.images.length} files → Image OCR + AI analysis`,
  );
  console.log(
    `  • DICOM: ${groupped.dicom.length} files → Medical imaging extraction + specialized analysis`,
  );
  console.log(
    `  • Documents: ${groupped.rest.length} files → Document processing (PDF, etc.)`,
  );
  console.log(
    "⚠️  PAUSING before server submission - waiting for user confirmation...",
  );

  // process DICOM files first - CRITICAL: if ANY DICOM processing fails, TERMINATE import
  for (const dicomFile of groupped.dicom) {
    try {
      console.log(`🏥 Processing DICOM file: ${dicomFile.name}`);

      // Only process DICOM in browser environment
      if (!browser) {
        throw new Error("DICOM processing requires browser environment");
      }

      // Dynamically import DICOM handler
      const { dicomHandler } = await import("./dicom-handler");
      const dicomResult = await dicomHandler.processDicomFile(dicomFile);

      // Validate that we actually extracted images
      if (
        !dicomResult.extractedImages ||
        dicomResult.extractedImages.length === 0
      ) {
        throw new Error("No images extracted from DICOM file");
      }

      tasks.push({
        title: dicomFile.name,
        type: "application/dicom",
        icon: "dicom",
        data: dicomResult.extractedImages, // Base64 PNG images
        dicomMetadata: dicomResult.metadata,
        originalDicom: dicomResult.originalDicomBuffer,
        thumbnail: dicomResult.thumbnails[0], // Store first thumbnail for task preview
        state: TaskState.NEW,
        files: [dicomFile],
      });

      console.log(
        `✅ DICOM processing completed for: ${dicomFile.name} - Extracted ${dicomResult.extractedImages.length} images`,
      );
    } catch (error) {
      console.error(`❌ DICOM processing failed for ${dicomFile.name}:`, error);
      console.error(
        `🛑 TERMINATING IMPORT - DICOM processing is required for medical imaging files`,
      );

      // CRITICAL: Throw error to terminate the entire import process
      throw new Error(
        `DICOM processing failed for ${dicomFile.name}: ${(error as Error).message}. Import terminated to prevent sending empty data to server.`,
      );
    }
  }

  // process individual files 1 by 1 (not multipage or dealt with inside the processPDF)
  while (groupped.rest.length > 0) {
    const file = groupped.rest[0];
    switch (file.type) {
      case "application/pdf":
        const data = await readAsArrayBuffer(file);
        // checkPassword already prompts user if PDF is encrypted
        let password = await checkPassword(data, file.name);
        if (!(password instanceof Error)) {
          console.log(
            "Password obtained for PDF:",
            file.name,
            password ? "(protected)" : "(unprotected)",
          );

          try {
            // Pre-process PDF to base64 images for SSE compatibility
            console.log(
              `📄 Pre-processing PDF: ${file.name} - Converting to base64 images`,
            );

            const options: { data: ArrayBuffer; password?: string } = {
              data: data.slice(0),
            };
            if (password) {
              options.password = password;
            }

            // Load PDF document (password already validated by checkPassword)
            const pdfDoc = await loadPdfDocument(options);

            // Convert all pages to base64 images
            const base64Images = await renderPDFToBase64Images(pdfDoc);

            // Generate thumbnail from first page
            const thumbnail = await makeThumb(await pdfDoc.getPage(1));

            console.log(
              `✅ PDF pre-processing completed: ${file.name} - Extracted ${base64Images.length} pages as base64 images`,
            );

            // For password-protected PDFs, create an unencrypted image-based clone
            // so the finalizer can split pages without dealing with encryption
            let finalFile = file;
            let finalData = data;
            if (password) {
              try {
                const imageBuffers = base64Images.map((dataUrl) =>
                  base64ToArrayBuffer(dataUrl.split(",")[1]),
                );
                const cleanPdfBuffer =
                  await createPdfFromImageBuffers(imageBuffers);
                finalFile = new File([cleanPdfBuffer], file.name, {
                  type: "application/pdf",
                });
                finalData = cleanPdfBuffer;
              } catch (decryptCloneError) {
                console.warn(
                  "Failed to create decrypted PDF clone, using original:",
                  decryptCloneError,
                );
              }
            }

            tasks.push({
              title: file.name,
              type: "application/pdf",
              icon: "pdf",
              data: base64Images, // Store base64 images for SSE processing
              password,
              originalPdf: finalData, // Store (possibly decrypted) PDF for attachment creation
              thumbnail,
              state: TaskState.NEW,
              files: [finalFile],
            });
          } catch (error) {
            console.error(
              `❌ PDF pre-processing failed for ${file.name}:`,
              error,
            );
            throw new Error(
              `PDF pre-processing failed for ${file.name}: ${(error as Error).message}`,
            );
          }
        } else {
          console.log("Cannot obtain password for PDF:", file.name);
        }
        break;
      default:
        //reject('Unsupported file type');
        console.log("Unsupported file type", file.type);
        break;
    }
    groupped.rest.shift();
  }

  // width images we do not if they are just multiple pages for the same document or different documents - lets assess them
  if (groupped.images.length > 0) {
    const imageData = await Promise.all(
      groupped.images.map(async (file) => {
        return await readAsBase64(file);
      }),
    );

    // Generate thumbnail from first image for immediate preview
    const taskThumbnail =
      imageData.length > 0
        ? await resizeImage(imageData[0], THUMBNAIL_SIZE)
        : undefined;

    tasks.push({
      title: "Images",
      type: "images",
      icon: groupped.images[0].type.split("/")[1],
      data: imageData,
      thumbnail: taskThumbnail,
      state: TaskState.NEW,
      files: groupped.images,
    });
  }
  return tasks;
}

export async function processTask(task: Task): Promise<DocumentNew[]> {
  switch (task.type) {
    case "application/pdf":
      return (await processPDF(task.data as ArrayBuffer, task.password).then(
        (assessment) => {
          // Update task with thumbnail from PDF processing
          if ("taskThumbnail" in assessment && assessment.taskThumbnail) {
            task.thumbnail = assessment.taskThumbnail;
          }
          return processMultipageAssessmentToDocumnets(
            assessment as AssessmentClient,
            [],
            task,
          );
        },
      )) as DocumentNew[];
    case "images":
      return (await processImages(task.data as string[]).then((assessment) => {
        // Update task with thumbnail from image processing
        if ("taskThumbnail" in assessment && assessment.taskThumbnail) {
          task.thumbnail = assessment.taskThumbnail;
        }
        return processMultipageAssessmentToDocumnets(
          assessment as AssessmentClient,
          [],
          task,
        );
      })) as DocumentNew[];
    case "application/dicom":
      return (await processDicomImages(
        task.data as string[], // Base64 PNG images
        task.dicomMetadata, // DICOM metadata
      ).then((assessment) => {
        return processMultipageAssessmentToDocumnets(assessment, [], task);
      })) as DocumentNew[];
    default:
      return Promise.reject("Unsupported task type");
  }
}

async function processMultipageAssessmentToDocumnets(
  assessment: AssessmentClient,
  documents: DocumentNew[],
  task: Task,
): Promise<DocumentNew[]> {
  await Promise.all(
    assessment.documents.map(async (doc) => {
      const pages = doc.pages.map((page, index) => {
        const pageData = assessment.pages.find((p) => p.page === page);
        return {
          page: index,
          language: doc?.language,
          type: pageData?.type,
          text: pageData?.text,
          image: pageData?.image,
          thumbnail: pageData?.thumbnail,
        };
      }) as {
        page: number;
        language: string;
        text: string;
        image?: string;
        thumbnail?: string;
        type?: string;
        dicomMetadata?: any;
      }[];

      let attachment: {
        path: string;
        url: string;
        type?: string;
        thumbnail?: string;
        file?: string;
      };
      switch (task.type) {
        case "application/pdf":
          // Use originalPdf (ArrayBuffer) for attachment, not task.data (base64 images)
          const pdf = task.originalPdf || (task.data as ArrayBuffer);
          //console.log('splitting pdf', pages.map((p) => p.page), pdf);

          attachment = {
            path: "", // Will be set by addDocument
            url: "", // Will be set by addDocument
            thumbnail: pages[0].thumbnail,
            type: "application/pdf",
            file: await toBase64(
              await selectPagesFromPdf(
                pdf,
                pages.map((p) => p.page + 1),
                task.password,
              ),
            ),
          };
          /*
                const a = document.createElement('a')
                a.href = URL.createObjectURL(new Blob(
                  [ attachment ],
                  { type: 'application/pdf' }
                ))
                a.download = 'fileName.pdf'
                a.click()*/
          break;
        case "images":
          // merge images into a single pdf
          const imageBuffers = pages
            .map((p) => p.image)
            .filter((img): img is string => img !== undefined);
          attachment = {
            path: "", // Will be set by addDocument
            url: "", // Will be set by addDocument
            thumbnail: pages[0].thumbnail,
            type: "application/pdf",
            file: await toBase64(
              await createPdfFromImageBuffers(imageBuffers as any),
            ),
          };
          break;
        case "application/dicom":
          // For DICOM files, store the original DICOM as the primary attachment
          attachment = {
            path: "", // Will be set by addDocument
            url: "", // Will be set by addDocument
            thumbnail: pages[0].thumbnail || "",
            type: "application/dicom",
            file: await toBase64(task.originalDicom!), // Original DICOM file
          };
          // Note: Extracted PNG images are available in pages[].image for AI processing
          break;
        default:
          throw new Error("Unsupported task type");
      }

      documents.push({
        ...doc,
        state: DocumentState.NEW,
        pages,
        type: DocumentType.document, // All imports are documents
        files: task.data,
        attachments: [attachment],
        task,
      } as any);
    }),
  );
  return documents;
}
