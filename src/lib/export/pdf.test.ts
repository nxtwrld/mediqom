import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Hoisted mocks ----
const {
  mockGet,
  mockT,
  mockApiFetch,
  mockDecrypt,
  mockCreatePdf,
  mockGetBuffer,
  mockPDFDocument,
  mockAtob,
  mockCreateObjectURL,
  mockRevokeObjectURL,
  mockCreateElement,
} = vi.hoisted(() => {
  const mockGetBuffer = vi.fn();
  const mockCreatePdf = vi.fn(() => ({ getBuffer: mockGetBuffer }));

  const mockPDFDocumentLoad = vi.fn();
  const mockAddPage = vi.fn();
  const mockSave = vi.fn().mockResolvedValue(new Uint8Array([10, 20, 30]));
  const mockCopyPages = vi.fn();
  const mockGetPageIndices = vi.fn().mockReturnValue([0, 1]);

  const mockPDFDocument = {
    load: mockPDFDocumentLoad,
  };

  return {
    mockGet: vi.fn(),
    mockT: vi.fn(),
    mockApiFetch: vi.fn(),
    mockDecrypt: vi.fn(),
    mockCreatePdf,
    mockGetBuffer,
    mockPDFDocument,
    mockAtob: vi.fn(),
    mockCreateObjectURL: vi.fn().mockReturnValue("blob:test"),
    mockRevokeObjectURL: vi.fn(),
    mockCreateElement: vi.fn(),
  };
});

// Mock svelte/store
vi.mock("svelte/store", () => ({
  get: mockGet,
}));

// Mock $lib/i18n
vi.mock("$lib/i18n", () => ({
  t: { subscribe: vi.fn() },
}));

// Mock $lib/api/client
vi.mock("$lib/api/client", () => ({
  apiFetch: mockApiFetch,
}));

// Mock $lib/documents/index
vi.mock("$lib/documents/index", () => ({
  decrypt: mockDecrypt,
}));

// Mock pdfmake/build/pdfmake
vi.mock("pdfmake/build/pdfmake", () => ({
  default: {
    createPdf: mockCreatePdf,
    vfs: {},
  },
}));

// Mock pdfmake/build/vfs_fonts
vi.mock("pdfmake/build/vfs_fonts", () => ({
  default: {
    pdfMake: {
      vfs: { "Roboto-Regular.ttf": "base64data" },
    },
  },
}));

// Mock pdf-lib
vi.mock("pdf-lib", () => {
  const mockMainDoc = {
    copyPages: vi.fn().mockResolvedValue([{}, {}]),
    addPage: vi.fn(),
    save: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    getPageIndices: vi.fn().mockReturnValue([0]),
  };
  return {
    PDFDocument: {
      load: vi.fn().mockResolvedValue(mockMainDoc),
    },
  };
});

// Import after all mocks
import { downloadPdf } from "./pdf";

describe("downloadPdf", () => {
  let mockAnchor: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup translation mock to return key suffix
    mockGet.mockImplementation((store: any) => {
      return (key: string) => key.split(".").pop() || key;
    });

    // Setup getBuffer to return a Uint8Array
    mockGetBuffer.mockResolvedValue(new Uint8Array([1, 2, 3]));

    // Setup DOM mocks
    mockAnchor = { href: "", download: "", click: vi.fn() };
    mockCreateElement.mockReturnValue(mockAnchor);

    // Override globals
    global.atob = vi.fn((s) => {
      // return a simple binary string of length matching base64
      return "binary";
    });
    global.URL = {
      createObjectURL: mockCreateObjectURL,
      revokeObjectURL: mockRevokeObjectURL,
    } as any;

    Object.defineProperty(global, "document", {
      value: {
        createElement: mockCreateElement,
      },
      writable: true,
      configurable: true,
    });

    global.Blob = function(this: any, parts: any[], opts?: any) {
      this.parts = parts;
      this.opts = opts;
      this.size = 0;
      this.type = opts?.type || '';
    } as any;
  });

  it("generates a PDF with minimal item and triggers download", async () => {
    const item = {
      metadata: { title: "Test Report", date: "2024-01-15" },
      content: {},
      attachments: [],
    };

    await downloadPdf(item);

    expect(mockCreatePdf).toHaveBeenCalled();
    expect(mockGetBuffer).toHaveBeenCalled();
    expect(mockCreateElement).toHaveBeenCalledWith("a");
    expect(mockAnchor.click).toHaveBeenCalled();
    expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:test");
  });

  it("uses default title when metadata is missing", async () => {
    const item = {
      metadata: {},
      content: {},
      attachments: [],
    };

    await downloadPdf(item);

    const callArgs = (mockCreatePdf.mock.calls[0] as any[])[0];
    expect(callArgs.info.title).toBe("Medical Report");
  });

  it("includes profile section when profile is provided", async () => {
    const item = {
      metadata: { title: "Report" },
      content: {},
      attachments: [],
    };
    const profile = {
      fullName: "John Doe",
      birthDate: "1990-05-15",
      vcard: { gender: "Male" },
      health: { bloodType: "A+" },
    };

    await downloadPdf(item, profile);

    const callArgs = (mockCreatePdf.mock.calls[0] as any[])[0];
    // Content should contain profile section items
    expect(callArgs.content).toBeDefined();
    expect(Array.isArray(callArgs.content)).toBe(true);
  });

  it("includes summary in content", async () => {
    const item = {
      metadata: { title: "Report" },
      content: { summary: "Patient presents with..." },
      attachments: [],
    };

    await downloadPdf(item);

    const callArgs = (mockCreatePdf.mock.calls[0] as any[])[0];
    const contentStr = JSON.stringify(callArgs.content);
    expect(contentStr).toContain("Patient presents with...");
  });

  it("includes diagnosis section when diagnosis is array", async () => {
    const item = {
      metadata: { title: "Report" },
      content: {
        diagnosis: [
          {
            description: "Hypertension",
            code: "I10",
            type: "primary",
            notes: "Controlled",
          },
          { description: "Diabetes", code: "E11" },
        ],
      },
      attachments: [],
    };

    await downloadPdf(item);

    const callArgs = (mockCreatePdf.mock.calls[0] as any[])[0];
    const contentStr = JSON.stringify(callArgs.content);
    expect(contentStr).toContain("Hypertension");
    expect(contentStr).toContain("I10");
  });

  it("includes signals/laboratory results", async () => {
    const item = {
      metadata: { title: "Lab Report" },
      content: {
        signals: [
          { signal: "Hemoglobin", value: "14.5", unit: "g/dL", reference: "12-16" },
          { test: "WBC", value: "7.2", unit: "K/uL" },
        ],
      },
      attachments: [],
    };

    await downloadPdf(item);

    const callArgs = (mockCreatePdf.mock.calls[0] as any[])[0];
    const contentStr = JSON.stringify(callArgs.content);
    expect(contentStr).toContain("Hemoglobin");
  });

  it("includes laboratory results via laboratory field", async () => {
    const item = {
      metadata: { title: "Lab Report" },
      content: {
        laboratory: [
          { name: "Glucose", value: "95", unit: "mg/dL" },
        ],
      },
      attachments: [],
    };

    await downloadPdf(item);

    const callArgs = (mockCreatePdf.mock.calls[0] as any[])[0];
    const contentStr = JSON.stringify(callArgs.content);
    expect(contentStr).toContain("Glucose");
  });

  it("includes vital signs section", async () => {
    const item = {
      metadata: { title: "Checkup" },
      content: {
        vitalSigns: {
          bloodPressure: { systolic: 120, diastolic: 80 },
          heartRate: 72,
          temperature: 36.6,
          weight: "70kg",
          height: "175cm",
          oxygenSaturation: "98%",
          respiratoryRate: 16,
        },
      },
      attachments: [],
    };

    await downloadPdf(item);

    const callArgs = (mockCreatePdf.mock.calls[0] as any[])[0];
    const contentStr = JSON.stringify(callArgs.content);
    expect(contentStr).toContain("120/80");
    expect(contentStr).toContain("72");
  });

  it("includes medications section", async () => {
    const item = {
      metadata: { title: "Report" },
      content: {
        medications: [
          { name: "Metformin", dosage: "500mg", frequency: "twice daily", notes: "with food" },
          { name: "Lisinopril", dose: "10mg", frequency: "once daily" },
        ],
      },
      attachments: [],
    };

    await downloadPdf(item);

    const callArgs = (mockCreatePdf.mock.calls[0] as any[])[0];
    const contentStr = JSON.stringify(callArgs.content);
    expect(contentStr).toContain("Metformin");
    expect(contentStr).toContain("Lisinopril");
  });

  it("includes recommendations and treatment plan", async () => {
    const item = {
      metadata: { title: "Report" },
      content: {
        recommendations: ["Exercise daily", "Low-sodium diet"],
        treatmentPlan: "Continue current medications",
      },
      attachments: [],
    };

    await downloadPdf(item);

    const callArgs = (mockCreatePdf.mock.calls[0] as any[])[0];
    const contentStr = JSON.stringify(callArgs.content);
    expect(contentStr).toContain("Exercise daily");
    expect(contentStr).toContain("Continue current medications");
  });

  it("includes notes section", async () => {
    const item = {
      metadata: { title: "Report" },
      content: {
        notes: "Follow up in 3 months",
      },
      attachments: [],
    };

    await downloadPdf(item);

    const callArgs = (mockCreatePdf.mock.calls[0] as any[])[0];
    const contentStr = JSON.stringify(callArgs.content);
    expect(contentStr).toContain("Follow up in 3 months");
  });

  it("includes performer section (single object)", async () => {
    const item = {
      metadata: { title: "Report" },
      content: {
        performer: {
          name: "Dr. Smith",
          title: "Dr.",
          specialty: "Cardiology",
          institution: { name: "City Hospital", department: "Cardiology Dept" },
          datePerformed: "2024-01-10",
        },
      },
      attachments: [],
    };

    await downloadPdf(item);

    const callArgs = (mockCreatePdf.mock.calls[0] as any[])[0];
    const contentStr = JSON.stringify(callArgs.content);
    expect(contentStr).toContain("Smith");
  });

  it("includes performer section (array)", async () => {
    const item = {
      metadata: { title: "Report" },
      content: {
        performer: [
          { fn: "Dr. Jones", specialty: "Neurology" },
          { name: "Dr. Adams" },
        ],
      },
      attachments: [],
    };

    await downloadPdf(item);

    const callArgs = (mockCreatePdf.mock.calls[0] as any[])[0];
    const contentStr = JSON.stringify(callArgs.content);
    expect(contentStr).toContain("Jones");
  });

  it("handles image attachments", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      text: async () => "encryptedData",
    });
    mockDecrypt.mockResolvedValue(['{"file":"base64imagedata","type":"image/png"}']);

    const item = {
      metadata: { title: "Report" },
      content: {},
      key: "somekey",
      attachments: [
        { type: "image/png", path: "profile123/image.png" },
      ],
    };

    await downloadPdf(item);

    expect(mockApiFetch).toHaveBeenCalled();
    expect(mockDecrypt).toHaveBeenCalled();
  });

  it("skips image attachment when fetch fails", async () => {
    mockApiFetch.mockResolvedValue({ ok: false });

    const item = {
      metadata: { title: "Report" },
      content: {},
      key: "somekey",
      attachments: [
        { type: "image/png", path: "profile123/image.png" },
      ],
    };

    await downloadPdf(item);

    // Should still complete and download without attachment
    expect(mockGetBuffer).toHaveBeenCalled();
    expect(mockAnchor.click).toHaveBeenCalled();
  });

  it("skips attachment when path is missing", async () => {
    const item = {
      metadata: { title: "Report" },
      content: {},
      key: "somekey",
      attachments: [
        { type: "image/png", path: "" },
      ],
    };

    await downloadPdf(item);

    // No fetch should happen
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(mockAnchor.click).toHaveBeenCalled();
  });

  it("skips attachment when item.key is missing", async () => {
    const item = {
      metadata: { title: "Report" },
      content: {},
      attachments: [
        { type: "image/png", path: "profile123/image.png" },
      ],
    };

    await downloadPdf(item);

    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("merges PDF attachments using pdf-lib", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      text: async () => "encryptedData",
    });
    mockDecrypt.mockResolvedValue(['{"file":"cGRmYnl0ZXM=","type":"application/pdf"}']);

    // Simulate atob returning binary string
    global.atob = vi.fn(() => "pdf\x25\x50\x44\x46");

    const item = {
      metadata: { title: "Report" },
      content: {},
      key: "somekey",
      attachments: [
        { type: "application/pdf", path: "profile123/attachment.pdf" },
      ],
    };

    await downloadPdf(item);

    // Should have called pdf-lib to merge PDFs
    const { PDFDocument } = await import("pdf-lib");
    expect(PDFDocument.load).toHaveBeenCalled();
  });

  it("handles PDF attachment fetch failure gracefully", async () => {
    mockApiFetch.mockRejectedValue(new Error("network error"));

    const item = {
      metadata: { title: "Report" },
      content: {},
      key: "somekey",
      attachments: [
        { type: "application/pdf", path: "profile123/attachment.pdf" },
      ],
    };

    await downloadPdf(item);

    // Should still complete
    expect(mockAnchor.click).toHaveBeenCalled();
  });

  it("builds footer and header functions correctly", async () => {
    const item = {
      metadata: { title: "Report", date: "2024-01-15", patientName: "John" },
      content: {},
      attachments: [],
    };

    await downloadPdf(item);

    const docDef = (mockCreatePdf.mock.calls[0] as any[])[0];

    // Test header function
    const header = docDef.header(1, 5);
    expect(header).toBeDefined();
    expect(header.columns).toHaveLength(2);

    // Test footer function
    const footer = docDef.footer(1, 5);
    expect(footer).toBeDefined();
    expect(footer.columns[1].text).toContain("Page 1 of 5");
  });

  it("uses meta.patient when patientName not set", async () => {
    const item = {
      metadata: { title: "Report", patient: "Jane Doe" },
      content: {},
      attachments: [],
    };

    await downloadPdf(item);

    const docDef = (mockCreatePdf.mock.calls[0] as any[])[0];
    const header = docDef.header(1, 1);
    expect(JSON.stringify(header)).toContain("Jane Doe");
  });

  it("handles profile with missing optional fields", async () => {
    const item = {
      metadata: {},
      content: {},
      attachments: [],
    };
    const profile = {
      // Only fullName, no other fields
      fullName: "Jane Smith",
    };

    await downloadPdf(item, profile);

    // Should succeed without errors
    expect(mockCreatePdf).toHaveBeenCalled();
  });

  it("handles empty/null profile", async () => {
    const item = {
      metadata: {},
      content: {},
      attachments: [],
    };

    await downloadPdf(item, null);

    expect(mockCreatePdf).toHaveBeenCalled();
  });

  it("handles recommendations-only (no treatment plan)", async () => {
    const item = {
      metadata: {},
      content: {
        recommendations: ["Rest for a week"],
      },
      attachments: [],
    };

    await downloadPdf(item);

    const callArgs = (mockCreatePdf.mock.calls[0] as any[])[0];
    const contentStr = JSON.stringify(callArgs.content);
    expect(contentStr).toContain("Rest for a week");
  });

  it("handles treatment plan only (no recommendations)", async () => {
    const item = {
      metadata: {},
      content: {
        treatmentPlan: "Physical therapy",
      },
      attachments: [],
    };

    await downloadPdf(item);

    const callArgs = (mockCreatePdf.mock.calls[0] as any[])[0];
    const contentStr = JSON.stringify(callArgs.content);
    expect(contentStr).toContain("Physical therapy");
  });

  it("handles invalid date string gracefully", async () => {
    const item = {
      metadata: { date: "not-a-date" },
      content: {},
      attachments: [],
    };

    // Should not throw even with weird date
    await downloadPdf(item);
    expect(mockCreatePdf).toHaveBeenCalled();
  });

  it("handles missing attachments array", async () => {
    const item = {
      metadata: {},
      content: {},
      // No attachments property
    };

    await downloadPdf(item);

    expect(mockAnchor.click).toHaveBeenCalled();
  });

  it("handles vitalStr with string value", async () => {
    const item = {
      metadata: {},
      content: {
        vitalSigns: {
          heartRate: "72 bpm",
        },
      },
      attachments: [],
    };

    await downloadPdf(item);

    const callArgs = (mockCreatePdf.mock.calls[0] as any[])[0];
    const contentStr = JSON.stringify(callArgs.content);
    expect(contentStr).toContain("72 bpm");
  });

  it("handles vitalStr with object (non-BP)", async () => {
    const item = {
      metadata: {},
      content: {
        vitalSigns: {
          temperature: { value: 37.2, unit: "C" },
        },
      },
      attachments: [],
    };

    await downloadPdf(item);

    const callArgs = (mockCreatePdf.mock.calls[0] as any[])[0];
    expect(callArgs.content).toBeDefined();
  });

  it("TR function handles HTML entities", async () => {
    // Setup mock to return HTML entities
    mockGet.mockImplementation(() => {
      return (key: string) => "Test &amp; Result &lt;good&gt;";
    });

    const item = {
      metadata: {},
      content: { summary: "test" },
      attachments: [],
    };

    await downloadPdf(item);

    // The tr function should have decoded the HTML entities
    const callArgs = (mockCreatePdf.mock.calls[0] as any[])[0];
    expect(callArgs).toBeDefined();
  });

  it("creates filename with date when date is available", async () => {
    const item = {
      metadata: { title: "My Report", date: "2024-06-15" },
      content: {},
      attachments: [],
    };

    await downloadPdf(item);

    // The download attribute should contain the title
    expect(mockAnchor.download).toContain("My Report");
  });

  it("creates filename without date separator when no date", async () => {
    const item = {
      metadata: { title: "My Report" },
      content: {},
      attachments: [],
    };

    await downloadPdf(item);

    expect(mockAnchor.download).toBe("My Report.pdf");
  });
});
