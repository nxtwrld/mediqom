// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockResizeImage, mockGetCornerstone3D, mockParseDicom } = vi.hoisted(
  () => ({
    mockResizeImage: vi.fn().mockResolvedValue("data:thumbnail"),
    mockGetCornerstone3D: vi.fn(),
    mockParseDicom: vi.fn(),
  }),
);

vi.mock("$app/environment", () => ({ browser: true }));
vi.mock("$lib/images", () => ({ resizeImage: mockResizeImage }));
vi.mock("$lib/files/CONFIG", () => ({ THUMBNAIL_SIZE: 200 }));
vi.mock("$lib/files/cornerstone3d-init", () => ({
  getCornerstone3D: mockGetCornerstone3D,
}));
vi.mock("dicom-parser", () => ({
  default: { parseDicom: mockParseDicom },
}));

// ------------------------------------------------------------------
// Controllable FileReader — reads from a shared mutable object so
// tests can change the buffer without touching the prototype.
// ------------------------------------------------------------------
const fileReaderState = { buffer: new ArrayBuffer(132), shouldError: false };

class MockFileReader {
  result: ArrayBuffer | null = null;
  onload: ((e: any) => void) | null = null;
  onerror: ((e: any) => void) | null = null;

  readAsArrayBuffer(_blob: Blob) {
    if (fileReaderState.shouldError) {
      Promise.resolve().then(() => {
        this.onerror?.(new Error("read error"));
      });
    } else {
      Promise.resolve().then(() => {
        this.result = fileReaderState.buffer;
        this.onload?.({});
      });
    }
  }
}

global.FileReader = MockFileReader as any;

// Import AFTER mocks are installed
import { DicomHandler } from "./dicom-handler";

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function makeFile(name: string, type = "", size = 0): File {
  return new File([new Uint8Array(size)], name, { type });
}

function makeDicomHeaderBuffer(): ArrayBuffer {
  const buf = new ArrayBuffer(132);
  const view = new Uint8Array(buf);
  view[128] = "D".charCodeAt(0);
  view[129] = "I".charCodeAt(0);
  view[130] = "C".charCodeAt(0);
  view[131] = "M".charCodeAt(0);
  return buf;
}

function makeImplicitTagBuffer(): ArrayBuffer {
  const buf = new ArrayBuffer(132);
  const view = new Uint8Array(buf);
  // Uint16LE for 0x0008: low byte 0x08, high byte 0x00
  view[0] = 0x08;
  view[1] = 0x00;
  return buf;
}

describe("DicomHandler", () => {
  let handler: DicomHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    fileReaderState.buffer = new ArrayBuffer(132); // all-zeros default
    fileReaderState.shouldError = false;
    handler = new DicomHandler();
  });

  // ----------------------------------------------------------------
  // detectDicomFile — MIME type
  // ----------------------------------------------------------------
  describe("detectDicomFile — MIME type", () => {
    it("returns true for application/dicom MIME type", async () => {
      const file = makeFile("scan.dcm", "application/dicom");
      expect(await handler.detectDicomFile(file)).toBe(true);
    });
  });

  // ----------------------------------------------------------------
  // detectDicomFile — extension
  // ----------------------------------------------------------------
  describe("detectDicomFile — extension", () => {
    it("returns true for .dcm extension", async () => {
      expect(await handler.detectDicomFile(makeFile("scan.dcm"))).toBe(true);
    });

    it("returns true for .dicom extension", async () => {
      expect(await handler.detectDicomFile(makeFile("scan.dicom"))).toBe(true);
    });

    it("returns true for .dic extension", async () => {
      expect(await handler.detectDicomFile(makeFile("scan.dic"))).toBe(true);
    });

    it("returns true for uppercase .DCM extension", async () => {
      expect(await handler.detectDicomFile(makeFile("scan.DCM"))).toBe(true);
    });
  });

  // ----------------------------------------------------------------
  // detectDicomFile — magic bytes
  // ----------------------------------------------------------------
  describe("detectDicomFile — DICM magic bytes", () => {
    it("returns true when DICM magic bytes found at offset 128", async () => {
      fileReaderState.buffer = makeDicomHeaderBuffer();
      const file = makeFile("unknown.bin");
      expect(await handler.detectDicomFile(file)).toBe(true);
    });

    it("returns true when implicit group tag 0x0008 is at offset 0", async () => {
      fileReaderState.buffer = makeImplicitTagBuffer();
      const file = makeFile("unknown.bin");
      expect(await handler.detectDicomFile(file)).toBe(true);
    });

    it("returns false for a non-DICOM buffer (all zeros)", async () => {
      fileReaderState.buffer = new ArrayBuffer(132); // all zeros
      const file = makeFile("photo.jpg", "image/jpeg");
      expect(await handler.detectDicomFile(file)).toBe(false);
    });
  });

  // ----------------------------------------------------------------
  // detectDicomFile — FileReader error
  // ----------------------------------------------------------------
  describe("detectDicomFile — FileReader error", () => {
    it("returns false when FileReader fires onerror", async () => {
      fileReaderState.shouldError = true;
      const file = makeFile("broken.bin");
      expect(await handler.detectDicomFile(file)).toBe(false);
    });
  });

  // ----------------------------------------------------------------
  // initialize
  // ----------------------------------------------------------------
  describe("initialize", () => {
    it("calls getCornerstone3D on first call and marks isInitialized", async () => {
      const fakeCs3d = { core: {}, dicomImageLoader: {} };
      mockGetCornerstone3D.mockResolvedValueOnce(fakeCs3d);

      await handler.initialize();

      expect(mockGetCornerstone3D).toHaveBeenCalledTimes(1);
      expect((handler as any).isInitialized).toBe(true);
      expect((handler as any).cs3d).toBe(fakeCs3d);
    });

    it("is idempotent — second call skips initialization", async () => {
      const fakeCs3d = { core: {}, dicomImageLoader: {} };
      mockGetCornerstone3D.mockResolvedValue(fakeCs3d);

      await handler.initialize();
      await handler.initialize();

      expect(mockGetCornerstone3D).toHaveBeenCalledTimes(1);
    });

    it("throws when getCornerstone3D rejects", async () => {
      mockGetCornerstone3D.mockRejectedValueOnce(new Error("load failed"));
      await expect(handler.initialize()).rejects.toThrow(
        "DICOM Handler initialization failed: load failed",
      );
    });
  });

  // ----------------------------------------------------------------
  // Private helpers — accessed via (handler as any)
  // ----------------------------------------------------------------
  describe("getStringValue", () => {
    it("returns the value when dataSet.string succeeds", () => {
      const dataSet = { string: vi.fn().mockReturnValue("John Doe") };
      expect((handler as any).getStringValue(dataSet, "x00100010")).toBe(
        "John Doe",
      );
    });

    it("returns undefined when dataSet.string throws", () => {
      const dataSet = {
        string: vi.fn().mockImplementation(() => {
          throw new Error("tag not found");
        }),
      };
      expect(
        (handler as any).getStringValue(dataSet, "x00100010"),
      ).toBeUndefined();
    });
  });

  describe("getNumberValue", () => {
    it("parses intString to number", () => {
      const dataSet = { intString: vi.fn().mockReturnValue("256") };
      expect((handler as any).getNumberValue(dataSet, "x00280010")).toBe(256);
    });

    it("returns undefined when intString returns undefined", () => {
      const dataSet = { intString: vi.fn().mockReturnValue(undefined) };
      expect(
        (handler as any).getNumberValue(dataSet, "x00280010"),
      ).toBeUndefined();
    });

    it("returns undefined when intString throws", () => {
      const dataSet = {
        intString: vi.fn().mockImplementation(() => {
          throw new Error("tag not found");
        }),
      };
      expect(
        (handler as any).getNumberValue(dataSet, "x00280010"),
      ).toBeUndefined();
    });
  });

  describe("parsePixelSpacing", () => {
    it("returns undefined for undefined input", () => {
      expect((handler as any).parsePixelSpacing(undefined)).toBeUndefined();
    });

    it("parses '0.5\\\\0.7' to [0.5, 0.7]", () => {
      expect((handler as any).parsePixelSpacing("0.5\\0.7")).toEqual([
        0.5, 0.7,
      ]);
    });

    it("parses single value '1.25' to [1.25]", () => {
      expect((handler as any).parsePixelSpacing("1.25")).toEqual([1.25]);
    });
  });

  describe("parseNumberArray", () => {
    it("returns undefined for undefined input", () => {
      expect((handler as any).parseNumberArray(undefined)).toBeUndefined();
    });

    it("parses '1.0' to [1.0]", () => {
      expect((handler as any).parseNumberArray("1.0")).toEqual([1.0]);
    });

    it("parses '40\\\\80' to [40, 80]", () => {
      expect((handler as any).parseNumberArray("40\\80")).toEqual([40, 80]);
    });
  });

  describe("readUint16LE", () => {
    it("reads a little-endian uint16 correctly", () => {
      const bytes = new Uint8Array([0x08, 0x00, 0xff, 0x00]);
      expect((handler as any).readUint16LE(bytes, 0)).toBe(0x0008);
      expect((handler as any).readUint16LE(bytes, 2)).toBe(0x00ff);
    });
  });

  // ----------------------------------------------------------------
  // createThumbnails
  // ----------------------------------------------------------------
  describe("createThumbnails", () => {
    it("calls resizeImage for each input and returns thumbnails", async () => {
      mockResizeImage.mockResolvedValue("data:thumbnail");
      const result = await (handler as any).createThumbnails([
        "data:image1",
        "data:image2",
      ]);
      expect(mockResizeImage).toHaveBeenCalledTimes(2);
      expect(result).toEqual(["data:thumbnail", "data:thumbnail"]);
    });

    it("falls back to original image when resizeImage throws", async () => {
      mockResizeImage.mockRejectedValueOnce(new Error("resize failed"));
      const result = await (handler as any).createThumbnails(["data:original"]);
      expect(result).toEqual(["data:original"]);
    });
  });

  // ----------------------------------------------------------------
  // extractMetadata
  // ----------------------------------------------------------------
  describe("extractMetadata", () => {
    it("returns minimal metadata when dataSet methods throw", () => {
      const file = makeFile("scan.dcm", "application/dicom", 1024);
      const badDataSet = {
        string: vi.fn().mockImplementation(() => {
          throw new Error("tag missing");
        }),
        intString: vi.fn().mockImplementation(() => {
          throw new Error("tag missing");
        }),
      };
      const meta = (handler as any).extractMetadata(badDataSet, file);
      expect(meta.fileName).toBe("scan.dcm");
      expect(meta.extractedAt).toBeDefined();
    });

    it("populates known metadata tags when dataSet is cooperative", () => {
      const file = makeFile("scan.dcm", "application/dicom", 512);
      const dataSet = {
        string: vi.fn().mockImplementation((tag: string) => {
          const map: Record<string, string> = {
            x00100010: "John Doe",
            x00100020: "ID-001",
            x00080060: "CT",
          };
          return map[tag];
        }),
        intString: vi.fn().mockImplementation((tag: string) => {
          const map: Record<string, string> = {
            x00280010: "512",
            x00280011: "512",
          };
          return map[tag];
        }),
      };
      const meta = (handler as any).extractMetadata(dataSet, file);
      expect(meta.patientName).toBe("John Doe");
      expect(meta.patientId).toBe("ID-001");
      expect(meta.modality).toBe("CT");
      expect(meta.rows).toBe(512);
    });
  });

  // ----------------------------------------------------------------
  // processDicomFile
  // ----------------------------------------------------------------
  describe("processDicomFile", () => {
    it("calls parseDicom and returns a result with all expected fields", async () => {
      // Pre-initialize
      (handler as any).isInitialized = true;

      const mockDataSet = {
        string: vi.fn().mockReturnValue(undefined),
        intString: vi.fn().mockReturnValue(undefined),
      };
      (handler as any).dicomParser = {
        parseDicom: vi.fn().mockReturnValue(mockDataSet),
      };

      // requestAnimationFrame — resolve immediately
      global.requestAnimationFrame = vi.fn().mockImplementation((cb) => {
        cb(0);
        return 0;
      });

      const mockViewport = {
        setStack: vi.fn().mockResolvedValue(undefined),
      };
      const mockRenderingEngine = {
        enableElement: vi.fn(),
        getViewport: vi.fn().mockReturnValue(mockViewport),
        render: vi.fn(),
        destroy: vi.fn(),
      };

      const MockRenderingEngine = vi
        .fn()
        .mockImplementation(function (this: any) {
          Object.assign(this, mockRenderingEngine);
        });

      // Mock a canvas inside the container div
      const mockCanvas = {
        toDataURL: vi.fn().mockReturnValue("data:image/png;base64,abc"),
      };
      const mockContainer = document.createElement("div");
      // querySelector returns our fake canvas
      vi.spyOn(mockContainer, "querySelector").mockReturnValue(
        mockCanvas as any,
      );

      vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
        if (tag === "div") return mockContainer;
        return document.createElement(tag);
      });

      (handler as any).cs3d = {
        core: {
          RenderingEngine: MockRenderingEngine,
          Enums: { ViewportType: { STACK: "stack" } },
        },
        dicomImageLoader: {
          wadouri: {
            fileManager: {
              add: vi.fn().mockReturnValue("wadouri:imageId"),
            },
          },
        },
      };

      mockResizeImage.mockResolvedValue("data:thumbnail");

      const fileContent = new Uint8Array(200);
      const file = new File([fileContent], "scan.dcm", {
        type: "application/dicom",
      });

      const result = await handler.processDicomFile(file);

      expect((handler as any).dicomParser.parseDicom).toHaveBeenCalled();
      expect(result).toHaveProperty("extractedImages");
      expect(result).toHaveProperty("metadata");
      expect(result).toHaveProperty("originalDicomBuffer");
      expect(result).toHaveProperty("thumbnails");
    });
  });

  // ----------------------------------------------------------------
  // processDicomFile — browser guard
  // ----------------------------------------------------------------
  describe("processDicomFile — initialization failure", () => {
    it("propagates initialize() error when modules fail to load", async () => {
      // initialize() throws outside the try/catch in processDicomFile,
      // so its error message propagates directly (not wrapped)
      mockGetCornerstone3D.mockRejectedValueOnce(new Error("no browser"));
      const fresh = new DicomHandler();
      const file = makeFile("scan.dcm", "application/dicom", 10);
      await expect(fresh.processDicomFile(file)).rejects.toThrow(
        "DICOM Handler initialization failed",
      );
    });
  });
});

// ----------------------------------------------------------------
// Server-side tests (browser=false branch cannot be easily re-mocked
// in the same module, so we test the observable behaviours instead)
// ----------------------------------------------------------------
describe("DicomHandler — edge cases", () => {
  it("detectDicomFile returns false for empty-extension, non-dicom file", async () => {
    fileReaderState.buffer = new ArrayBuffer(132);
    fileReaderState.shouldError = false;
    const handler = new DicomHandler();
    const result = await handler.detectDicomFile(makeFile("photo.txt", "text/plain"));
    expect(result).toBe(false);
  });
});
