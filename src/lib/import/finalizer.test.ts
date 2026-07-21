import { describe, it, expect, beforeEach, vi } from "vitest";

// ---- Hoisted mock factories ----
const {
  mockAddDocument,
  mockProcessHealthData,
  mockCreateVirtualProfile,
  mockImportKey,
  mockDecryptAES,
  mockUnwrapKey,
  mockPemToKey,
  mockDeriveSections,
  mockSelectPagesFromPdf,
  mockCreatePdfFromImageBuffers,
  mockToBase64,
  mockBase64ToArrayBuffer,
  mockResizeImage,
} = vi.hoisted(() => ({
  mockAddDocument: vi.fn(),
  mockProcessHealthData: vi.fn(),
  mockCreateVirtualProfile: vi.fn(),
  mockImportKey: vi.fn(),
  mockDecryptAES: vi.fn(),
  mockUnwrapKey: vi.fn(),
  mockPemToKey: vi.fn(),
  mockDeriveSections: vi.fn().mockReturnValue([]),
  mockSelectPagesFromPdf: vi.fn(),
  mockCreatePdfFromImageBuffers: vi.fn(),
  mockToBase64: vi.fn().mockResolvedValue("base64=="),
  mockBase64ToArrayBuffer: vi.fn().mockReturnValue(new ArrayBuffer(8)),
  mockResizeImage: vi.fn().mockResolvedValue("data:thumb"),
}));

vi.mock("./index", () => ({
  DocumentState: { PROCESSED: "processed" },
}));

vi.mock("$lib/documents/types.d", () => ({
  DocumentType: { document: "document" },
}));

vi.mock("$lib/documents", () => ({
  addDocument: mockAddDocument,
}));

vi.mock("$lib/health/signals", () => ({
  processHealthData: mockProcessHealthData,
}));

vi.mock("$lib/profiles", () => ({
  createVirtualProfile: mockCreateVirtualProfile,
}));

vi.mock("$lib/profiles/tools", () => ({
  PROFILE_NEW_ID: "new",
}));

vi.mock("$lib/encryption/aes", () => ({
  importKey: mockImportKey,
  decrypt: mockDecryptAES,
}));

vi.mock("$lib/encryption/keys", () => ({
  unwrapKey: mockUnwrapKey,
  HybridKeyPair: class HybridKeyPair {},
}));

vi.mock("$lib/encryption/rsa", () => ({
  pemToKey: mockPemToKey,
}));

vi.mock("$app/environment", () => ({
  browser: false,
}));

vi.mock("$lib/documents/sections", () => ({
  deriveSections: mockDeriveSections,
}));

vi.mock("$lib/files/pdf", () => ({
  selectPagesFromPdf: mockSelectPagesFromPdf,
  createPdfFromImageBuffers: mockCreatePdfFromImageBuffers,
}));

vi.mock("$lib/arrays", () => ({
  toBase64: mockToBase64,
  base64ToArrayBuffer: mockBase64ToArrayBuffer,
}));

vi.mock("$lib/images", () => ({
  resizeImage: mockResizeImage,
}));

vi.mock("$lib/files/CONFIG", () => ({
  THUMBNAIL_SIZE: 200,
}));

// Import after mocks
import { decryptJobResults, assembleDocuments, saveDocuments } from "./finalizer";
import type { ImportJob, Assessment, ReportAnalysis } from "./types";
import { Types } from "./types";

// ---- Helpers ----

function makeJob(overrides: Partial<ImportJob> = {}): ImportJob {
  return {
    id: "job-1",
    user_id: "user-1",
    status: "completed",
    stage: null,
    progress: 100,
    message: null,
    error: null,
    scan_deducted: false,
    processing_started_at: null,
    file_count: 1,
    file_manifest: [],
    language: "en",
    extraction_result: null,
    analysis_results: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    expires_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeAssessment(overrides: Partial<Assessment> = {}): Assessment {
  return {
    pages: [
      {
        page: 1,
        language: "en",
        text: "Sample page text",
        images: [],
      },
    ],
    documents: [
      {
        title: "Blood Test Report",
        date: "2024-01-15",
        language: "en",
        isMedical: true,
        pages: [1],
      },
    ],
    tokenUsage: { input: 100, output: 50, total: 150 },
    ...overrides,
  };
}

function makeAnalysis(overrides: Partial<ReportAnalysis> = {}): ReportAnalysis {
  return {
    type: Types.report,
    fhirType: "DiagnosticReport",
    fhir: {},
    category: "laboratory",
    isMedical: true,
    tags: ["blood", "lab"],
    hasPrescription: false,
    hasImmunization: false,
    hasLabOrVitals: true,
    text: "Full report text",
    tokenUsage: { input: 200, output: 100, total: 300 },
    report: {
      title: "Blood Test Report",
      date: "2024-01-15",
      category: "laboratory",
      summary: "All values normal",
    },
    ...overrides,
  };
}

function makeProfile(overrides: Record<string, any> = {}) {
  return {
    id: "profile-1",
    fullName: "John Doe",
    birthDate: "1990-01-01",
    ...overrides,
  };
}

// ---- Tests ----

describe("decryptJobResults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeriveSections.mockReturnValue([]);
    mockToBase64.mockResolvedValue("base64==");
    mockBase64ToArrayBuffer.mockReturnValue(new ArrayBuffer(8));
    mockResizeImage.mockResolvedValue("data:thumb");
  });

  it("returns plaintext when job has no encrypted results (missing result_encryption_key)", async () => {
    const extraction: Assessment[] = [makeAssessment()];
    const analysis: ReportAnalysis[] = [makeAnalysis()];

    const job = makeJob({
      extraction_result: extraction,
      analysis_results: analysis,
    });

    const result = await decryptJobResults(job);

    expect(result.extraction).toEqual(extraction);
    expect(result.analysis).toEqual(analysis);
  });

  it("returns extraction: [] and analysis: [] when plaintext fields are empty/null", async () => {
    const job = makeJob({
      extraction_result: null,
      analysis_results: [],
    });

    const result = await decryptJobResults(job);

    expect(result.extraction).toEqual([]);
    expect(result.analysis).toEqual([]);
  });

  it("throws when job has result_encryption_key but no userPrivateKey", async () => {
    const job = makeJob({
      result_encryption_key: "wrapped-key",
      encrypted_extraction_result: "enc-extraction",
      encrypted_analysis_results: "enc-analysis",
    });

    await expect(decryptJobResults(job)).rejects.toThrow(
      "User private key required to decrypt job results",
    );
  });

  it("decrypts results when job has encrypted fields", async () => {
    const extraction: Assessment[] = [makeAssessment()];
    const analysis: ReportAnalysis[] = [makeAnalysis()];

    const job = makeJob({
      result_encryption_key: "wrapped-key",
      encrypted_extraction_result: "enc-extraction",
      encrypted_analysis_results: "enc-analysis",
    });

    const fakeRawKey = new Uint8Array(32);
    const fakeCryptoKey = { type: "secret" } as unknown as CryptoKey;
    const fakeUserPrivateKey = { type: "private" } as unknown as CryptoKey;

    mockUnwrapKey.mockResolvedValue(fakeRawKey);
    mockImportKey.mockResolvedValue(fakeCryptoKey);
    mockDecryptAES
      .mockResolvedValueOnce(JSON.stringify(extraction))
      .mockResolvedValueOnce(JSON.stringify(analysis));

    const result = await decryptJobResults(job, fakeUserPrivateKey);

    expect(mockUnwrapKey).toHaveBeenCalledWith(
      fakeUserPrivateKey,
      null,
      "wrapped-key",
    );
    expect(mockImportKey).toHaveBeenCalledWith(fakeRawKey);
    expect(mockDecryptAES).toHaveBeenCalledTimes(2);
    expect(mockDecryptAES).toHaveBeenNthCalledWith(
      1,
      fakeCryptoKey,
      "enc-extraction",
    );
    expect(mockDecryptAES).toHaveBeenNthCalledWith(
      2,
      fakeCryptoKey,
      "enc-analysis",
    );
    expect(result.extraction).toEqual(extraction);
    expect(result.analysis).toEqual(analysis);
  });
});

describe("assembleDocuments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeriveSections.mockReturnValue([]);
    mockToBase64.mockResolvedValue("base64==");
    mockBase64ToArrayBuffer.mockReturnValue(new ArrayBuffer(8));
    mockResizeImage.mockResolvedValue("data:thumb");
  });

  it("returns empty array for empty extractionResults", async () => {
    const result = await assembleDocuments([], []);
    expect(result).toEqual([]);
  });

  it("assembles documents from assessment without original files", async () => {
    const assessment = makeAssessment();
    const analysis = makeAnalysis();

    const result = await assembleDocuments([assessment], [analysis]);

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Blood Test Report");
    expect(result[0].state).toBe("processed");
    expect(result[0].isMedical).toBe(true);
    expect(result[0].content).toMatchObject({
      title: "Blood Test Report",
      date: "2024-01-15",
      category: "laboratory",
      summary: "All values normal",
    });
    expect(result[0].attachments).toEqual([]);
  });

  it("calls onProgress callback with values from 0 to 1", async () => {
    const assessment = makeAssessment({
      documents: [
        { title: "Doc 1", date: "2024-01-01", language: "en", isMedical: true, pages: [1] },
        { title: "Doc 2", date: "2024-01-02", language: "en", isMedical: true, pages: [1] },
      ],
    });
    const analysis1 = makeAnalysis({ report: { title: "Doc 1", date: "2024-01-01" } });
    const analysis2 = makeAnalysis({ report: { title: "Doc 2", date: "2024-01-02" } });

    const onProgress = vi.fn();
    await assembleDocuments([assessment], [analysis1, analysis2], null, onProgress);

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenNthCalledWith(1, 0.5);
    expect(onProgress).toHaveBeenNthCalledWith(2, 1);
  });

  it("handles multiple documents per assessment", async () => {
    const assessment = makeAssessment({
      pages: [
        { page: 1, language: "en", text: "Page 1", images: [] },
        { page: 2, language: "en", text: "Page 2", images: [] },
      ],
      documents: [
        { title: "Doc A", date: "2024-01-01", language: "en", isMedical: true, pages: [1] },
        { title: "Doc B", date: "2024-01-02", language: "en", isMedical: false, pages: [2] },
      ],
    });
    const analysisA = makeAnalysis({ report: { title: "Doc A", date: "2024-01-01", category: "lab" } });
    const analysisB = makeAnalysis({
      isMedical: false,
      report: { title: "Doc B", date: "2024-01-02", category: "general" },
    });

    const result = await assembleDocuments([assessment], [analysisA, analysisB]);

    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("Doc A");
    expect(result[1].title).toBe("Doc B");
    expect(result[1].isMedical).toBe(false);
  });
});

describe("saveDocuments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeriveSections.mockReturnValue([]);
    mockAddDocument.mockResolvedValue({ id: "saved-doc-1" });
    mockProcessHealthData.mockResolvedValue(undefined);
    mockCreateVirtualProfile.mockResolvedValue({ id: "created-profile-1", fullName: "New Person" });
  });

  it("saves document using addDocument for each document in each profile", async () => {
    const profile = makeProfile();
    const doc = {
      title: "Lab Report",
      date: "2024-01-15",
      isMedical: true,
      state: "processed" as any,
      pages: [],
      content: {
        title: "Lab Report",
        tags: ["lab"],
        date: "2024-01-15",
        category: "laboratory",
      },
      attachments: [],
      type: "application/pdf" as any,
      files: [] as any,
      task: undefined as any,
    };

    await saveDocuments([{ profile: profile as any, reports: [doc as any] }]);

    expect(mockAddDocument).toHaveBeenCalledOnce();
    expect(mockAddDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "profile-1",
        type: "document",
        metadata: expect.objectContaining({
          title: "Lab Report",
          category: "laboratory",
        }),
        content: expect.objectContaining({ title: "Lab Report" }),
      }),
    );
  });

  it("calls createVirtualProfile when profile.id === PROFILE_NEW_ID", async () => {
    const newProfile = makeProfile({ id: "new" });
    const doc = {
      title: "Doc",
      date: "2024-01-01",
      isMedical: true,
      state: "processed" as any,
      pages: [],
      content: { title: "Doc", tags: [], date: "2024-01-01", category: "report" },
      attachments: [],
      type: "application/pdf" as any,
      files: [] as any,
      task: undefined as any,
    };

    await saveDocuments([{ profile: newProfile as any, reports: [doc as any] }]);

    expect(mockCreateVirtualProfile).toHaveBeenCalledOnce();
    expect(mockCreateVirtualProfile).toHaveBeenCalledWith(newProfile);
    // addDocument should use the newly created profile id
    expect(mockAddDocument).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "created-profile-1" }),
    );
  });

  it("calls processHealthData with content, profileId, and savedDocumentId", async () => {
    const profile = makeProfile();
    const content = {
      title: "Health Report",
      tags: [],
      date: "2024-03-01",
      category: "general",
      summary: "Healthy",
    };
    const doc = {
      title: "Health Report",
      date: "2024-03-01",
      isMedical: true,
      state: "processed" as any,
      pages: [],
      content,
      attachments: [],
      type: "application/pdf" as any,
      files: [] as any,
      task: undefined as any,
    };

    mockAddDocument.mockResolvedValue({ id: "saved-doc-42" });

    await saveDocuments([{ profile: profile as any, reports: [doc as any] }]);

    expect(mockProcessHealthData).toHaveBeenCalledOnce();
    expect(mockProcessHealthData).toHaveBeenCalledWith(
      content,
      "profile-1",
      "saved-doc-42",
    );
  });

  it("handles signals array in content", async () => {
    const profile = makeProfile();
    const signals = [
      { signal: "Glucose", value: "5.5", unit: "mmol/L" },
      { signal: "Hemoglobin", value: "140", unit: "g/L" },
    ];
    const content = {
      title: "Lab",
      tags: [],
      date: "2024-02-01",
      category: "laboratory",
      signals,
    };
    const doc = {
      title: "Lab",
      date: "2024-02-01",
      isMedical: true,
      state: "processed" as any,
      pages: [],
      content,
      attachments: [],
      type: "application/pdf" as any,
      files: [] as any,
      task: undefined as any,
    };

    await saveDocuments([{ profile: profile as any, reports: [doc as any] }]);

    expect(mockAddDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          signals: ["Glucose", "Hemoglobin"],
        }),
      }),
    );
    expect(mockProcessHealthData).toHaveBeenCalledWith(
      content,
      "profile-1",
      expect.any(String),
    );
  });

  it("handles wrapped signals format { signals: [...] }", async () => {
    const profile = makeProfile();
    const innerSignals = [
      { signal: "Glucose", value: "5.5", unit: "mmol/L" },
    ];
    const content = {
      title: "Wrapped Signals",
      tags: [],
      date: "2024-02-01",
      category: "laboratory",
      signals: { signals: innerSignals },
    };
    const doc = {
      title: "Wrapped Signals",
      date: "2024-02-01",
      isMedical: true,
      state: "processed" as any,
      pages: [],
      content,
      attachments: [],
      type: "application/pdf" as any,
      files: [] as any,
      task: undefined as any,
    };

    await saveDocuments([{ profile: profile as any, reports: [doc as any] }]);

    expect(mockAddDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          signals: ["Glucose"],
        }),
      }),
    );
  });

  it("logs warn and skips signals when signals format is unexpected object", async () => {
    const profile = makeProfile();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const content = {
      title: "Bad Signals",
      tags: [],
      date: "2024-02-01",
      category: "laboratory",
      signals: { notAnArray: true },
    };
    const doc = {
      title: "Bad Signals",
      date: "2024-02-01",
      isMedical: true,
      state: "processed" as any,
      pages: [],
      content,
      attachments: [],
      type: "application/pdf" as any,
      files: [] as any,
      task: undefined as any,
    };

    await saveDocuments([{ profile: profile as any, reports: [doc as any] }]);

    expect(warnSpy).toHaveBeenCalledWith(
      "Signals data is not in expected format:",
      content.signals,
    );
    warnSpy.mockRestore();
  });

  it("sets sections on metadata when deriveSections returns non-empty array", async () => {
    const profile = makeProfile();
    const fakeSections = [{ type: "vitals", label: "Vitals" }];
    mockDeriveSections.mockReturnValue(fakeSections);

    const content = {
      title: "Sectioned Doc",
      tags: [],
      date: "2024-03-01",
      category: "laboratory",
    };
    const doc = {
      title: "Sectioned Doc",
      date: "2024-03-01",
      isMedical: true,
      state: "processed" as any,
      pages: [],
      content,
      attachments: [],
      type: "application/pdf" as any,
      files: [] as any,
      task: undefined as any,
    };

    await saveDocuments([{ profile: profile as any, reports: [doc as any] }]);

    expect(mockAddDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          sections: fakeSections,
        }),
      }),
    );
  });

  it("sets summary and diagnosis on metadata when present in content", async () => {
    const profile = makeProfile();
    const content = {
      title: "Detailed Doc",
      tags: [],
      date: "2024-03-01",
      category: "laboratory",
      summary: "All normal",
      diagnosis: "Healthy",
    };
    const doc = {
      title: "Detailed Doc",
      date: "2024-03-01",
      isMedical: true,
      state: "processed" as any,
      pages: [],
      content,
      attachments: [],
      type: "application/pdf" as any,
      files: [] as any,
      task: undefined as any,
    };

    await saveDocuments([{ profile: profile as any, reports: [doc as any] }]);

    expect(mockAddDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          summary: "All normal",
          diagnosis: "Healthy",
        }),
      }),
    );
  });

  it("normalizes attachment MIME types via normalizeMimeType (application/pdf path)", async () => {
    const profile = makeProfile();
    const content = {
      title: "Doc With Attachment",
      tags: [],
      date: "2024-03-01",
      category: "laboratory",
    };
    const doc = {
      title: "Doc With Attachment",
      date: "2024-03-01",
      isMedical: true,
      state: "processed" as any,
      pages: [],
      content,
      attachments: [
        { type: "application/pdf", path: "file.pdf", url: "", file: "base64==", thumbnail: "" },
      ],
      type: "application/pdf" as any,
      files: [] as any,
      task: undefined as any,
    };

    await saveDocuments([{ profile: profile as any, reports: [doc as any] }]);

    expect(mockAddDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          expect.objectContaining({ type: "application/pdf" }),
        ],
      }),
    );
  });

  it("normalizes attachment MIME types for DICOM by extension", async () => {
    const profile = makeProfile();
    const content = { title: "DICOM", tags: [], date: "2024-03-01", category: "radiology" };
    const doc = {
      title: "DICOM",
      date: "2024-03-01",
      isMedical: true,
      state: "processed" as any,
      pages: [],
      content,
      attachments: [
        { type: undefined, path: "scan.dcm", url: "", file: "base64==", thumbnail: "" },
      ],
      type: "application/dicom" as any,
      files: [] as any,
      task: undefined as any,
    };

    await saveDocuments([{ profile: profile as any, reports: [doc as any] }]);

    expect(mockAddDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          expect.objectContaining({ type: "application/dicom" }),
        ],
      }),
    );
  });

  it("normalizes attachment MIME types for image by extension", async () => {
    const profile = makeProfile();
    const content = { title: "Image", tags: [], date: "2024-03-01", category: "radiology" };
    const doc = {
      title: "Image",
      date: "2024-03-01",
      isMedical: true,
      state: "processed" as any,
      pages: [],
      content,
      attachments: [
        { type: undefined, path: "photo.jpg", url: "", file: "base64==", thumbnail: "" },
        { type: "image/png", path: "", url: "", file: "base64==", thumbnail: "" },
        { type: undefined, path: "pic.svg", url: "", file: "base64==", thumbnail: "" },
        { type: "image/tiff", path: "scan.tif", url: "", file: "base64==", thumbnail: "" },
      ],
      type: "image/jpeg" as any,
      files: [] as any,
      task: undefined as any,
    };

    await saveDocuments([{ profile: profile as any, reports: [doc as any] }]);

    expect(mockAddDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: expect.arrayContaining([
          expect.objectContaining({ type: "image/jpeg" }),
          expect.objectContaining({ type: "image/png" }),
          expect.objectContaining({ type: "image/svg+xml" }),
          expect.objectContaining({ type: "image/tiff" }),
        ]),
      }),
    );
  });

  it("normalizes attachment MIME type to application/octet-stream when no type or path", async () => {
    const profile = makeProfile();
    const content = { title: "Unknown", tags: [], date: "2024-03-01", category: "other" };
    const doc = {
      title: "Unknown",
      date: "2024-03-01",
      isMedical: true,
      state: "processed" as any,
      pages: [],
      content,
      attachments: [
        { type: undefined, path: undefined, url: "", file: "base64==", thumbnail: "" },
      ],
      type: "application/octet-stream" as any,
      files: [] as any,
      task: undefined as any,
    };

    await saveDocuments([{ profile: profile as any, reports: [doc as any] }]);

    expect(mockAddDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          expect.objectContaining({ type: "application/octet-stream" }),
        ],
      }),
    );
  });

  it("handles empty byProfileDetected array", async () => {
    const result = await saveDocuments([]);
    expect(result).toEqual([]);
    expect(mockAddDocument).not.toHaveBeenCalled();
  });

  it("handles profile with no reports (empty reports array)", async () => {
    const profile = makeProfile();
    const result = await saveDocuments([{ profile: profile as any, reports: [] }]);
    expect(result).toEqual([]);
    expect(mockAddDocument).not.toHaveBeenCalled();
  });

  it("returns array of saved documents for multiple profiles", async () => {
    const profile1 = makeProfile({ id: "p1" });
    const profile2 = makeProfile({ id: "p2" });
    mockAddDocument
      .mockResolvedValueOnce({ id: "doc-a" })
      .mockResolvedValueOnce({ id: "doc-b" });
    const makeDoc = (title: string) => ({
      title,
      date: "2024-01-01",
      isMedical: true,
      state: "processed" as any,
      pages: [],
      content: { title, tags: [], date: "2024-01-01", category: "report" },
      attachments: [],
      type: "application/pdf" as any,
      files: [] as any,
      task: undefined as any,
    });

    const result = await saveDocuments([
      { profile: profile1 as any, reports: [makeDoc("Doc A") as any] },
      { profile: profile2 as any, reports: [makeDoc("Doc B") as any] },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("doc-a");
    expect(result[1].id).toBe("doc-b");
  });
});

describe("normalizeMimeType (via saveDocuments attachments)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeriveSections.mockReturnValue([]);
    mockAddDocument.mockResolvedValue({ id: "saved-doc-1" });
    mockProcessHealthData.mockResolvedValue(undefined);
    mockCreateVirtualProfile.mockResolvedValue({ id: "created-profile-1" });
  });

  async function saveWithAttachment(attachment: { type: any; path?: any; [k: string]: any }) {
    const profile = { id: "profile-1", fullName: "Test" };
    const doc: any = {
      title: "T",
      date: "2024-01-01",
      isMedical: true,
      state: "processed",
      pages: [],
      content: { title: "T", tags: [], date: "2024-01-01", category: "x" },
      attachments: [{ url: "", file: "b64", thumbnail: "", ...attachment }],
      type: "application/pdf",
      files: [],
      task: undefined,
    };
    await saveDocuments([{ profile: profile as any, reports: [doc] }]);
    const call = mockAddDocument.mock.calls[0][0];
    return call.attachments[0].type;
  }

  it("returns application/dicom for 'application/x-dicom' type", async () => {
    expect(await saveWithAttachment({ type: "application/x-dicom" })).toBe("application/dicom");
  });

  it("returns application/dicom for '.dicom' extension", async () => {
    expect(await saveWithAttachment({ type: undefined, path: "file.dicom" })).toBe("application/dicom");
  });

  it("returns application/dicom for '.dic' extension", async () => {
    expect(await saveWithAttachment({ type: undefined, path: "file.dic" })).toBe("application/dicom");
  });

  it("returns application/pdf for 'application/pdf' type", async () => {
    expect(await saveWithAttachment({ type: "application/pdf" })).toBe("application/pdf");
  });

  it("returns application/pdf for '.pdf' extension with no type", async () => {
    expect(await saveWithAttachment({ type: "", path: "report.pdf" })).toBe("application/pdf");
  });

  it("returns image/jpeg for 'image/jpeg' type", async () => {
    expect(await saveWithAttachment({ type: "image/jpeg" })).toBe("image/jpeg");
  });

  it("returns image/png for '.png' extension", async () => {
    expect(await saveWithAttachment({ type: "", path: "photo.png" })).toBe("image/png");
  });

  it("returns image/gif for '.gif' extension", async () => {
    expect(await saveWithAttachment({ type: "", path: "anim.gif" })).toBe("image/gif");
  });

  it("returns image/webp for '.webp' extension", async () => {
    expect(await saveWithAttachment({ type: "", path: "img.webp" })).toBe("image/webp");
  });

  it("returns image/bmp for '.bmp' extension", async () => {
    expect(await saveWithAttachment({ type: "", path: "img.bmp" })).toBe("image/bmp");
  });

  it("returns image/tiff for '.tiff' extension", async () => {
    expect(await saveWithAttachment({ type: "", path: "scan.tiff" })).toBe("image/tiff");
  });

  it("returns the original image/* type when ext is not in imageExtMap", async () => {
    // When type starts with image/ and ext is not in the imageExtMap, returns t (the type itself)
    expect(await saveWithAttachment({ type: "image/unknown-format", path: "noext" })).toBe("image/unknown-format");
  });

  it("returns original image/* type for image/avif with no matching ext", async () => {
    expect(await saveWithAttachment({ type: "image/avif", path: "" })).toBe("image/avif");
  });

  it("returns application/octet-stream when type is empty string and path empty", async () => {
    expect(await saveWithAttachment({ type: "", path: "" })).toBe("application/octet-stream");
  });
});
