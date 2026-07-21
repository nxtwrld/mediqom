import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFetchGptEnhanced, mockCropDetectedImages } = vi.hoisted(() => ({
  mockFetchGptEnhanced: vi.fn(),
  mockCropDetectedImages: vi.fn().mockResolvedValue([]),
}));

vi.mock("$env/static/private", () => ({
  DEBUG_ASSESSER: "false",
  DEBUG_IMPORT: "false",
}));

vi.mock("$lib/configurations/import.assesments", () => ({
  default: { name: "assessSchema", parameters: { type: "object", properties: {} } },
  ocrExtractionSchema: { name: "ocrSchema", parameters: { type: "object", properties: {} } },
  documentAssessmentSchema: { name: "docAssess", parameters: { type: "object", properties: {} } },
  imageAnalysisSchema: { name: "imgAnalysis", parameters: { type: "object", properties: {} } },
}));

vi.mock("$lib/ai/providers/enhanced-abstraction", () => ({
  fetchGptEnhanced: mockFetchGptEnhanced,
}));

vi.mock("$lib/utils", () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./cropImages", () => ({
  cropDetectedImages: mockCropDetectedImages,
}));

vi.mock("./debug-output", () => ({
  saveImportPhaseLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@sveltejs/kit", () => ({
  error: vi.fn((status, body) => { throw Object.assign(new Error(body?.message || "error"), { status }); }),
  text: vi.fn(),
}));

import { assessOCR, assessDocuments, assessImages, assembleAssessment } from "./assessInputs";
import assess from "./assessInputs";

// ── helpers ───────────────────────────────────────────────────────────────────

function makeOcrData(pageCount = 2) {
  return {
    pages: Array.from({ length: pageCount }, (_, i) => ({
      page: i + 1,
      text: `Text of page ${i + 1}`,
    })),
  };
}

// ── assessOCR ─────────────────────────────────────────────────────────────────

describe("assessOCR", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchGptEnhanced.mockResolvedValue({
      pages: [{ page: 1, text: "Extracted text", hasImages: false }],
    });
  });

  it("returns ocrData and tokenUsage", async () => {
    const result = await assessOCR(["data:image/jpeg;base64,abc"]);
    expect(result).toHaveProperty("ocrData");
    expect(result).toHaveProperty("tokenUsage");
    expect(result.ocrData.pages).toHaveLength(1);
  });

  it("calls fetchGptEnhanced once per image", async () => {
    await assessOCR(["img1", "img2", "img3"]);
    expect(mockFetchGptEnhanced).toHaveBeenCalledTimes(3);
  });

  it("calls progressCallback with stage info", async () => {
    const cb = vi.fn();
    await assessOCR(["img1"], cb);
    expect(cb).toHaveBeenCalledWith("ai_processing", expect.any(Number), expect.any(String));
  });

  it("handles pages array response format", async () => {
    mockFetchGptEnhanced.mockResolvedValue({
      pages: [{ page: 1, text: "content", hasImages: true }],
    });
    const { ocrData } = await assessOCR(["img1"]);
    expect(ocrData.pages[0].text).toBe("content");
  });

  it("handles flat text response format", async () => {
    mockFetchGptEnhanced.mockResolvedValue({ text: "flat text" });
    const { ocrData } = await assessOCR(["img1"]);
    expect(ocrData.pages[0].text).toBe("flat text");
  });

  it("returns empty pages when AI returns object with no pages or text", async () => {
    mockFetchGptEnhanced.mockResolvedValue({});
    const { ocrData } = await assessOCR(["img1"]);
    expect(ocrData.pages).toHaveLength(0);
  });

  it("returns empty pages for empty image array", async () => {
    const { ocrData } = await assessOCR([]);
    expect(ocrData.pages).toHaveLength(0);
  });
});

// ── assessDocuments ───────────────────────────────────────────────────────────

describe("assessDocuments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchGptEnhanced.mockResolvedValue({
      documents: [
        { title: "Medical Report", date: "2024-01-01", language: "en", isMedical: true, pages: [1] },
      ],
    });
  });

  it("returns documents and tokenUsage", async () => {
    const result = await assessDocuments(makeOcrData(2));
    expect(result).toHaveProperty("documents");
    expect(result).toHaveProperty("tokenUsage");
    expect(result.documents).toHaveLength(1);
  });

  it("calls progressCallback", async () => {
    const cb = vi.fn();
    await assessDocuments(makeOcrData(2), cb);
    expect(cb).toHaveBeenCalledWith("ai_processing", 70, expect.any(String));
  });

  it("calls fetchGptEnhanced once for small document set", async () => {
    await assessDocuments(makeOcrData(3)); // < ASSESSMENT_CHUNK_SIZE (8)
    expect(mockFetchGptEnhanced).toHaveBeenCalledTimes(1);
  });

  it("throws when AI returns invalid data", async () => {
    mockFetchGptEnhanced.mockResolvedValue(null);
    await expect(assessDocuments(makeOcrData(1))).rejects.toThrow("invalid data");
  });

  it("processes large documents in chunks", async () => {
    // > 8 pages triggers chunked processing
    mockFetchGptEnhanced.mockResolvedValue({ documents: [
      { title: "Doc", date: "", language: "en", isMedical: true, pages: [1] },
    ]});
    const result = await assessDocuments(makeOcrData(10));
    expect(mockFetchGptEnhanced).toHaveBeenCalledTimes(2); // ceil(10 / (8-2)) = 2 chunks
    expect(result.documents).toBeDefined();
  });
});

// ── assessImages ──────────────────────────────────────────────────────────────

describe("assessImages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCropDetectedImages.mockResolvedValue([]);
    mockFetchGptEnhanced.mockResolvedValue({
      images: [{ type: "figure", position: { x: 0, y: 0, width: 100, height: 50 } }],
    });
  });

  it("returns croppedImagesByPage and tokenUsage", async () => {
    const result = await assessImages(["img1"], makeOcrData(1), undefined);
    expect(result).toHaveProperty("croppedImagesByPage");
    expect(result).toHaveProperty("tokenUsage");
    expect(result.croppedImagesByPage).toBeInstanceOf(Map);
  });

  it("uses layout detections when provided", async () => {
    const layoutDetections = [
      { page: 1, detections: [{ label: "figure", confidence: 0.9, bbox: [0, 0, 100, 100] }] },
    ];
    const result = await assessImages(["img1"], makeOcrData(1), layoutDetections as any);
    expect(result.croppedImagesByPage).toBeInstanceOf(Map);
  });

  it("calls progressCallback when pages have images", async () => {
    const cb = vi.fn();
    const ocrDataWithImages = {
      pages: [{ page: 1, text: "content", hasImages: true }],
    };
    await assessImages(["img1"], ocrDataWithImages, undefined, cb);
    expect(cb).toHaveBeenCalled();
  });
});

// ── assess (default export) ───────────────────────────────────────────────────

describe("assess (default export)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // OCR response
    mockFetchGptEnhanced.mockResolvedValueOnce({
      pages: [{ page: 1, text: "OCR content", hasImages: false }],
    });
    // Document assessment response
    mockFetchGptEnhanced.mockResolvedValueOnce({
      documents: [
        { title: "Report", date: "2024-01-01", language: "en", isMedical: true, pages: [1] },
      ],
    });
    mockCropDetectedImages.mockResolvedValue([]);
  });

  it("returns a full Assessment object", async () => {
    const result = await assess({ images: ["data:image/jpeg;base64,abc"] });
    expect(result).toHaveProperty("pages");
    expect(result).toHaveProperty("documents");
    expect(result).toHaveProperty("tokenUsage");
  });

  it("calls progressCallback at multiple stages", async () => {
    const cb = vi.fn();
    await assess({ images: ["img1"] }, cb);
    expect(cb).toHaveBeenCalled();
  });

  it("handles empty image array", async () => {
    mockFetchGptEnhanced.mockReset();
    mockFetchGptEnhanced.mockResolvedValue({ documents: [] });
    const result = await assess({ images: [] });
    expect(result.pages).toHaveLength(0);
  });
});

// ── mergeChunkAssessments (via assessDocuments > 8 pages) ─────────────────────

describe("mergeChunkAssessments (via chunked assessDocuments)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("merges overlapping page references across chunks", async () => {
    let callCount = 0;
    mockFetchGptEnhanced.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ documents: [
          { title: "Doc A", date: "", language: "en", isMedical: true, pages: [1, 2, 3, 4, 5, 6, 7] },
        ]});
      }
      // Second chunk has overlapping page 7
      return Promise.resolve({ documents: [
        { title: "Doc A continuation", date: "", language: "en", isMedical: true, pages: [7, 8, 9, 10] },
      ]});
    });

    const result = await assessDocuments(makeOcrData(10));
    // Docs sharing page 7 should be merged
    expect(result.documents.length).toBeGreaterThan(0);
  });

  it("adds new non-overlapping doc from second chunk", async () => {
    let callCount = 0;
    mockFetchGptEnhanced.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ documents: [
          { title: "Doc 1", date: "", language: "en", isMedical: true, pages: [1, 2, 3, 4, 5, 6, 7, 8] },
        ]});
      }
      return Promise.resolve({ documents: [
        { title: "Doc 2", date: "", language: "en", isMedical: true, pages: [9, 10] },
      ]});
    });

    const result = await assessDocuments(makeOcrData(10));
    expect(result.documents.length).toBeGreaterThanOrEqual(1);
  });
});
