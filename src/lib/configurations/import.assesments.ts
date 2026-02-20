import type { FunctionDefinition } from "@langchain/core/language_models/base";
export default {
  name: "extractor",
  description: `You are a precise OCR extraction system for medical documents. Accuracy is critical — extracted text will be used for clinical decision-making.

Proceed step by step:

Step 1 — TEXT EXTRACTION (highest priority):
Your input is a set of page images from medical reports. Extract ALL text with character-level fidelity.

CRITICAL OCR RULES:
- Transcribe EXACTLY what you see. Never substitute similar-looking characters.
- Preserve ALL diacritical marks precisely. Czech diacritics are critical: ě, š, č, ř, ž, ý, á, í, é, ú, ů, ď, ť, ň (and uppercase variants).
- Do NOT "correct" or normalize medical terms, abbreviations, drug names, or proper nouns — transcribe them exactly as printed.
- For tables and lab results: use markdown table format. Preserve exact numbers, decimal separators (comma or period), units, and reference ranges.
- For numbers and units: transcribe exactly (e.g., "0,31" not "0.31" if the original uses comma; "µkat/l" not "ukat/l" if the original uses µ).
- Preserve line breaks, paragraph structure, headers, and footers.
- If text is unclear or partially obscured, transcribe your best reading and mark uncertain portions with [?].

Step 2 — DOCUMENT SEGMENTATION:
Assess whether all pages belong to the same document or multiple documents. If multiple documents are detected, mark the individual documents and the pages they consist of.

Step 3 — IMAGE DETECTION:
If the page contains non-text content (photos, schemas, DICOM images, diagrams), extract that area and list it. If the page is a DICOM image, list the image. If the page is a photo, list the photo.
    `,
  parameters: {
    type: "object",
    properties: {
      pages: {
        type: "array",
        description:
          "List of pages in the document. Each page is a separate image. The order of the pages is the initial order of the images.",
        items: {
          type: "object",
          properties: {
            page: {
              type: "integer",
              description: "Page number in the document. The first page is 1.",
            },

            text: {
              type: "string",
              description: `Extract all text from this page with maximum fidelity:
1. Identify the page structure: headings, paragraphs, tables, headers, footers.
2. Extract all text in markdown format. Use markdown tables for tabular data (lab results, reference ranges).
3. Preserve EXACT characters including all diacritics (Czech: ě, š, č, ř, ž, ý, á, í, é, ú, ů, ď, ť, ň), special symbols (µ, °, ², ³), and punctuation.
4. For numbers: preserve exact decimal separators (comma vs period), spacing, and units as printed.
5. Do NOT correct medical terminology, drug names, abbreviations, or proper nouns — transcribe exactly as shown.
6. Mark any unclear or partially obscured text with [?].`,
            },
            images: {
              type: "array",
              description: `
                                Proceed step by step:
                                1. detect any image data besides text on the page.
                                2. Extract the image data and list it here. If the image is a photo, schema or DICOM image, list it here.
                                3. Extract the position and size of the image in the page. The top left corner is 0,0 and our units are percetages of the page size.
                            `,
              items: {
                type: "object",
                properties: {
                  type: {
                    type: "string",
                    enum: ["dicom", "photo", "schema"],
                    description:
                      "Type of the image. If it is a schema, photo or DICOM image.",
                  },
                  position: {
                    type: "object",
                    properties: {
                      x: {
                        type: "integer",
                        description:
                          "X coordinate of the image in the page. The top left corner is 0.",
                      },
                      y: {
                        type: "integer",
                        description:
                          "Y coordinate of the image in the page. The top left corner is 0.",
                      },
                      width: {
                        type: "integer",
                        description: "Width of the image in pixels.",
                      },
                      height: {
                        type: "integer",
                        description: "Height of the image in pixels.",
                      },
                    },
                  },
                  data: {
                    type: "string",
                    description: "base64 encoded image",
                  },
                },
              },
            },
          },
          required: ["page", "text", "language"],
        },
      },
      documents: {
        type: "array",
        description:
          "List of documents detected in the pages We want to split the pages into sets, if there are multiple documents detected. If there is only one document, list it here.",
        items: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description:
                "Title of the document in the original language of the document.",
            },
            date: {
              type: "string",
              description: "Date of the document. Use the ISO 8601 format.",
            },
            language: {
              type: "string",
              description: "Language of the text. Use the ISO 639-1 code.",
            },
            isMedical: {
              type: "boolean",
              description:
                "Is it a medical report, lab results or DICOM type image? true/false.",
            },
            isMedicalImaging: {
              type: "boolean",
              description:
                "Is this a medical imaging scan (X-ray, MRI, CT, ultrasound, mammography, PET, nuclear medicine, etc.)? This is for actual medical images showing anatomical structures, not text-based medical documents. true/false.",
            },
            pages: {
              type: "array",
              description:
                "List of pages in the document. Each page is a separate image. The order of the pages is the initial order of the images.",
              items: {
                type: "integer",
                description:
                  "Page number in the document. The first page is 1.",
              },
            },
          },
          required: [
            "title",
            "date",
            "language",
            "isMedical",
            "isMedicalImaging",
            "pages",
          ],
        },
      },
    },
    required: ["pages", "documents"],
  },
} as FunctionDefinition;

/**
 * Pass 1: OCR-only schema — focuses entirely on accurate text extraction from images.
 * No document classification, no image detection. Model concentrates on OCR fidelity.
 */
export const ocrExtractionSchema = {
  name: "ocr_extractor",
  description: `You are a precision OCR system for medical documents. Your ONLY task is to extract text from page images with maximum accuracy. This text will be used for clinical decision-making — errors can have medical consequences.

CRITICAL RULES:
- Transcribe EXACTLY what you see on each page. Never substitute similar-looking characters.
- Preserve ALL diacritical marks precisely. Czech diacritics are critical: ě, š, č, ř, ž, ý, á, í, é, ú, ů, ď, ť, ň (and their uppercase variants: Ě, Š, Č, Ř, Ž, Ý, Á, Í, É, Ú, Ď, Ť, Ň).
- Do NOT "correct" or normalize anything — transcribe medical terms, drug names, abbreviations, and proper nouns exactly as printed.
- For tables and lab results: use markdown table format with columns aligned. Preserve exact numbers, decimal separators (comma or period as shown), units, and reference ranges.
- For numbers and units: transcribe exactly as printed (e.g., "0,31" not "0.31" if comma is used; "µkat/l" not "ukat/l" if µ is shown).
- Preserve document structure: headings, paragraphs, line breaks, headers, footers.
- If text is unclear or partially obscured, transcribe your best reading and mark uncertain portions with [?].
- Do NOT classify documents or detect images — only extract text.`,
  parameters: {
    type: "object",
    properties: {
      pages: {
        type: "array",
        description:
          "List of pages with extracted text. Each page corresponds to one input image, in order.",
        items: {
          type: "object",
          properties: {
            page: {
              type: "integer",
              description:
                "Page number (1-indexed, matching input image order).",
            },
            text: {
              type: "string",
              description: `Full text content of this page in markdown format. Use markdown tables for tabular data. Preserve exact characters, diacritics, numbers, units, and formatting as printed on the page.`,
            },
          },
          required: ["page", "text"],
        },
      },
    },
    required: ["pages"],
  },
} as FunctionDefinition;

/**
 * Pass 2: Document assessment schema — classifies and segments documents from extracted text.
 * Receives text only (no images), so it can use a cheaper/faster model.
 */
export const documentAssessmentSchema = {
  name: "document_assessor",
  description: `You are a document classification system. You receive extracted text from medical document pages. Your task is to:
1. Determine whether the pages belong to one document or multiple documents.
2. Classify each document (title, date, language, medical/non-medical, imaging/non-imaging).
3. Detect any references to embedded images, schemas, or photos mentioned in the text.

Do NOT re-extract or modify the text — it has already been extracted with high precision.`,
  parameters: {
    type: "object",
    properties: {
      documents: {
        type: "array",
        description:
          "List of documents detected across the pages. Split pages into document groups.",
        items: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description:
                "Title of the document in the original language of the document.",
            },
            date: {
              type: "string",
              description: "Date of the document. Use the ISO 8601 format.",
            },
            language: {
              type: "string",
              description: "Language of the text. Use the ISO 639-1 code.",
            },
            isMedical: {
              type: "boolean",
              description:
                "Is it a medical report, lab results or DICOM type image? true/false.",
            },
            isMedicalImaging: {
              type: "boolean",
              description:
                "Is this a medical imaging scan (X-ray, MRI, CT, ultrasound, mammography, PET, nuclear medicine, etc.)? This is for actual medical images showing anatomical structures, not text-based medical documents. true/false.",
            },
            pages: {
              type: "array",
              description:
                "Page numbers belonging to this document (1-indexed).",
              items: {
                type: "integer",
                description: "Page number.",
              },
            },
            hasImages: {
              type: "boolean",
              description:
                "Does the text reference embedded images, photos, schemas, or diagrams that should be extracted from the original page images?",
            },
          },
          required: [
            "title",
            "date",
            "language",
            "isMedical",
            "isMedicalImaging",
            "pages",
            "hasImages",
          ],
        },
      },
    },
    required: ["documents"],
  },
} as FunctionDefinition;
