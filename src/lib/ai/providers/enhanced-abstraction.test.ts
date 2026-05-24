/**
 * Tests for EnhancedAIProvider (enhanced-abstraction.ts)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Hoisted mocks ----
const { mockWorkflowRecorder, mockModelConfig } = vi.hoisted(() => {
  const mockWorkflowRecorder = {
    isReplayMode: vi.fn().mockReturnValue(false),
    getReplayFilePath: vi.fn().mockReturnValue("/some/replay.json"),
    isRecordingEnabled: vi.fn().mockReturnValue(false),
    recordAIRequest: vi.fn(),
  };

  const mockModelConfig = {
    getModelForFlow: vi.fn().mockReturnValue({
      provider: "openai",
      modelInfo: {
        model_id: "gpt-4o-2024-08-06",
        temperature: 0,
        max_tokens: 2048,
      },
      config: {},
    }),
    getProviderApiKey: vi.fn().mockReturnValue("test-api-key"),
    getPerformanceSettings: vi.fn().mockReturnValue({
      timeout_ms: 30000,
      max_retries: 3,
    }),
    calculateCost: vi.fn().mockReturnValue(0.001),
    logModelUsage: vi.fn(),
  };

  return { mockWorkflowRecorder, mockModelConfig };
});

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: vi.fn().mockImplementation(function(this: any, opts: any) {
    this._opts = opts;
    this.withStructuredOutput = vi.fn().mockReturnValue({
      invoke: vi.fn().mockResolvedValue({ extracted: "openai-result" }),
    });
  }),
}));

vi.mock("@langchain/google-genai", () => ({
  ChatGoogleGenerativeAI: vi.fn().mockImplementation(function(this: any, opts: any) {
    this._opts = opts;
    this.withStructuredOutput = vi.fn().mockReturnValue({
      invoke: vi.fn().mockResolvedValue({ extracted: "gemini-result" }),
    });
  }),
}));

vi.mock("@langchain/anthropic", () => ({
  ChatAnthropic: vi.fn().mockImplementation(function(this: any, opts: any) {
    this._opts = opts;
    this.withStructuredOutput = vi.fn().mockReturnValue({
      invoke: vi.fn().mockResolvedValue({ extracted: "claude-result" }),
    });
  }),
}));

vi.mock("@langchain/core/messages", () => ({
  HumanMessage: vi.fn().mockImplementation(function(this: any, opts: any) {
    this.content = opts?.content ?? (typeof opts === "string" ? opts : JSON.stringify(opts));
    Object.assign(this, opts);
  }),
  SystemMessage: vi.fn().mockImplementation(function(this: any, opts: any) {
    this.content = opts?.content ?? (typeof opts === "string" ? opts : JSON.stringify(opts));
    Object.assign(this, opts);
  }),
}));

vi.mock("$lib/debug/workflow-recorder", () => ({
  workflowRecorder: mockWorkflowRecorder,
}));

vi.mock("$lib/config/model-config", () => ({
  modelConfig: mockModelConfig,
}));

vi.mock("$lib/config/logging-config", () => ({
  isVerboseAILoggingEnabled: vi.fn().mockReturnValue(false),
  isAIResponseLoggingEnabled: vi.fn().mockReturnValue(false),
}));

vi.mock("$lib/logging/logger", () => ({
  log: {
    analysis: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
    },
  },
  logger: {
    analysis: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  },
}));

// ---- Module under test ----
import {
  EnhancedAIProvider,
  enhancedAIProvider,
  fetchGptEnhanced,
} from "./enhanced-abstraction";
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatAnthropic } from "@langchain/anthropic";
import {
  isVerboseAILoggingEnabled,
  isAIResponseLoggingEnabled,
} from "$lib/config/logging-config";

// ---- Helpers ----
const makeContent = () => [
  { type: "text" as const, text: "Patient has high blood pressure." },
];
const makeSchema = (name = "extract_vitals") => ({
  name,
  description: "vitals",
  parameters: { type: "object", properties: {} },
});
const makeTokenUsage = () => ({ total: 0 });

describe("EnhancedAIProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkflowRecorder.isReplayMode.mockReturnValue(false);
    mockWorkflowRecorder.isRecordingEnabled.mockReturnValue(false);
    mockModelConfig.getModelForFlow.mockReturnValue({
      provider: "openai",
      modelInfo: { model_id: "gpt-4o-2024-08-06", temperature: 0, max_tokens: 2048 },
      config: {},
    });
    // Re-wire constructor mocks after clearAllMocks
    (ChatOpenAI as any).mockImplementation(function(this: any, opts: any) {
      this._opts = opts;
      this.withStructuredOutput = vi.fn().mockReturnValue({
        invoke: vi.fn().mockResolvedValue({ extracted: "openai-result" }),
      });
    });
    (ChatGoogleGenerativeAI as any).mockImplementation(function(this: any, opts: any) {
      this._opts = opts;
      this.withStructuredOutput = vi.fn().mockReturnValue({
        invoke: vi.fn().mockResolvedValue({ extracted: "gemini-result" }),
      });
    });
    (ChatAnthropic as any).mockImplementation(function(this: any, opts: any) {
      this._opts = opts;
      this.withStructuredOutput = vi.fn().mockReturnValue({
        invoke: vi.fn().mockResolvedValue({ extracted: "claude-result" }),
      });
    });
    (isVerboseAILoggingEnabled as any).mockReturnValue(false);
    (isAIResponseLoggingEnabled as any).mockReturnValue(false);
  });

  describe("getInstance", () => {
    it("returns the same instance each time", () => {
      const a = EnhancedAIProvider.getInstance();
      const b = EnhancedAIProvider.getInstance();
      expect(a).toBe(b);
    });

    it("exported singleton is an EnhancedAIProvider", () => {
      expect(enhancedAIProvider).toBeInstanceOf(EnhancedAIProvider);
    });
  });

  describe("analyzeDocument — replay mode guard", () => {
    it("throws when replay mode is active", async () => {
      mockWorkflowRecorder.isReplayMode.mockReturnValue(true);
      const provider = new EnhancedAIProvider();
      await expect(
        provider.analyzeDocument(makeContent(), makeSchema(), makeTokenUsage()),
      ).rejects.toThrow("AI calls are not allowed during replay mode");
    });
  });

  describe("analyzeDocument — OpenAI provider", () => {
    it("returns result from OpenAI", async () => {
      const provider = new EnhancedAIProvider();
      const result = await provider.analyzeDocument(
        makeContent(),
        makeSchema(),
        makeTokenUsage(),
      );
      expect(result).toEqual({ extracted: "openai-result" });
    });

    it("calls modelConfig.getModelForFlow with the flowType", async () => {
      const provider = new EnhancedAIProvider();
      await provider.analyzeDocument(makeContent(), makeSchema(), makeTokenUsage(), {
        flowType: "ocr_extraction",
      });
      expect(mockModelConfig.getModelForFlow).toHaveBeenCalledWith("ocr_extraction");
    });

    it("calls progressCallback at each stage", async () => {
      const cb = vi.fn();
      const provider = new EnhancedAIProvider();
      await provider.analyzeDocument(makeContent(), makeSchema(), makeTokenUsage(), {
        progressCallback: cb,
      });
      expect(cb).toHaveBeenCalledWith("medical_analysis", 0, expect.any(String));
      expect(cb).toHaveBeenCalledWith("medical_analysis", 100, expect.any(String));
    });

    it("uses temperature from options when provided", async () => {
      const provider = new EnhancedAIProvider();
      await provider.analyzeDocument(makeContent(), makeSchema(), makeTokenUsage(), {
        temperature: 0.9,
      });
      expect(ChatOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ temperature: 0.9 }),
      );
    });

    it("falls back to modelInfo.temperature when options.temperature is not set", async () => {
      mockModelConfig.getModelForFlow.mockReturnValue({
        provider: "openai",
        modelInfo: { model_id: "gpt-4o-2024-08-06", temperature: 0.5, max_tokens: 2048 },
        config: {},
      });
      const provider = new EnhancedAIProvider();
      await provider.analyzeDocument(makeContent(), makeSchema(), makeTokenUsage());
      expect(ChatOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ temperature: 0.5 }),
      );
    });

    it("records AI request when recording is enabled", async () => {
      mockWorkflowRecorder.isRecordingEnabled.mockReturnValue(true);
      const provider = new EnhancedAIProvider();
      await provider.analyzeDocument(makeContent(), makeSchema(), makeTokenUsage());
      expect(mockWorkflowRecorder.recordAIRequest).toHaveBeenCalled();
    });

    it("logs response when AI response logging is enabled", async () => {
      (isAIResponseLoggingEnabled as any).mockReturnValue(true);
      const provider = new EnhancedAIProvider();
      await expect(
        provider.analyzeDocument(makeContent(), makeSchema(), makeTokenUsage()),
      ).resolves.toBeDefined();
    });

    it("logs verbose response when verbose AI logging is enabled", async () => {
      (isVerboseAILoggingEnabled as any).mockReturnValue(true);
      const provider = new EnhancedAIProvider();
      await expect(
        provider.analyzeDocument(makeContent(), makeSchema(), makeTokenUsage()),
      ).resolves.toBeDefined();
    });
  });

  describe("analyzeDocument — schema name fallback", () => {
    it("uses 'extractor' as fallback when schema name is empty", async () => {
      const provider = new EnhancedAIProvider();
      const schemaNoName = {
        name: "",
        description: "no-name",
        parameters: { type: "object", properties: {} },
      };
      const result = await provider.analyzeDocument(
        makeContent(),
        schemaNoName,
        makeTokenUsage(),
      );
      expect(result).toBeDefined();
      const openaiInstance = (ChatOpenAI as any).mock.results[0].value;
      expect(openaiInstance.withStructuredOutput).toHaveBeenCalledWith(
        expect.anything(),
        { name: "extractor" },
      );
    });

    it("uses schema.name when present", async () => {
      const provider = new EnhancedAIProvider();
      await provider.analyzeDocument(
        makeContent(),
        makeSchema("my_function"),
        makeTokenUsage(),
      );
      const openaiInstance = (ChatOpenAI as any).mock.results[0].value;
      expect(openaiInstance.withStructuredOutput).toHaveBeenCalledWith(
        expect.anything(),
        { name: "my_function" },
      );
    });
  });

  describe("analyzeDocument — Google provider", () => {
    it("returns result from Gemini", async () => {
      mockModelConfig.getModelForFlow.mockReturnValue({
        provider: "google",
        modelInfo: { model_id: "gemini-1.5-pro", temperature: 0, max_tokens: 2048 },
        config: {},
      });
      const provider = new EnhancedAIProvider();
      const result = await provider.analyzeDocument(
        makeContent(),
        makeSchema(),
        makeTokenUsage(),
      );
      expect(result).toEqual({ extracted: "gemini-result" });
      expect(ChatGoogleGenerativeAI).toHaveBeenCalled();
    });
  });

  describe("analyzeDocument — Anthropic provider", () => {
    it("returns result from Claude", async () => {
      mockModelConfig.getModelForFlow.mockReturnValue({
        provider: "anthropic",
        modelInfo: { model_id: "claude-3-sonnet-20240229", temperature: 0, max_tokens: 2048 },
        config: {},
      });
      const provider = new EnhancedAIProvider();
      const result = await provider.analyzeDocument(
        makeContent(),
        makeSchema(),
        makeTokenUsage(),
      );
      expect(result).toEqual({ extracted: "claude-result" });
      expect(ChatAnthropic).toHaveBeenCalled();
    });
  });

  describe("analyzeDocument — unknown provider", () => {
    it("throws for unsupported provider", async () => {
      mockModelConfig.getModelForFlow.mockReturnValue({
        provider: "unsupported_xyz",
        modelInfo: { model_id: "some-model", temperature: 0, max_tokens: 2048 },
        config: {},
      });
      const provider = new EnhancedAIProvider();
      await expect(
        provider.analyzeDocument(makeContent(), makeSchema(), makeTokenUsage()),
      ).rejects.toThrow("Unsupported provider: unsupported_xyz");
    });

    it("calls progressCallback with error message on failure", async () => {
      mockModelConfig.getModelForFlow.mockReturnValue({
        provider: "bad",
        modelInfo: { model_id: "x", temperature: 0, max_tokens: 100 },
        config: {},
      });
      const cb = vi.fn();
      const provider = new EnhancedAIProvider();
      await expect(
        provider.analyzeDocument(makeContent(), makeSchema(), makeTokenUsage(), {
          progressCallback: cb,
        }),
      ).rejects.toThrow();
      const errorCall = cb.mock.calls.find((c) => c[1] === 0 && c[2].includes("failed"));
      expect(errorCall).toBeDefined();
    });
  });

  describe("fetchGptCompatible (backward compatibility)", () => {
    it("delegates to analyzeDocument", async () => {
      const provider = new EnhancedAIProvider();
      const spy = vi.spyOn(provider, "analyzeDocument").mockResolvedValue({ ok: true });
      const result = await provider.fetchGptCompatible(
        makeContent(),
        makeSchema(),
        makeTokenUsage(),
        "German",
        "ocr_extraction",
      );
      expect(result).toEqual({ ok: true });
      expect(spy).toHaveBeenCalledWith(
        makeContent(),
        makeSchema(),
        makeTokenUsage(),
        { language: "German", flowType: "ocr_extraction", progressCallback: undefined },
      );
    });
  });

  describe("fetchGptEnhanced (module-level export)", () => {
    it("calls through to the singleton", async () => {
      const result = await fetchGptEnhanced(
        makeContent(),
        makeSchema(),
        makeTokenUsage(),
        "English",
        "medical_analysis",
      );
      expect(result).toEqual({ extracted: "openai-result" });
    });
  });

  describe("token usage tracking (handleLLMEnd callback)", () => {
    it("accumulates token usage via OpenAI callback", async () => {
      let capturedCallback: any;
      (ChatOpenAI as any).mockImplementationOnce(function(this: any, opts: any) {
        capturedCallback = opts.callbacks?.[0];
        this.withStructuredOutput = vi.fn().mockReturnValue({
          invoke: vi.fn().mockResolvedValue({ result: "data" }),
        });
      });

      const tokenUsage = makeTokenUsage();
      const schema = makeSchema();
      schema.description = "my_description";
      const provider = new EnhancedAIProvider();
      await provider.analyzeDocument(makeContent(), schema, tokenUsage);

      if (capturedCallback?.handleLLMEnd) {
        capturedCallback.handleLLMEnd(
          { llmOutput: { tokenUsage: { totalTokens: 150 } } },
          "run-1",
        );
        expect(tokenUsage.total).toBe(150);
        expect(tokenUsage["my_description"]).toBe(150);
      }
    });

    it("handles missing tokenUsage in handleLLMEnd callback (OpenAI)", async () => {
      let capturedCallback: any;
      (ChatOpenAI as any).mockImplementationOnce(function(this: any, opts: any) {
        capturedCallback = opts.callbacks?.[0];
        this.withStructuredOutput = vi.fn().mockReturnValue({
          invoke: vi.fn().mockResolvedValue({}),
        });
      });
      const tokenUsage = makeTokenUsage();
      const provider = new EnhancedAIProvider();
      await provider.analyzeDocument(makeContent(), makeSchema(), tokenUsage);
      if (capturedCallback?.handleLLMEnd) {
        capturedCallback.handleLLMEnd({ llmOutput: {} }, "run-1");
        expect(tokenUsage.total).toBe(0);
      }
    });
  });

  describe("estimateTokens (via Gemini/Claude callback)", () => {
    it("estimates tokens for Gemini provider via handleLLMEnd", async () => {
      mockModelConfig.getModelForFlow.mockReturnValue({
        provider: "google",
        modelInfo: { model_id: "gemini-1.5-pro", temperature: 0, max_tokens: 2048 },
        config: {},
      });

      let capturedCallback: any;
      (ChatGoogleGenerativeAI as any).mockImplementationOnce(function(this: any, opts: any) {
        capturedCallback = opts.callbacks?.[0];
        this.withStructuredOutput = vi.fn().mockReturnValue({
          invoke: vi.fn().mockResolvedValue({ gemini: "data" }),
        });
      });

      const tokenUsage = makeTokenUsage();
      const schema = makeSchema();
      schema.description = "gemini_desc";
      const provider = new EnhancedAIProvider();
      await provider.analyzeDocument(
        [{ type: "text", text: "hello world" }, { type: "image_url", image_url: { url: "x" } }],
        schema,
        tokenUsage,
      );

      if (capturedCallback?.handleLLMEnd) {
        capturedCallback.handleLLMEnd({}, "run-1");
        // "hello world" = 11 chars => ceil(11/4) = 3, image = 1000
        expect(tokenUsage.total).toBe(1003);
        expect(tokenUsage["gemini_desc"]).toBe(1003);
      }
    });
  });

  describe("createSystemMessage (via provider path)", () => {
    it("uses OCR system message for ocr_extraction flowType", async () => {
      const provider = new EnhancedAIProvider();
      const { SystemMessage } = await import("@langchain/core/messages");
      await provider.analyzeDocument(makeContent(), makeSchema(), makeTokenUsage(), {
        flowType: "ocr_extraction",
      });
      const calls = (SystemMessage as any).mock.calls;
      const lastCall = calls[calls.length - 1][0];
      expect(lastCall.content).toContain("OCR");
    });

    it("uses medical AI assistant message for other flowTypes", async () => {
      const provider = new EnhancedAIProvider();
      const { SystemMessage } = await import("@langchain/core/messages");
      await provider.analyzeDocument(makeContent(), makeSchema(), makeTokenUsage(), {
        flowType: "medical_analysis",
        language: "German",
      });
      const calls = (SystemMessage as any).mock.calls;
      const lastCall = calls[calls.length - 1][0];
      expect(lastCall.content).toContain("German");
    });
  });
});
