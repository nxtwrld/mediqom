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
import { DEBUG_ASSESSER } from "$env/static/private";
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

const DEBUG = DEBUG_ASSESSER === "true";

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

export default async function assess(
  input: Input,
  progressCallback?: (stage: string, progress: number, message: string) => void,
): Promise<Assessment> {
  const tokenUsage: TokenUsage = {
    total: 0,
  };

  if (DEBUG) {
    await sleep(1500);
    return Promise.resolve(TEST_DATA);
  }

  // === PASS 1: OCR extraction (parallel vision calls) ===
  const totalPages = input.images.length;
  const allPages: OcrResult["pages"] = [];

  let ocrPagesCompleted = 0;
  const ocrPromises = input.images.map((image, i) => {
    const singleImageContent: Content[] = [
      {
        type: "image_url",
        image_url: {
          url: image,
          detail: "high",
        },
      },
    ];

    // Each parallel call gets its own tokenUsage to avoid overwriting schema keys
    const pageTokenUsage: TokenUsage = { total: 0 };

    return fetchGptEnhanced(
      singleImageContent,
      ocrExtractionSchema,
      pageTokenUsage,
      "English",
      "ocr_extraction",
    ).then((pageResult) => {
      ocrPagesCompleted++;
      // Accumulate token usage safely
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

  // Map results to allPages array (sorted by page index)
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

  // === IMAGE ANALYSIS PASS: Precise bounding boxes for pages with images ===
  const croppedImagesByPage = new Map<number, CroppedImage[]>();

  if (input.layoutDetections && input.layoutDetections.length > 0) {
    // Use client-provided DocLayout-YOLO bounding boxes (no LLM call needed)
    progressCallback?.(
      "ai_processing",
      62,
      `Using client-side layout detection for image extraction...`,
    );

    for (const pageLayout of input.layoutDetections) {
      const figures = pageLayout.detections.filter(
        (d) => ["figure", "picture"].includes(d.class) && d.confidence >= 0.3,
      );
      if (figures.length === 0) continue;

      const pageIndex = pageLayout.page - 1;
      if (pageIndex < 0 || pageIndex >= input.images.length) continue;

      const detectedImages: DetectedImage[] = figures.map((f) => ({
        type: f.class,
        position: f.position,
      }));

      const cropped = await cropDetectedImages(
        input.images[pageIndex],
        detectedImages,
      );
      if (cropped.length > 0) {
        croppedImagesByPage.set(pageLayout.page, cropped);
      }
    }

    progressCallback?.(
      "ai_processing",
      65,
      `Extracted ${Array.from(croppedImagesByPage.values()).reduce((n, imgs) => n + imgs.length, 0)} embedded images (YOLO)`,
    );
  } else {
    // Fallback: LLM-based image analysis for pages flagged with hasImages
    const pagesWithImages = ocrData.pages.filter((p) => p.hasImages);

    if (pagesWithImages.length > 0) {
      progressCallback?.(
        "ai_processing",
        62,
        `Analyzing ${pagesWithImages.length} page(s) for embedded images (LLM)...`,
      );

      const imageAnalysisPromises = pagesWithImages.map(async (page) => {
        const pageIndex = page.page - 1;
        if (pageIndex < 0 || pageIndex >= input.images.length) return;

        const imageContent: Content[] = [
          {
            type: "image_url",
            image_url: { url: input.images[pageIndex], detail: "high" },
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
            input.images[pageIndex],
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

  if (!ocrData?.pages || !Array.isArray(ocrData.pages)) {
    throw new Error(
      `OCR extraction returned invalid data — the AI response may have been truncated. ` +
      `Expected { pages: [...] } but got: ${typeof ocrData}`
    );
  }

  // === PASS 2: Document assessment (text-only, chunked for large documents) ===
  progressCallback?.("ai_processing", 70, `Pass 2: Classifying documents...`);

  let assessmentDocuments: DocumentAssessmentResult["documents"];

  if (ocrData.pages.length <= ASSESSMENT_CHUNK_SIZE) {
    // Small document — single assessment call (no chunking)
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
    // Large document — split into overlapping chunks and assess in parallel
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
      start = end - ASSESSMENT_OVERLAP; // overlap for boundary detection
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

    // Validate chunk results
    for (const cr of chunkResults) {
      if (!Array.isArray(cr.documents)) {
        throw new Error(
          `Document assessment chunk returned invalid data — expected { documents: [...] }`,
        );
      }
    }

    // Merge overlapping chunk assessments
    assessmentDocuments = mergeChunkAssessments(chunkResults);
  }

  // === Merge results into Assessment format ===
  const pages: AssessmentPage[] = ocrData.pages.map((p) => ({
    page: p.page,
    text: p.text,
    language: "", // will be set from document assessment
    images: (croppedImagesByPage.get(p.page) || []).map((img) => ({
      type: img.type,
      description: img.description,
      position: img.position,
      data: img.data,
    })),
  }));

  // Set page language from document assessment
  for (const doc of assessmentDocuments) {
    for (const pageNum of doc.pages) {
      const page = pages.find((p) => p.page === pageNum);
      if (page) {
        page.language = doc.language;
      }
    }
  }

  // Propagate hasImages flag — true if any page in the document has cropped images
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

  console.log("All done...", data.tokenUsage.total);
  return data;
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
