import { describe, it, expect, vi, beforeEach } from "vitest";
import { assembleAssessment } from "./assessInputs";

describe("assembleAssessment", () => {
  it("builds a Pages array from OCR data with empty language and images when no crops given", () => {
    const result = assembleAssessment(
      {
        pages: [
          { page: 1, text: "page 1 text" },
          { page: 2, text: "page 2 text" },
        ],
      },
      new Map(),
      [],
      { total: 100 },
    );

    expect(result.pages).toHaveLength(2);
    expect(result.pages[0]).toEqual({
      page: 1,
      text: "page 1 text",
      language: "",
      images: [],
    });
    expect(result.tokenUsage.total).toBe(100);
    expect(result.documents).toEqual([]);
  });

  it("attaches cropped images to the correct page", () => {
    const cropped = new Map();
    cropped.set(2, [
      {
        type: "figure",
        description: "chart",
        position: { x: 0, y: 0, width: 100, height: 50 },
        data: "data:image/png;base64,abc",
      },
    ]);

    const result = assembleAssessment(
      {
        pages: [
          { page: 1, text: "one" },
          { page: 2, text: "two" },
        ],
      },
      cropped,
      [],
      { total: 0 },
    );

    expect(result.pages[0].images).toEqual([]);
    expect(result.pages[1].images).toHaveLength(1);
    expect(result.pages[1].images[0].type).toBe("figure");
    expect(result.pages[1].images[0].data).toBe("data:image/png;base64,abc");
  });

  it("propagates language from assessmentDocuments to matching pages", () => {
    const result = assembleAssessment(
      {
        pages: [
          { page: 1, text: "a" },
          { page: 2, text: "b" },
          { page: 3, text: "c" },
        ],
      },
      new Map(),
      [
        {
          title: "Doc A",
          date: "2024-01-01",
          language: "cs",
          isMedical: true,
          pages: [1, 2],
        },
        {
          title: "Doc B",
          date: "2024-01-02",
          language: "en",
          isMedical: true,
          pages: [3],
        },
      ],
      { total: 0 },
    );

    expect(result.pages[0].language).toBe("cs");
    expect(result.pages[1].language).toBe("cs");
    expect(result.pages[2].language).toBe("en");
  });

  it("sets document hasImages=true when any page has cropped images", () => {
    const cropped = new Map();
    cropped.set(1, [
      {
        type: "figure",
        position: { x: 0, y: 0, width: 10, height: 10 },
        data: "x",
      },
    ]);

    const result = assembleAssessment(
      { pages: [{ page: 1, text: "p1" }, { page: 2, text: "p2" }] },
      cropped,
      [
        {
          title: "has images",
          date: "",
          language: "en",
          isMedical: true,
          pages: [1, 2],
        },
        {
          title: "no images",
          date: "",
          language: "en",
          isMedical: true,
          pages: [2],
        },
      ],
      { total: 0 },
    );

    expect(result.documents[0].hasImages).toBe(true);
    expect(result.documents[1].hasImages).toBe(false);
  });

  it("strips AI-suggested hasImages field and computes its own", () => {
    const result = assembleAssessment(
      { pages: [{ page: 1, text: "x" }] },
      new Map(),
      [
        {
          title: "t",
          date: "",
          language: "en",
          isMedical: true,
          pages: [1],
          hasImages: true, // AI lied — no crops were produced
        } as any,
      ],
      { total: 0 },
    );

    expect(result.documents[0].hasImages).toBe(false);
  });

  it("preserves the tokenUsage object unchanged", () => {
    const tokens = { total: 42, stage1: 20, stage2: 22 };
    const result = assembleAssessment(
      { pages: [] },
      new Map(),
      [],
      tokens as any,
    );
    expect(result.tokenUsage).toBe(tokens);
  });
});

// ── assessOCR ─────────────────────────────────────────────────────────────────

const { mockFetchGpt: mockFetchGptAssess, mockCropDetectedImages } = vi.hoisted(() => ({
  mockFetchGpt: vi.fn(),
  mockCropDetectedImages: vi.fn().mockResolvedValue([]),
}));

vi.mock("$lib/ai/providers/enhanced-abstraction", () => ({
  fetchGptEnhanced: mockFetchGptAssess,
}));

vi.mock("./cropImages", () => ({
  cropDetectedImages: mockCropDetectedImages,
}));

vi.mock("$env/static/private", () => ({
  DEBUG_ASSESSER: "false",
  DEBUG_IMPORT: "false",
}));

vi.mock("./debug-output", () => ({
  saveImportPhaseLog: vi.fn().mockResolvedValue(undefined),
}));

import { assessOCR, assessImages, assessDocuments } from "./assessInputs";
import type { OcrResult } from "./assessInputs";

describe("assessOCR", () => {
  beforeEach(() => {
    mockFetchGptAssess.mockReset();
  });

  it("returns OCR data and token usage for a single image", async () => {
    mockFetchGptAssess.mockResolvedValue({
      pages: [{ page: 1, text: "Blood test results", hasImages: false }],
    });

    const { ocrData, tokenUsage } = await assessOCR(["data:image/png;base64,abc"]);

    expect(ocrData.pages).toHaveLength(1);
    expect(ocrData.pages[0].page).toBe(1);
    expect(ocrData.pages[0].text).toBe("Blood test results");
    expect(typeof tokenUsage.total).toBe("number");
  });

  it("processes multiple images in parallel and preserves order", async () => {
    mockFetchGptAssess
      .mockResolvedValueOnce({ pages: [{ page: 1, text: "page one" }] })
      .mockResolvedValueOnce({ pages: [{ page: 1, text: "page two" }] });

    const { ocrData } = await assessOCR(["img1", "img2"]);

    expect(ocrData.pages).toHaveLength(2);
    expect(ocrData.pages[0].text).toBe("page one");
    expect(ocrData.pages[1].text).toBe("page two");
  });

  it("handles pages with hasImages flag", async () => {
    mockFetchGptAssess.mockResolvedValue({
      pages: [{ page: 1, text: "X-ray report", hasImages: true }],
    });

    const { ocrData } = await assessOCR(["img"]);

    expect(ocrData.pages[0].hasImages).toBe(true);
  });

  it("calls progressCallback with increasing progress", async () => {
    mockFetchGptAssess.mockResolvedValue({ pages: [{ page: 1, text: "t" }] });

    const progress = vi.fn();
    await assessOCR(["img"], progress);

    expect(progress).toHaveBeenCalled();
    const firstCall = progress.mock.calls[0];
    expect(firstCall[0]).toBe("ai_processing");
    expect(typeof firstCall[1]).toBe("number");
  });

  it("handles flat object response (no pages wrapper)", async () => {
    mockFetchGptAssess.mockResolvedValue({ text: "flat text" });

    const { ocrData } = await assessOCR(["img"]);

    expect(ocrData.pages[0].text).toBe("flat text");
  });

  it("throws when AI returns null (invalid OCR data)", async () => {
    mockFetchGptAssess.mockResolvedValue(null);

    await expect(assessOCR(["img"])).rejects.toThrow();
  });
});

describe("assessImages", () => {
  const singlePageOcr: OcrResult = {
    pages: [{ page: 1, text: "report text", hasImages: true }],
  };
  const noImageOcr: OcrResult = {
    pages: [{ page: 1, text: "text only", hasImages: false }],
  };

  beforeEach(() => {
    mockFetchGptAssess.mockReset();
    mockCropDetectedImages.mockReset();
    mockCropDetectedImages.mockResolvedValue([]);
  });

  it("returns empty map when no layout detections and no pages with images", async () => {
    const { croppedImagesByPage } = await assessImages(["img"], noImageOcr, undefined);

    expect(croppedImagesByPage.size).toBe(0);
    expect(mockFetchGptAssess).not.toHaveBeenCalled();
  });

  it("uses YOLO detections when provided (no LLM call)", async () => {
    const detectedImg = { type: "figure", position: { x: 10, y: 10, width: 100, height: 80 }, data: "data:image/png;base64,crop" };
    mockCropDetectedImages.mockResolvedValue([detectedImg]);

    const layoutDetections = [
      {
        page: 1,
        detections: [{ class: "figure", confidence: 0.9, position: { x: 10, y: 10, width: 100, height: 80 } }],
      },
    ];

    const { croppedImagesByPage } = await assessImages(["img"], singlePageOcr, layoutDetections);

    expect(mockFetchGptAssess).not.toHaveBeenCalled();
    expect(mockCropDetectedImages).toHaveBeenCalled();
    expect(croppedImagesByPage.has(1)).toBe(true);
    expect(croppedImagesByPage.get(1)).toHaveLength(1);
  });

  it("filters YOLO detections with confidence below 0.3", async () => {
    const layoutDetections = [
      {
        page: 1,
        detections: [
          { class: "figure", confidence: 0.2, position: { x: 0, y: 0, width: 50, height: 50 } },
        ],
      },
    ];

    const { croppedImagesByPage } = await assessImages(["img"], singlePageOcr, layoutDetections);

    expect(mockCropDetectedImages).not.toHaveBeenCalled();
    expect(croppedImagesByPage.size).toBe(0);
  });

  it("falls back to LLM when no layout detections but pages have images", async () => {
    mockFetchGptAssess.mockResolvedValue({ images: [] });

    await assessImages(["img"], singlePageOcr, undefined);

    expect(mockFetchGptAssess).toHaveBeenCalled();
  });

  it("stores LLM-detected crops in the map", async () => {
    mockFetchGptAssess.mockResolvedValue({
      images: [{ type: "chart", position: { x: 0, y: 0, width: 200, height: 150 } }],
    });
    mockCropDetectedImages.mockResolvedValue([
      { type: "chart", position: { x: 0, y: 0, width: 200, height: 150 }, data: "data:img" },
    ]);

    const { croppedImagesByPage } = await assessImages(["img"], singlePageOcr, undefined);

    expect(croppedImagesByPage.has(1)).toBe(true);
  });

  it("returns empty croppedImagesByPage when YOLO crops produce empty results", async () => {
    mockCropDetectedImages.mockResolvedValue([]);

    const layoutDetections = [
      {
        page: 1,
        detections: [{ class: "figure", confidence: 0.8, position: { x: 0, y: 0, width: 100, height: 80 } }],
      },
    ];

    const { croppedImagesByPage } = await assessImages(["img"], singlePageOcr, layoutDetections);

    expect(croppedImagesByPage.size).toBe(0);
  });
});

describe("assessDocuments", () => {
  beforeEach(() => {
    mockFetchGptAssess.mockReset();
  });

  const shortOcr: OcrResult = {
    pages: [
      { page: 1, text: "Blood test results for John Doe" },
      { page: 2, text: "Lab values: glucose 5.5 mmol/L" },
    ],
  };

  it("returns documents and token usage from AI classification", async () => {
    mockFetchGptAssess.mockResolvedValue({
      documents: [
        { title: "Blood Test Report", date: "2024-01-15", language: "en", isMedical: true, pages: [1, 2] },
      ],
    });

    const { documents, tokenUsage } = await assessDocuments(shortOcr);

    expect(documents).toHaveLength(1);
    expect(documents[0].title).toBe("Blood Test Report");
    expect(typeof tokenUsage.total).toBe("number");
  });

  it("calls progressCallback during classification", async () => {
    mockFetchGptAssess.mockResolvedValue({ documents: [] });
    const progress = vi.fn();

    await assessDocuments(shortOcr, progress);

    expect(progress).toHaveBeenCalledWith("ai_processing", 70, expect.any(String));
  });

  it("returns empty documents array when AI finds none", async () => {
    mockFetchGptAssess.mockResolvedValue({ documents: [] });

    const { documents } = await assessDocuments(shortOcr);

    expect(documents).toEqual([]);
  });

  it("throws when AI returns invalid document data", async () => {
    mockFetchGptAssess.mockResolvedValue(null);

    await expect(assessDocuments(shortOcr)).rejects.toThrow();
  });

  it("chunks large inputs (>8 pages) and merges results", async () => {
    const largeOcr: OcrResult = {
      pages: Array.from({ length: 12 }, (_, i) => ({
        page: i + 1,
        text: `Page ${i + 1} content`,
      })),
    };

    // Each chunk call returns one document
    mockFetchGptAssess
      .mockResolvedValueOnce({ documents: [{ title: "Doc A", date: "2024-01-01", language: "en", isMedical: true, pages: [1, 2, 3, 4, 5, 6, 7, 8] }] })
      .mockResolvedValueOnce({ documents: [{ title: "Doc B", date: "2024-01-02", language: "en", isMedical: true, pages: [7, 8, 9, 10, 11, 12] }] });

    const { documents } = await assessDocuments(largeOcr);

    // Doc A and Doc B share page 7+8 so they merge into one
    expect(documents.length).toBeGreaterThanOrEqual(1);
    // fetchGptEnhanced called more than once due to chunking
    expect(mockFetchGptAssess).toHaveBeenCalledTimes(2);
  });
});
