import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGenerateContent } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn(),
}));

vi.mock("$env/static/private", () => ({ GOOGLE_API_KEY: "test-google-api-key" }));

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(function () {
    return {
      getGenerativeModel: vi.fn().mockReturnValue({
        generateContent: mockGenerateContent,
      }),
    };
  }),
}));

import { extractText } from "./gemini";

describe("import.server/gemini", () => {
  beforeEach(() => {
    mockGenerateContent.mockReset();
  });

  describe("extractText", () => {
    it("returns the text from the model response", async () => {
      mockGenerateContent.mockResolvedValue({
        response: { text: () => "Extracted markdown text" },
      });

      const result = await extractText("data:image/png;base64,ABC123");
      expect(result).toBe("Extracted markdown text");
    });

    it("passes the correct prompt and inline image to generateContent", async () => {
      mockGenerateContent.mockResolvedValue({
        response: { text: () => "" },
      });

      const data = "data:image/jpeg;base64,/9j/4AAQ==";
      await extractText(data);

      expect(mockGenerateContent).toHaveBeenCalledWith([
        "Extract text from image in a markdown format",
        {
          inlineData: {
            data: "data:image/jpeg;base64,/9j/4AAQ==",
            mimeType: "image/jpeg",
          },
        },
      ]);
    });

    it("extracts mimeType correctly from various data URL formats", async () => {
      mockGenerateContent.mockResolvedValue({
        response: { text: () => "pdf text" },
      });

      await extractText("data:application/pdf;base64,JVBERi0x");

      const callArg = mockGenerateContent.mock.calls[0][0];
      expect(callArg[1].inlineData.mimeType).toBe("application/pdf");
    });

    it("handles PNG data URL", async () => {
      mockGenerateContent.mockResolvedValue({
        response: { text: () => "png text" },
      });

      await extractText("data:image/png;base64,iVBORw0KGgo=");

      const callArg = mockGenerateContent.mock.calls[0][0];
      expect(callArg[1].inlineData.mimeType).toBe("image/png");
    });

    it("returns empty string when model returns empty text", async () => {
      mockGenerateContent.mockResolvedValue({
        response: { text: () => "" },
      });

      const result = await extractText("data:image/png;base64,ABC");
      expect(result).toBe("");
    });

    it("propagates errors from generateContent", async () => {
      mockGenerateContent.mockRejectedValue(new Error("API quota exceeded"));

      await expect(extractText("data:image/png;base64,ABC")).rejects.toThrow(
        "API quota exceeded",
      );
    });
  });
});
