import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import {
  generateRecoveryQR,
  generateRecoveryPDF,
  downloadRecoveryPDF,
  printRecoveryPDF,
} from "./recovery-document";

// Decode a data URL to its raw bytes
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1];
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

// Real PNG bytes from QRCode — generated once and reused as mock fetch response
let pngBytes: Uint8Array;

beforeAll(async () => {
  const dataUrl = await generateRecoveryQR("setup-key");
  pngBytes = dataUrlToBytes(dataUrl);
});

function stubFetchWithPng() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      arrayBuffer: () => Promise.resolve(pngBytes.buffer),
    }),
  );
}

describe("encryption/recovery-document", () => {
  describe("generateRecoveryQR", () => {
    it("returns a PNG data URL", async () => {
      const url = await generateRecoveryQR("AAAA-BBBB-CCCC-DDDD");
      expect(url).toMatch(/^data:image\/png;base64,/);
    });

    it("encodes different keys into different QR images", async () => {
      const url1 = await generateRecoveryQR("KEY-ONE");
      const url2 = await generateRecoveryQR("KEY-TWO");
      expect(url1).not.toBe(url2);
    });

    it("produces a non-empty base64 payload", async () => {
      const url = await generateRecoveryQR("test-recovery-key");
      const base64 = url.split(",")[1];
      expect(base64.length).toBeGreaterThan(100);
    });
  });

  describe("generateRecoveryPDF", () => {
    beforeEach(stubFetchWithPng);
    afterEach(() => vi.unstubAllGlobals());

    it("returns a Uint8Array", async () => {
      const result = await generateRecoveryPDF({
        email: "test@example.com",
        recoveryKey: "AAAA-BBBB-CCCC-DDDD",
      });
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBeGreaterThan(0);
    });

    it("starts with PDF magic bytes (%PDF-)", async () => {
      const result = await generateRecoveryPDF({
        email: "test@example.com",
        recoveryKey: "TEST-KEY",
      });
      const header = String.fromCharCode(...result.slice(0, 5));
      expect(header).toBe("%PDF-");
    });

    it("accepts optional fields without throwing", async () => {
      const result = await generateRecoveryPDF({
        email: "user@mediqom.com",
        recoveryKey: "KEY",
        createdAt: new Date("2025-01-15"),
        appName: "TestApp",
        recoveryUrl: "https://example.com/recover",
      });
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBeGreaterThan(0);
    });

    it("produces different PDFs for different email addresses", async () => {
      const pdf1 = await generateRecoveryPDF({
        email: "alice@example.com",
        recoveryKey: "SAME-KEY",
      });
      const pdf2 = await generateRecoveryPDF({
        email: "bob@example.com",
        recoveryKey: "SAME-KEY",
      });
      expect(pdf1).not.toEqual(pdf2);
    });
  });

  describe("downloadRecoveryPDF", () => {
    let mockLink: { href: string; download: string; click: ReturnType<typeof vi.fn> };

    beforeEach(() => {
      stubFetchWithPng();

      mockLink = { href: "", download: "", click: vi.fn() };

      vi.stubGlobal("URL", {
        createObjectURL: vi.fn().mockReturnValue("blob:mock-object-url"),
        revokeObjectURL: vi.fn(),
      });

      if (typeof (globalThis as any).document === "undefined") {
        (globalThis as any).document = {
          createElement: vi.fn().mockReturnValue(mockLink),
          body: {
            appendChild: vi.fn(),
            removeChild: vi.fn(),
          },
        };
      } else {
        vi.spyOn(document, "createElement").mockReturnValue(mockLink as any);
        vi.spyOn(document.body, "appendChild").mockReturnValue(mockLink as any);
        vi.spyOn(document.body, "removeChild").mockReturnValue(mockLink as any);
      }
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it("creates an object URL and revokes it after download", async () => {
      await downloadRecoveryPDF({
        email: "user@example.com",
        recoveryKey: "test-key",
      });

      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-object-url");
    });

    it("sets the download filename from the email prefix and date", async () => {
      await downloadRecoveryPDF({
        email: "alice@example.com",
        recoveryKey: "test-key",
      });

      expect(mockLink.download).toMatch(/^mediqom-recovery-alice-\d{4}-\d{2}-\d{2}\.pdf$/);
    });

    it("clicks the link to trigger download", async () => {
      await downloadRecoveryPDF({
        email: "user@example.com",
        recoveryKey: "test-key",
      });

      expect(mockLink.click).toHaveBeenCalledTimes(1);
    });
  });

  describe("printRecoveryPDF", () => {
    let mockPrintWindow: { addEventListener: ReturnType<typeof vi.fn>; print: ReturnType<typeof vi.fn> };

    beforeEach(() => {
      stubFetchWithPng();

      mockPrintWindow = {
        addEventListener: vi.fn().mockImplementation((event, handler) => {
          if (event === "load") handler();
        }),
        print: vi.fn(),
      };

      vi.stubGlobal("URL", {
        createObjectURL: vi.fn().mockReturnValue("blob:mock-print-url"),
        revokeObjectURL: vi.fn(),
      });

      if (typeof (globalThis as any).window === "undefined") {
        (globalThis as any).window = { open: vi.fn().mockReturnValue(mockPrintWindow) };
      } else {
        (globalThis as any).window.open = vi.fn().mockReturnValue(mockPrintWindow);
      }
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("opens a new window with the PDF blob URL", async () => {
      await printRecoveryPDF({
        email: "user@example.com",
        recoveryKey: "test-key",
      });

      expect(window.open).toHaveBeenCalledWith("blob:mock-print-url", "_blank");
    });

    it("calls print() on load", async () => {
      await printRecoveryPDF({
        email: "user@example.com",
        recoveryKey: "test-key",
      });

      expect(mockPrintWindow.print).toHaveBeenCalledTimes(1);
    });
  });
});
