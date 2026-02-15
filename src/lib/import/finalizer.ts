/**
 * Finalizer: converts extraction/analysis results into Documents, encrypts, and saves.
 * Extracted from components/import/Index.svelte for reuse in job-based flow.
 */

import { DocumentState, type Document as ImportDocument } from './index'
import {
	DocumentType,
	type DocumentNew,
	type Document as SavedDocument
} from '$lib/documents/types.d'
import { addDocument } from '$lib/documents'
import { processHealthData } from '$lib/health/signals'
import { createVirtualProfile } from '$lib/profiles'
import { PROFILE_NEW_ID } from '$lib/profiles/tools'
import type { Profile } from '$lib/types.d'
import type { Assessment, ReportAnalysis, ImportJob } from './types'
import { importKey, decrypt as decryptAES } from '$lib/encryption/aes'
import { decrypt as decryptRSA } from '$lib/encryption/rsa'
import type { User } from '@supabase/supabase-js'

// Attachment processing
import { selectPagesFromPdf, createPdfFromImageBuffers } from '$lib/files/pdf'
import { toBase64, base64ToArrayBuffer } from '$lib/arrays'
import { resizeImage } from '$lib/images'
import { THUMBNAIL_SIZE } from '$lib/files/CONFIG'

/**
 * Decrypt extraction and analysis results from an encrypted import job.
 * Requires the user's private key to unwrap the job encryption key.
 * Falls back to plaintext results if encryption is not used.
 */
export async function decryptJobResults(
	job: ImportJob,
	userPrivateKey?: CryptoKey
): Promise<{
	extraction: Assessment[]
	analysis: ReportAnalysis[]
}> {
	// Check if job has encrypted results
	const hasEncryptedResults =
		job.result_encryption_key && job.encrypted_extraction_result && job.encrypted_analysis_results

	if (hasEncryptedResults) {
		// Decrypt encrypted results
		if (!userPrivateKey) {
			throw new Error('User private key required to decrypt job results')
		}

		const jobKeyExported = await decryptRSA(userPrivateKey, job.result_encryption_key!)
		const jobKey = await importKey(jobKeyExported)

		const extractionJson = await decryptAES(jobKey, job.encrypted_extraction_result!)
		const extraction = JSON.parse(extractionJson)

		const analysisJson = await decryptAES(jobKey, job.encrypted_analysis_results!)
		const analysis = JSON.parse(analysisJson)

		return { extraction, analysis }
	} else {
		// Fallback to plaintext results (backwards compatible)
		console.warn('Job has no encrypted results - using plaintext fallback')
		console.log('job.extraction_result:', job.extraction_result)
		console.log('job.analysis_results:', job.analysis_results)
		console.log('job.extraction_result type:', typeof job.extraction_result, Array.isArray(job.extraction_result))
		console.log('job.analysis_results type:', typeof job.analysis_results, Array.isArray(job.analysis_results))
		return {
			extraction: job.extraction_result || [],
			analysis: job.analysis_results || []
		}
	}
}

/**
 * Assemble import Documents from extraction/analysis results.
 * If originalFiles are provided, creates PDF attachments from them.
 */
export async function assembleDocuments(
  extractionResults: Assessment[],
  analysisResults: ReportAnalysis[],
  originalFiles?: File[] | null,
): Promise<ImportDocument[]> {
  const documents: ImportDocument[] = [];
  let analysisIndex = 0;

  for (let ai = 0; ai < extractionResults.length; ai++) {
    const assessment = extractionResults[ai];
    const originalFile = originalFiles?.[ai];

    for (let di = 0; di < assessment.documents.length; di++) {
      const doc = assessment.documents[di];
      const analysis = analysisResults[analysisIndex];
      analysisIndex++;

      const reportData = analysis?.report || {};

      // Create attachment from original file
      let attachment: { thumbnail: string; type: string; file: string; path: string; url: string } | null = null;

      if (originalFile) {
        const docPages = assessment.pages.filter((p) => doc.pages.includes(p.page));

        try {
          if (originalFile.type === "application/pdf") {
            const pdfBuffer = await originalFile.arrayBuffer();

            let thumbnail = docPages[0]?.thumbnail || "";
            if (!thumbnail) {
              try {
                const { processPDF } = await import("$lib/files/pdf");
                const processedPdf = await processPDF(pdfBuffer, originalFile.name);
                thumbnail = processedPdf.pages[0]?.thumbnail || "";
              } catch {
                // Skip thumbnail generation
              }
            }

            const extractedPdf = await selectPagesFromPdf(
              pdfBuffer,
              doc.pages.map((p) => p + 1),
            );

            attachment = {
              thumbnail,
              type: "application/pdf",
              file: await toBase64(extractedPdf),
              path: "",
              url: "",
            };
          } else if (originalFile.type.startsWith("image/")) {
            const reader = new FileReader();
            const originalImageBase64 = await new Promise<string>((resolve, reject) => {
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(originalFile);
            });

            const base64Data = originalImageBase64.split(",")[1];
            const imageBuffer = base64ToArrayBuffer(base64Data);
            const thumbnail = await resizeImage(originalImageBase64, THUMBNAIL_SIZE);
            const pdfBuffer = await createPdfFromImageBuffers([imageBuffer]);

            attachment = {
              thumbnail,
              type: "application/pdf",
              file: await toBase64(pdfBuffer),
              path: "",
              url: "",
            };
          }
        } catch (error) {
          console.error("Failed to create attachment:", error);
        }
      }

      const content: any = {
        tags: analysis?.tags || [],
        title: reportData.title || doc.title,
        date: reportData.date || doc.date,
        category: reportData.category || analysis?.cagegory || "report",
        summary: reportData.summary,
        diagnosis: reportData.diagnosis,
        bodyParts: reportData.bodyParts,
        signals: reportData.signals || analysis?.signals,
        recommendations: reportData.recommendations,
        ...reportData,
      };

      documents.push({
        title: reportData.title || doc.title || `Document ${ai + 1}-${di + 1}`,
        date: reportData.date || doc.date || new Date().toISOString(),
        isMedical: analysis?.isMedical !== undefined ? analysis.isMedical : doc.isMedical,
        state: DocumentState.PROCESSED,
        pages: assessment.pages.filter((p) => doc.pages.includes(p.page)),
        content,
        attachments: attachment ? [attachment] : [],
        type: (originalFile?.type || "application/pdf") as any,
        files: originalFile ? [originalFile] : [] as any,
        task: undefined as any,
      } as unknown as ImportDocument);
    }
  }

  return documents;
}

interface ProfileAssignment {
  profile: Profile;
  reports: ImportDocument[];
}

/**
 * Save documents to the database with encryption and health data processing.
 * Returns array of saved documents.
 */
export async function saveDocuments(
  byProfileDetected: ProfileAssignment[],
): Promise<SavedDocument[]> {
  const savedDocuments: SavedDocument[] = [];

  for (const profileDetected of byProfileDetected) {
    // Create profile if it's a new one
    if (profileDetected.profile.id === PROFILE_NEW_ID) {
      profileDetected.profile = await createVirtualProfile(profileDetected.profile);
    }

    const signals: any[] = [];

    for (const document of profileDetected.reports) {
      const content = document.content as any;

      // Debug: Log content structure
      console.log('📄 [Finalizer] Processing document:', {
        hasContent: !!content,
        contentKeys: content ? Object.keys(content) : [],
        title: content?.title,
        category: content?.category,
        date: content?.date,
        isMedical: document.isMedical,
      });

      const documentNew: DocumentNew = {
        user_id: profileDetected.profile.id,
        type: DocumentType.document,
        metadata: {
          title: content.title,
          tags: content.tags,
          date: content.date,
          category: content.category,
          language: (document as any).language || "English",
        },
        content: content,
        attachments: document.attachments?.map((a) => ({
          ...a,
          path: (a as any).path || "",
          url: (a as any).url || "",
        })) || [],
      };

      if (content.summary) {
        documentNew.metadata!.summary = content.summary;
      }
      if (content.diagnosis) {
        documentNew.metadata!.diagnosis = content.diagnosis;
      }

      if (content.signals) {
        // Handle both legacy array format and new wrapped format
        let signalsArray: any[] = [];

        if (Array.isArray(content.signals)) {
          signalsArray = content.signals;
        } else if (content.signals.signals && Array.isArray(content.signals.signals)) {
          signalsArray = content.signals.signals;
        } else {
          console.warn('Signals data is not in expected format:', content.signals);
        }

        if (signalsArray.length > 0) {
          signals.push(...signalsArray);
          documentNew.metadata!.signals = signalsArray.map(
            (signal: any) => signal.signal || signal.test,
          );
        }
      }

      // Debug: Log document structure before saving
      console.log('📋 [Finalizer] Document to save:', {
        type: documentNew.type,
        hasMetadata: !!documentNew.metadata,
        metadata: documentNew.metadata,
        hasContent: !!documentNew.content,
        contentKeys: documentNew.content ? Object.keys(documentNew.content) : [],
        attachmentsCount: documentNew.attachments?.length || 0,
      });

      const newSavedDocument = await addDocument(documentNew);

      // Process all health data
      await processHealthData(
        content,
        profileDetected.profile.id,
        newSavedDocument.id,
      );

      savedDocuments.push(newSavedDocument);
    }
  }

  return savedDocuments;
}
