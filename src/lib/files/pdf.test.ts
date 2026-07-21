// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockPDFDocumentCreate,
  mockPDFDocumentLoad,
  mockProcessImages,
  mockMergeImages,
  mockGetImageMimeTypeFromBuffer,
  mockTypedArrayToBuffer,
  mockLazyPdfjs,
} = vi.hoisted(() => ({
  mockPDFDocumentCreate: vi.fn(),
  mockPDFDocumentLoad: vi.fn(),
  mockProcessImages: vi.fn(),
  mockMergeImages: vi.fn(),
  mockGetImageMimeTypeFromBuffer: vi.fn(),
  mockTypedArrayToBuffer: vi.fn().mockReturnValue(new ArrayBuffer(8)),
  mockLazyPdfjs: vi.fn(),
}));

vi.mock("pdf-lib", () => ({
  PDFDocument: {
    create: mockPDFDocumentCreate,
    load: mockPDFDocumentLoad,
  },
}));
vi.mock("./image", () => ({ processImages: mockProcessImages }));
vi.mock("$lib/images", () => ({
  merge: mockMergeImages,
  getImageMimeTypeFromBuffer: mockGetImageMimeTypeFromBuffer,
}));
vi.mock("$lib/arrays", () => ({ typedArrayToBuffer: mockTypedArrayToBuffer }));
vi.mock("$lib/files/CONFIG", () => ({
  THUMBNAIL_SIZE: 200,
  PROCESS_SIZE: 512,
}));
vi.mock("./lazyPdfjs", () => ({
  pdfjsLib: { getDocument: mockLazyPdfjs },
}));

// Import after mocks
import {
  CODES,
  selectPagesFromPdf,
  createPdfFromImageBuffers,
  loadPdfDocument,
  renderPDFToBase64Images,
  makeThumb,
} from "./pdf";

// ------------------------------------------------------------------
// Shared pdf-lib mock document builder
// ------------------------------------------------------------------
function buildMockPdfDoc(overrides: Record<string, any> = {}) {
  return {
    getPageCount: vi.fn().mockReturnValue(5),
    copyPages: vi.fn().mockResolvedValue([{ drawImage: vi.fn() }]),
    addPage: vi.fn().mockReturnValue({ drawImage: vi.fn() }),
    save: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    embedJpg: vi.fn().mockResolvedValue({
      scale: vi.fn().mockReturnValue({ width: 100, height: 100 }),
    }),
    embedPng: vi.fn().mockResolvedValue({
      scale: vi.fn().mockReturnValue({ width: 100, height: 100 }),
    }),
    ...overrides,
  };
}

// ------------------------------------------------------------------
// Install a canvas mock — replaces document.createElement("canvas")
// Returns the mock object so tests can assert on it.
// ------------------------------------------------------------------
function installCanvasMock(contextNull = false) {
  const mockCtx = contextNull
    ? null
    : {
        drawImage: vi.fn(),
        fillRect: vi.fn(),
      };

  const mockCanvas = {
    getContext: vi.fn().mockReturnValue(mockCtx),
    toDataURL: vi.fn().mockReturnValue("data:image/png;base64,abc"),
    height: 0,
    width: 0,
  };

  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    if (tag === "canvas") return mockCanvas as any;
    // For anything else fall back to the real implementation (un-spied)
    return document.createElement.call(document, tag);
  });

  return mockCanvas;
}

// ------------------------------------------------------------------
// Build a mock PDFDocumentProxy (pdf.js shape)
// ------------------------------------------------------------------
function buildMockPdfProxy(numPages = 2) {
  const viewport = { width: 100, height: 150 };
  const renderResult = { promise: Promise.resolve() };
  const page: any = {
    getViewport: vi.fn().mockReturnValue(viewport),
    render: vi.fn().mockReturnValue(renderResult),
  };
  return {
    numPages,
    getPage: vi.fn().mockResolvedValue(page),
    _page: page,
  };
}

// ==================================================================
// CODES
// ==================================================================
describe("CODES enum", () => {
  it("PASSWORD equals 'require.password'", () => {
    expect(CODES.PASSWORD).toBe("require.password");
  });

  it("PASSWORD_INCORRECT equals 'password.incorrect'", () => {
    expect(CODES.PASSWORD_INCORRECT).toBe("password.incorrect");
  });
});

// ==================================================================
// selectPagesFromPdf
// ==================================================================
describe("selectPagesFromPdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTypedArrayToBuffer.mockReturnValue(new ArrayBuffer(8));
  });

  it("calls PDFDocument.load with ignoreEncryption: true", async () => {
    const mockDoc = buildMockPdfDoc();
    mockPDFDocumentLoad.mockResolvedValue(mockDoc);
    mockPDFDocumentCreate.mockResolvedValue(mockDoc);

    const src = new ArrayBuffer(16);
    await selectPagesFromPdf(src, [1, 2]);
    expect(mockPDFDocumentLoad).toHaveBeenCalledWith(src, {
      ignoreEncryption: true,
    });
  });

  it("throws when no valid pages exist", async () => {
    const mockDoc = buildMockPdfDoc({
      getPageCount: vi.fn().mockReturnValue(3),
    });
    mockPDFDocumentLoad.mockResolvedValue(mockDoc);

    const src = new ArrayBuffer(16);
    await expect(selectPagesFromPdf(src, [10])).rejects.toThrow(
      "No valid pages",
    );
  });

  it("copies pages and returns a buffer", async () => {
    const mockDoc = buildMockPdfDoc({
      getPageCount: vi.fn().mockReturnValue(5),
      copyPages: vi.fn().mockResolvedValue([{ drawImage: vi.fn() }]),
    });
    mockPDFDocumentLoad.mockResolvedValue(mockDoc);
    mockPDFDocumentCreate.mockResolvedValue(mockDoc);

    const src = new ArrayBuffer(16);
    const result = await selectPagesFromPdf(src, [1, 3]);

    expect(mockDoc.copyPages).toHaveBeenCalled();
    expect(mockDoc.save).toHaveBeenCalled();
    expect(mockTypedArrayToBuffer).toHaveBeenCalled();
    expect(result).toBeInstanceOf(ArrayBuffer);
  });

  it("filters out-of-range page indices, passing only valid ones to copyPages", async () => {
    const mockDoc = buildMockPdfDoc({
      getPageCount: vi.fn().mockReturnValue(2),
      copyPages: vi.fn().mockResolvedValue([{ drawImage: vi.fn() }]),
    });
    mockPDFDocumentLoad.mockResolvedValue(mockDoc);
    mockPDFDocumentCreate.mockResolvedValue(mockDoc);

    await selectPagesFromPdf(new ArrayBuffer(16), [1, 5]);
    // page 1 → index 0 (valid); page 5 → index 4 (out of range for 2-page PDF)
    expect(mockDoc.copyPages).toHaveBeenCalledWith(expect.anything(), [0]);
  });
});

// ==================================================================
// createPdfFromImageBuffers
// ==================================================================
describe("createPdfFromImageBuffers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTypedArrayToBuffer.mockReturnValue(new ArrayBuffer(8));
  });

  it("returns an ArrayBuffer for empty input (no image buffers)", async () => {
    const mockDoc = buildMockPdfDoc();
    mockPDFDocumentCreate.mockResolvedValue(mockDoc);

    const result = await createPdfFromImageBuffers([]);
    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(mockPDFDocumentCreate).toHaveBeenCalled();
  });

  it("embeds JPEG images", async () => {
    mockGetImageMimeTypeFromBuffer.mockReturnValue("image/jpeg");
    const mockDoc = buildMockPdfDoc();
    mockPDFDocumentCreate.mockResolvedValue(mockDoc);

    const buf = new ArrayBuffer(16);
    const result = await createPdfFromImageBuffers([buf]);

    expect(mockDoc.embedJpg).toHaveBeenCalledWith(buf);
    expect(mockDoc.addPage).toHaveBeenCalled();
    expect(result).toBeInstanceOf(ArrayBuffer);
  });

  it("handles image/jpg mime type (alias for JPEG)", async () => {
    mockGetImageMimeTypeFromBuffer.mockReturnValue("image/jpg");
    const mockDoc = buildMockPdfDoc();
    mockPDFDocumentCreate.mockResolvedValue(mockDoc);

    await createPdfFromImageBuffers([new ArrayBuffer(16)]);
    expect(mockDoc.embedJpg).toHaveBeenCalled();
  });

  it("embeds PNG images", async () => {
    mockGetImageMimeTypeFromBuffer.mockReturnValue("image/png");
    const mockDoc = buildMockPdfDoc();
    mockPDFDocumentCreate.mockResolvedValue(mockDoc);

    const buf = new ArrayBuffer(16);
    const result = await createPdfFromImageBuffers([buf]);

    expect(mockDoc.embedPng).toHaveBeenCalledWith(buf);
    expect(result).toBeInstanceOf(ArrayBuffer);
  });

  it("throws for unsupported mime type", async () => {
    mockGetImageMimeTypeFromBuffer.mockReturnValue("image/gif");
    const mockDoc = buildMockPdfDoc();
    mockPDFDocumentCreate.mockResolvedValue(mockDoc);

    await expect(
      createPdfFromImageBuffers([new ArrayBuffer(16)]),
    ).rejects.toThrow("Unsupported image type");
  });

  it("embeds multiple images into one PDF", async () => {
    mockGetImageMimeTypeFromBuffer.mockReturnValue("image/jpeg");
    const mockDoc = buildMockPdfDoc();
    mockPDFDocumentCreate.mockResolvedValue(mockDoc);

    await createPdfFromImageBuffers([
      new ArrayBuffer(16),
      new ArrayBuffer(16),
      new ArrayBuffer(16),
    ]);
    expect(mockDoc.embedJpg).toHaveBeenCalledTimes(3);
    expect(mockDoc.addPage).toHaveBeenCalledTimes(3);
  });
});

// ==================================================================
// loadPdfDocument
// ==================================================================
describe("loadPdfDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls pdfjsLib.getDocument with the config and returns the resolved value", async () => {
    const fakeDoc = { numPages: 3 };
    mockLazyPdfjs.mockReturnValue({ promise: Promise.resolve(fakeDoc) });

    const config = { data: new ArrayBuffer(8) };
    const result = await loadPdfDocument(config);

    expect(mockLazyPdfjs).toHaveBeenCalledWith(config);
    expect(result).toEqual(fakeDoc);
  });
});

// ==================================================================
// renderPDFToBase64Images
// ==================================================================
describe("renderPDFToBase64Images", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns one base64 string per page", async () => {
    installCanvasMock();
    const pdfProxy = buildMockPdfProxy(2);
    const result = await renderPDFToBase64Images(pdfProxy as any);

    expect(pdfProxy.getPage).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("data:image/png;base64,abc");
  });

  it("returns empty array for a PDF with 0 pages", async () => {
    installCanvasMock();
    const pdfProxy = buildMockPdfProxy(0);
    const result = await renderPDFToBase64Images(pdfProxy as any);
    expect(result).toHaveLength(0);
  });

  it("throws when canvas context is null", async () => {
    installCanvasMock(true /* contextNull */);
    const pdfProxy = buildMockPdfProxy(1);
    await expect(renderPDFToBase64Images(pdfProxy as any)).rejects.toThrow(
      "Could not get 2D context from canvas",
    );
  });
});

// ==================================================================
// makeThumb
// ==================================================================
describe("makeThumb", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders page and returns a data URL", async () => {
    installCanvasMock();

    const viewport = { width: 400, height: 600 };
    const renderResult = { promise: Promise.resolve() };
    const page: any = {
      getViewport: vi.fn().mockReturnValue(viewport),
      render: vi.fn().mockReturnValue(renderResult),
    };

    const result = await makeThumb(page);
    expect(page.render).toHaveBeenCalled();
    expect(result).toBe("data:image/png;base64,abc");
  });

  it("throws when canvas context is null", async () => {
    installCanvasMock(true /* contextNull */);

    const viewport = { width: 100, height: 100 };
    const page: any = {
      getViewport: vi.fn().mockReturnValue(viewport),
      render: vi.fn(),
    };

    await expect(makeThumb(page)).rejects.toThrow(
      "Could not get 2D context from canvas",
    );
  });
});
