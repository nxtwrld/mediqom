import type { FunctionDefinition } from "@langchain/core/language_models/base";
import { error, text } from "@sveltejs/kit";
import assessSchemaImage, {
  ocrExtractionSchema,
  documentAssessmentSchema,
} from "$lib/configurations/import.assesments";
import { fetchGptEnhanced } from "$lib/ai/providers/enhanced-abstraction";
import { type Content, type TokenUsage } from "$lib/ai/types.d";
import { sleep } from "$lib/utils";
import { DEBUG_ASSESSER } from "$env/static/private";
import {
  type Assessment,
  type AssessmentDocument,
  type AssessmentPage,
} from "$lib/import/types";

const DEBUG = DEBUG_ASSESSER === "true";

type Input = {
  images: string[];
  //text?: string;
  //language?: string;
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
  pages: { page: number; text: string }[];
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

  const imageContent = input.images.map((image) => {
    return {
      type: "image_url",
      image_url: {
        url: image,
        detail: "high",
      },
    };
  }) as Content[];

  // === PASS 1: OCR extraction (vision call — images → text) ===
  progressCallback?.(
    "ai_processing",
    40,
    `Pass 1: Extracting text from ${input.images.length} images...`,
  );

  const ocrData = (await fetchGptEnhanced(
    imageContent,
    ocrExtractionSchema,
    tokenUsage,
    "English",
    "ocr_extraction", // dedicated OCR flow
    progressCallback,
  )) as OcrResult;

  // === PASS 2: Document assessment (text-only call — cheaper/faster) ===
  progressCallback?.("ai_processing", 70, `Pass 2: Classifying documents...`);

  // Build text content for Pass 2
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
    "document_type_routing", // text-only, use cheaper model
    progressCallback,
  )) as DocumentAssessmentResult;

  // === Merge results into Assessment format ===
  const pages: AssessmentPage[] = ocrData.pages.map((p) => ({
    page: p.page,
    text: p.text,
    language: "", // will be set from document assessment
    images: [],
  }));

  // Set page language from document assessment
  for (const doc of assessmentData.documents) {
    for (const pageNum of doc.pages) {
      const page = pages.find((p) => p.page === pageNum);
      if (page) {
        page.language = doc.language;
      }
    }
  }

  // If any document has images, we need image extraction for those pages.
  // For now, images array is empty — Phase 3 can add dedicated image extraction.
  const documents: AssessmentDocument[] = assessmentData.documents.map(
    ({ hasImages, ...doc }) => doc,
  );

  const data: Assessment = {
    pages,
    documents,
    tokenUsage,
  };

  console.log("All done...", data.tokenUsage.total);
  return data;
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
