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
                          "X coordinate of the top-left corner as percentage of page width (0-100).",
                      },
                      y: {
                        type: "integer",
                        description:
                          "Y coordinate of the top-left corner as percentage of page height (0-100).",
                      },
                      width: {
                        type: "integer",
                        description: "Width as percentage of page width (0-100).",
                      },
                      height: {
                        type: "integer",
                        description: "Height as percentage of page height (0-100).",
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
  description: `You are a precision OCR system for medical documents. Your task is to extract text from page images with maximum accuracy. Also flag whether each page contains non-text visual content (photos, diagrams, charts, medical images). This text will be used for clinical decision-making — errors can have medical consequences.

CRITICAL OCR RULES:
- Transcribe EXACTLY what you see on each page. Never substitute similar-looking characters.
- Preserve ALL diacritical marks precisely. Czech diacritics are critical: ě, š, č, ř, ž, ý, á, í, é, ú, ů, ď, ť, ň (and their uppercase variants: Ě, Š, Č, Ř, Ž, Ý, Á, Í, É, Ú, Ď, Ť, Ň).
- Do NOT "correct" or normalize anything — transcribe medical terms, drug names, abbreviations, and proper nouns exactly as printed.
- For tables and lab results: use markdown table format with columns aligned. Preserve exact numbers, decimal separators (comma or period as shown), units, and reference ranges.
- For numbers and units: transcribe exactly as printed (e.g., "0,31" not "0.31" if comma is used; "µkat/l" not "ukat/l" if µ is shown).
- Preserve document structure: headings, paragraphs, line breaks, headers, footers.
- If text is unclear or partially obscured, transcribe your best reading and mark uncertain portions with [?].`,
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
            hasImages: {
              type: "boolean",
              description:
                "True if the page contains non-text visual content (photos, diagrams, charts, medical images, body schemas). False if text-only.",
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
  description: `You are a medical document classification and segmentation system. You receive extracted text from medical document pages. Your task is to split the text into individual medical documents.

CRITICAL — WHAT COUNTS AS A SEPARATE DOCUMENT:
Each of these is a SEPARATE document, even when printed continuously on the same pages:
- Each clinic/ambulance visit ("Návštěva ambulance / ordinace", "Vyšetření", consultation) with its own date and doctor
- Each laboratory result set ("Laboratorní vyšetření") with its own date
- Each imaging study or sonography ("Sonografické vyšetření", "RTG", "MRI", "CT")
- Each preventive examination ("Preventivní prohlídka")
- Each bacteriology/microbiology result ("Bakteriologické vyšetření")
- Each specialist consultation (orthopedics, ophthalmology, dermatology, etc.)
- Each standalone procedure or surgery report

COMMON PATTERN — CLINIC PRINTOUTS:
Medical clinics often print a patient's entire visit history as one continuous PDF. This is NOT one document — it contains many separate encounters that MUST be split. Look for date+doctor+department changes as document boundaries. Headers/footers with patient info and page numbers (e.g., "strana 3/12") are shared across the printout and do NOT indicate a single document.

PAGE SHARING:
A single page frequently contains parts of multiple documents (e.g., one visit ends and another begins mid-page). When this happens, list that page number in BOTH documents. Pages can appear in multiple document entries.

TITLE AND DATE:
- Title: Use the visit/exam type and specialty (e.g., "Ortopedie - vyšetření", "Sonografie abdomen", "Laboratorní výsledky"), NOT the clinic name or patient name
- Date: Use the specific encounter date, NOT the print date or the date from the header

Do NOT re-extract or modify the text — it has already been extracted with high precision.`,
  parameters: {
    type: "object",
    properties: {
      documents: {
        type: "array",
        description:
          "List of individual medical documents/encounters detected. Each visit, lab result, imaging study, or examination with its own date is a separate entry. A 12-page clinic printout may contain 10+ separate documents.",
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

/**
 * Image analysis schema — precise bounding box extraction for pages flagged with images.
 * Runs as a separate vision call with a prompt focused entirely on spatial accuracy.
 */
export const imageAnalysisSchema = {
  name: "image_region_detector",
  description: `You are a precise image region detector. Given a page image from a medical document, identify all non-text visual content (photos, diagrams, body schemas, charts, medical images) and return their exact bounding boxes.

COORDINATE SYSTEM:
- Origin (0, 0) is the TOP-LEFT corner of the page
- X axis goes RIGHT, Y axis goes DOWN
- All values are PERCENTAGES of page dimensions (0-100)
- x=0, y=0, width=100, height=100 means the ENTIRE page

BOUNDING BOX RULES:
- The box must FULLY CONTAIN the image including any labels, legends, or annotations that are part of it
- Include a small margin around the image (2-3%)
- If an image spans most of the page (>70% area), return x=0, y=0, width=100, height=100
- For body diagrams/schemas with multiple views, return ONE box covering ALL views together

Return an empty array if there are no visual elements.`,
  parameters: {
    type: "object",
    properties: {
      images: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["dicom", "photo", "schema", "chart"],
              description: "Type of visual content.",
            },
            description: {
              type: "string",
              description: "Brief description of the image content.",
            },
            position: {
              type: "object",
              properties: {
                x: {
                  type: "integer",
                  description:
                    "Left edge as % of page width (0-100).",
                },
                y: {
                  type: "integer",
                  description:
                    "Top edge as % of page height (0-100).",
                },
                width: {
                  type: "integer",
                  description:
                    "Width as % of page width (0-100).",
                },
                height: {
                  type: "integer",
                  description:
                    "Height as % of page height (0-100).",
                },
              },
              required: ["x", "y", "width", "height"],
            },
          },
          required: ["type", "description", "position"],
        },
      },
    },
    required: ["images"],
  },
} as FunctionDefinition;
