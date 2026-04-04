import type { FunctionDefinition } from "@langchain/core/language_models/base";
import { error, text } from "@sveltejs/kit";
import assessSchemaImage, {
  ocrExtractionSchema,
  documentAssessmentSchema,
  imageAnalysisSchema,
} from "$lib/configurations/import.assesments";
import { fetchGptEnhanced } from "$lib/ai/providers/enhanced-abstraction";
import { type Content, type TokenUsage } from "$lib/ai/types.d";
import { sleep } from "$lib/utils";
import { DEBUG_ASSESSER, DEBUG_IMPORT } from "$env/static/private";
import {
  type Assessment,
  type AssessmentDocument,
  type AssessmentPage,
  type PageLayoutDetection,
} from "$lib/import/types";
import {
  cropDetectedImages,
  type DetectedImage,
  type CroppedImage,
} from "./cropImages";
import { saveImportPhaseLog } from "./debug-output";

const DEBUG = DEBUG_ASSESSER === "true";
const VERBOSE = DEBUG_IMPORT === "true";

/** Chunked assessment constants */
const ASSESSMENT_CHUNK_SIZE = 8;
const ASSESSMENT_OVERLAP = 2;

type Input = {
  images: string[];
  /** Client-side layout detections from DocLayout-YOLO (if available) */
  layoutDetections?: PageLayoutDetection[];
  metadata?: {
    isDicomExtracted?: boolean;
    imageSource?: "dicom" | "upload";
    dicomMetadata?: any;
    imageContentType?:
      | "medical_imaging"
      | "document_scan"
      | "mixed_content"
      | "non_medical";
  };
};

// Re-export types from shared types
export type {
  Assessment,
  AssessmentDocument,
  AssessmentPage,
} from "$lib/import/types";

/** OCR-only extraction result (Pass 1) */
interface OcrResult {
  pages: {
    page: number;
    text: string;
    /** Whether this page contains non-text visual content */
    hasImages?: boolean;
  }[];
}

/** Result from the dedicated image analysis pass */
interface ImageAnalysisResult {
  images: {
    type: string;
    description?: string;
    position: { x: number; y: number; width: number; height: number };
  }[];
}

/** Document assessment result (Pass 2) */
interface DocumentAssessmentResult {
  documents: (AssessmentDocument & { hasImages?: boolean })[];
}

// ── Exported types for phased assessment ──────────────────────────

export { type OcrResult };

export type ProgressCallback = (stage: string, progress: number, message: string) => void;

// ── Phase 1: OCR extraction ───────────────────────────────────────

/**
 * Run OCR on every page image (parallel vision calls).
 * Returns structured text + hasImages flag per page.
 */
export async function assessOCR(
  images: string[],
  progressCallback?: ProgressCallback,
): Promise<{ ocrData: OcrResult; tokenUsage: TokenUsage }> {
  const tokenUsage: TokenUsage = { total: 0 };
  const totalPages = images.length;
  const allPages: OcrResult["pages"] = [];

  let ocrPagesCompleted = 0;
  const ocrPromises = images.map((image, i) => {
    const singleImageContent: Content[] = [
      {
        type: "image_url",
        image_url: { url: image, detail: "high" },
      },
    ];

    const pageTokenUsage: TokenUsage = { total: 0 };

    return fetchGptEnhanced(
      singleImageContent,
      ocrExtractionSchema,
      pageTokenUsage,
      "English",
      "ocr_extraction",
    ).then((pageResult) => {
      ocrPagesCompleted++;
      tokenUsage.total += pageTokenUsage.total;

      progressCallback?.(
        "ai_processing",
        20 + Math.round((ocrPagesCompleted / totalPages) * 40),
        `Pass 1: OCR page ${ocrPagesCompleted} of ${totalPages} complete`,
      );

      return { index: i, result: pageResult as OcrResult };
    });
  });

  const ocrResults = await Promise.all(ocrPromises);

  for (const { index, result: pageResult } of ocrResults.sort((a, b) => a.index - b.index)) {
    if (pageResult?.pages && Array.isArray(pageResult.pages)) {
      for (const p of pageResult.pages) {
        allPages.push({
          page: index + 1,
          text: p.text,
          hasImages: p.hasImages,
        });
      }
    } else if (typeof pageResult === "object" && "text" in (pageResult as any)) {
      allPages.push({ page: index + 1, text: (pageResult as any).text });
    }
  }

  const ocrData: OcrResult = { pages: allPages };

  if (!ocrData?.pages || !Array.isArray(ocrData.pages)) {
    throw new Error(
      `OCR extraction returned invalid data — the AI response may have been truncated. ` +
      `Expected { pages: [...] } but got: ${typeof ocrData}`
    );
  }

  return { ocrData, tokenUsage };
}

// ── Phase 2: Image cropping ───────────────────────────────────────

/**
 * Crop embedded images from pages using YOLO detections (preferred)
 * or LLM-based bounding-box detection as fallback.
 */
export async function assessImages(
  images: string[],
  ocrData: OcrResult,
  layoutDetections: PageLayoutDetection[] | undefined,
  progressCallback?: ProgressCallback,
): Promise<{ croppedImagesByPage: Map<number, CroppedImage[]>; tokenUsage: TokenUsage }> {
  const tokenUsage: TokenUsage = { total: 0 };
  const croppedImagesByPage = new Map<number, CroppedImage[]>();

  if (VERBOSE) {
    console.log(
      `[assess] layoutDetections: ${!!layoutDetections} (${layoutDetections?.length ?? 0}), pages: ${images.length}`,
    );
  }

  if (layoutDetections && layoutDetections.length > 0) {
    // Use client-provided DocLayout-YOLO bounding boxes (no LLM call needed)
    progressCallback?.(
      "ai_processing",
      62,
      `Using client-side layout detection for image extraction...`,
    );

    for (const pageLayout of layoutDetections) {
      const figures = pageLayout.detections.filter(
        (d) => ["figure", "picture"].includes(d.class) && d.confidence >= 0.3,
      );
      if (figures.length === 0) continue;

      const pageIndex = pageLayout.page - 1;
      if (pageIndex < 0 || pageIndex >= images.length) continue;

      const detectedImages: DetectedImage[] = figures.map((f) => ({
        type: f.class,
        position: f.position,
      }));

      const cropped = await cropDetectedImages(
        images[pageIndex],
        detectedImages,
      );
      if (cropped.length > 0) {
        croppedImagesByPage.set(pageLayout.page, cropped);
      }
    }

    const totalCropped = Array.from(croppedImagesByPage.values()).reduce((n, imgs) => n + imgs.length, 0);
    if (VERBOSE) {
      console.log(`[assess] YOLO: ${totalCropped} cropped images across ${croppedImagesByPage.size} pages`);
    }
    progressCallback?.(
      "ai_processing",
      65,
      `Extracted ${totalCropped} embedded images (YOLO)`,
    );
  } else {
    if (VERBOSE) console.log("[assess] No layout detections — LLM fallback");
    const pagesWithImages = ocrData.pages.filter((p) => p.hasImages);

    if (pagesWithImages.length > 0) {
      progressCallback?.(
        "ai_processing",
        62,
        `Analyzing ${pagesWithImages.length} page(s) for embedded images (LLM)...`,
      );

      const imageAnalysisPromises = pagesWithImages.map(async (page) => {
        const pageIndex = page.page - 1;
        if (pageIndex < 0 || pageIndex >= images.length) return;

        const imageContent: Content[] = [
          {
            type: "image_url",
            image_url: { url: images[pageIndex], detail: "high" },
          },
        ];

        const pageTokenUsage: TokenUsage = { total: 0 };
        const result = (await fetchGptEnhanced(
          imageContent,
          imageAnalysisSchema,
          pageTokenUsage,
          "English",
          "image_analysis",
        )) as ImageAnalysisResult;

        tokenUsage.total += pageTokenUsage.total;

        if (result?.images?.length > 0) {
          const detectedImages: DetectedImage[] = result.images.map((img) => ({
            type: img.type,
            description: img.description,
            position: img.position,
          }));

          const cropped = await cropDetectedImages(
            images[pageIndex],
            detectedImages,
          );
          if (cropped.length > 0) {
            croppedImagesByPage.set(page.page, cropped);
          }
        }
      });

      await Promise.all(imageAnalysisPromises);

      progressCallback?.(
        "ai_processing",
        65,
        `Extracted ${Array.from(croppedImagesByPage.values()).reduce((n, imgs) => n + imgs.length, 0)} embedded images`,
      );
    }
  }

  return { croppedImagesByPage, tokenUsage };
}

// ── Phase 3: Document classification ──────────────────────────────

/**
 * Classify OCR text into logical documents (chunked for large inputs).
 */
export async function assessDocuments(
  ocrData: OcrResult,
  progressCallback?: ProgressCallback,
): Promise<{ documents: DocumentAssessmentResult["documents"]; tokenUsage: TokenUsage }> {
  const tokenUsage: TokenUsage = { total: 0 };

  progressCallback?.("ai_processing", 70, `Pass 2: Classifying documents...`);

  let assessmentDocuments: DocumentAssessmentResult["documents"];

  if (ocrData.pages.length <= ASSESSMENT_CHUNK_SIZE) {
    const textContent: Content[] = [
      {
        type: "text",
        text: ocrData.pages
          .map((p) => `--- PAGE ${p.page} ---\n${p.text}`)
          .join("\n\n"),
      },
    ];

    const assessmentData = (await fetchGptEnhanced(
      textContent,
      documentAssessmentSchema,
      tokenUsage,
      "English",
      "document_type_routing",
    )) as DocumentAssessmentResult;

    if (!assessmentData?.documents || !Array.isArray(assessmentData.documents)) {
      throw new Error(
        `Document assessment returned invalid data — the AI response may have been truncated. ` +
        `Expected { documents: [...] } but got: ${typeof assessmentData}`
      );
    }

    assessmentDocuments = assessmentData.documents;
  } else {
    const chunks: { startIdx: number; endIdx: number; pages: typeof ocrData.pages }[] = [];
    let start = 0;
    while (start < ocrData.pages.length) {
      const end = Math.min(start + ASSESSMENT_CHUNK_SIZE, ocrData.pages.length);
      chunks.push({
        startIdx: start,
        endIdx: end,
        pages: ocrData.pages.slice(start, end),
      });
      if (end >= ocrData.pages.length) break;
      start = end - ASSESSMENT_OVERLAP;
    }

    progressCallback?.(
      "ai_processing",
      70,
      `Pass 2: Classifying documents in ${chunks.length} chunks...`,
    );

    const chunkPromises = chunks.map((chunk, ci) => {
      const textContent: Content[] = [
        {
          type: "text",
          text: chunk.pages
            .map((p) => `--- PAGE ${p.page} ---\n${p.text}`)
            .join("\n\n"),
        },
      ];

      const chunkTokenUsage: TokenUsage = { total: 0 };

      return fetchGptEnhanced(
        textContent,
        documentAssessmentSchema,
        chunkTokenUsage,
        "English",
        "document_type_routing",
      ).then((result) => {
        tokenUsage.total += chunkTokenUsage.total;
        progressCallback?.(
          "ai_processing",
          70 + Math.round(((ci + 1) / chunks.length) * 15),
          `Pass 2: Chunk ${ci + 1} of ${chunks.length} classified`,
        );
        return {
          documents: (result as DocumentAssessmentResult)?.documents || [],
        };
      });
    });

    const chunkResults = await Promise.all(chunkPromises);

    for (const cr of chunkResults) {
      if (!Array.isArray(cr.documents)) {
        throw new Error(
          `Document assessment chunk returned invalid data — expected { documents: [...] }`,
        );
      }
    }

    assessmentDocuments = mergeChunkAssessments(chunkResults);
  }

  return { documents: assessmentDocuments, tokenUsage };
}

// ── Phase 4: Assemble final Assessment ────────────────────────────

/**
 * Combine OCR data, cropped images, and document classification
 * into the final Assessment structure.
 */
export function assembleAssessment(
  ocrData: OcrResult,
  croppedImagesByPage: Map<number, CroppedImage[]>,
  assessmentDocuments: DocumentAssessmentResult["documents"],
  tokenUsage: TokenUsage,
): Assessment {
  const pages: AssessmentPage[] = ocrData.pages.map((p) => ({
    page: p.page,
    text: p.text,
    language: "",
    images: (croppedImagesByPage.get(p.page) || []).map((img) => ({
      type: img.type,
      description: img.description,
      position: img.position,
      data: img.data,
    })),
  }));

  for (const doc of assessmentDocuments) {
    for (const pageNum of doc.pages) {
      const page = pages.find((p) => p.page === pageNum);
      if (page) {
        page.language = doc.language;
      }
    }
  }

  const documents: AssessmentDocument[] = assessmentDocuments.map(
    ({ hasImages: aiHasImages, ...doc }) => ({
      ...doc,
      hasImages: doc.pages.some((pageNum) => croppedImagesByPage.has(pageNum)),
    }),
  );

  const data: Assessment = {
    pages,
    documents,
    tokenUsage,
  };

  if (VERBOSE) console.log(`[assess] Assembly complete, tokens: ${data.tokenUsage.total}`);
  return data;
}

// ── Backward-compatible wrapper ───────────────────────────────────

export default async function assess(
  input: Input,
  progressCallback?: ProgressCallback,
): Promise<Assessment> {
  if (DEBUG) {
    await sleep(1500);
    return Promise.resolve(TEST_DATA);
  }

  // Phase 1: OCR
  const { ocrData, tokenUsage: ocrTokens } = await assessOCR(
    input.images,
    progressCallback,
  );

  // Phase 2: Image cropping
  const { croppedImagesByPage, tokenUsage: imgTokens } = await assessImages(
    input.images,
    ocrData,
    input.layoutDetections,
    progressCallback,
  );

  // Phase 3: Document classification
  const { documents: assessmentDocuments, tokenUsage: docTokens } = await assessDocuments(
    ocrData,
    progressCallback,
  );

  // Phase 4: Assemble
  const totalTokenUsage: TokenUsage = {
    total: ocrTokens.total + imgTokens.total + docTokens.total,
  };

  return assembleAssessment(ocrData, croppedImagesByPage, assessmentDocuments, totalTokenUsage);
}

/**
 * Merge document assessments from overlapping chunks.
 * Documents that share pages across chunk boundaries are merged into one.
 */
function mergeChunkAssessments(
  chunkResults: { documents: (AssessmentDocument & { hasImages?: boolean })[] }[],
): (AssessmentDocument & { hasImages?: boolean })[] {
  const merged: (AssessmentDocument & { hasImages?: boolean })[] = [];

  for (const chunk of chunkResults) {
    for (const doc of chunk.documents) {
      // Find an existing merged doc that shares at least one page
      const existingIdx = merged.findIndex((m) =>
        m.pages.some((p) => doc.pages.includes(p)),
      );

      if (existingIdx >= 0) {
        // Merge: union pages, keep first title/date/language
        const existing = merged[existingIdx];
        existing.pages = [
          ...new Set([...existing.pages, ...doc.pages]),
        ].sort((a, b) => a - b);
      } else {
        merged.push({ ...doc });
      }
    }
  }

  return merged;
}

const TEST_DATA = {
  pages: [
    {
      page: 1,
      text: "Fakultní Thomayerova nemocnice\nIČ: 00064190\nVídeňská 800, 140 59 Praha 4 Krč\n\nOddělení ORL a chirurgie hlavy a krku\nPřednosta: MUDr. Aleš Čoček, Ph.D. Dr. med.\nORL oddělení - ambulance ORL\n\nORL vyšetření\n\nPacient: Mašková Irena\nBydliště: Severní IV 614/13, Praha 4, 140 00\nDatum vyšetření: 30.01.2023, 8.19\n\nIdent.č.: 485811033\nDatum narození: 11.8.1948\nPohlaví: žena\n\nPoj.: 111\n\nNález:\nNO: 12.1.23 vyšetřena pro týden postupně narůstající odynofagie, s bolestmi v krku, polykání přes bolesti volné, afonie úplná, hlas jasný, afebrilní. Přeléčena herpesiin, při nausea užívala helicid.\nNyní bolesti při polykání nejsou, přetrvává dráždění ke kašli přes den, ale nastydlá se necítí.\nOA: aHT, artroso\nFA: antihypertenziva\n\nobj.\npalp. na krku bez rezistence, fce n.VII zachovalá, výstup n.V palp. nebol.\noro- sliznice úklidné, jazyk nepovleklý, pláty středem, vývody slinných žlaz klidné, slina čirá, tonsily klidné, bez sekretu.\nlaryngo (opt.)- hrtan faryng. oblouk vlevo, velká asymetrická obsahuje štíhlá, hladké, sym. pohyb.vé leukoplakii, vlevo hyposinský - infiltrát sliznice piriformní sínů zhyper.s infiltrát.\n\nZáv: Asymetrická hypertrofie L arytenoidní oblasti s přechodem do pirif. sinu, zaléčen aftosní infekt, s regresí, ne však zcela upravením nálezu.\n\nDop: Helcid 20mg 1-0-1. Platí termín k MLS a esofgoskopii s probat. excisemi na 10.2.23, příjem 9.2. Seznam předoper. vyš. vydán.\nPřeoper. anesteziol. vyš. 8.2.23 v 9 hod (pac. G6)\nEndoskopické výkony provedeny pomocí videofečetězce.\n\nDiagnózy epizody:\nJ060 - Akutní zánět hltanu i hrtanu - laryngopharyngitis acuta\n\nMUDr. Ludmila Vylečková,\nV Praze, 30.1.2023\n\nTisk: 30.01.2023 08:19\n\nStrana: 1 / 1",
    },
  ],
  documents: [
    {
      title: "ORL vyšetření",
      date: "2023-01-30",
      language: "cs",
      isMedical: true,
      pages: [1],
    },
  ],
  tokenUsage: {
    total: 2181,
    "Pass 1 - OCR extraction": 1500,
    "Pass 2 - Document assessment": 681,
  },
} as unknown as Assessment;
