import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockGetModelForFlow,
  mockGetProviderApiKey,
  mockIsProviderAvailable,
  mockCalculateCost,
  mockLogModelUsage,
  mockGetPerformanceSettings,
  mockInvoke,
  mockWithStructuredOutput,
} = vi.hoisted(() => ({
  mockGetModelForFlow: vi.fn(),
  mockGetProviderApiKey: vi.fn().mockReturnValue("sk-test"),
  mockIsProviderAvailable: vi.fn().mockReturnValue(true),
  mockCalculateCost: vi.fn().mockReturnValue(0.001),
  mockLogModelUsage: vi.fn(),
  mockGetPerformanceSettings: vi
    .fn()
    .mockReturnValue({ timeout_ms: 30000, max_retries: 3 }),
  mockInvoke: vi.fn().mockResolvedValue({ diagnoses: [] }),
  mockWithStructuredOutput: vi.fn(),
}));

vi.mock("$lib/config/model-config", () => ({
  modelConfig: {
    getModelForFlow: mockGetModelForFlow,
    getProviderApiKey: mockGetProviderApiKey,
    isProviderAvailable: mockIsProviderAvailable,
    calculateCost: mockCalculateCost,
    logModelUsage: mockLogModelUsage,
    getPerformanceSettings: mockGetPerformanceSettings,
  },
}));

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: vi.fn().mockImplementation(function (this: any, _opts: any) {
    this.withStructuredOutput = mockWithStructuredOutput;
  }),
}));

vi.mock("@langchain/core/messages", () => ({
  HumanMessage: vi.fn().mockImplementation(function (this: any, _opts: any) {}),
  SystemMessage: vi.fn().mockImplementation(function (this: any, _opts: any) {}),
}));

import { OpenAIProvider, openaiProvider, fetchGpt } from "./openai-provider";
import type { Content, TokenUsage } from "$lib/ai/types.d";
import type { FunctionDefinition } from "@langchain/core/language_models/base";

const makeSchema = (name = "test_schema"): FunctionDefinition => ({
  name,
  description: name,
  parameters: { type: "object", properties: {} },
});

const makeContent = (): Content[] => [{ type: "text", text: "patient notes" }];
const makeTokenUsage = (): TokenUsage => ({ total: 0 });

function defaultModelReturn() {
  return {
    provider: "openai",
    modelInfo: { model_id: "gpt-4o-mini", temperature: 0, max_tokens: 4096 },
    config: {},
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (OpenAIProvider as any).instance = undefined;
  mockWithStructuredOutput.mockReturnValue({ invoke: mockInvoke });
  mockGetModelForFlow.mockReturnValue(defaultModelReturn());
  mockGetProviderApiKey.mockReturnValue("sk-test");
  mockIsProviderAvailable.mockReturnValue(true);
  mockCalculateCost.mockReturnValue(0.001);
  mockGetPerformanceSettings.mockReturnValue({ timeout_ms: 30000, max_retries: 3 });
  mockInvoke.mockResolvedValue({ diagnoses: [] });
});

describe("OpenAIProvider.getInstance()", () => {
  it("returns the same instance on repeated calls (singleton)", () => {
    const a = OpenAIProvider.getInstance();
    const b = OpenAIProvider.getInstance();
    expect(a).toBe(b);
  });

  it("returns an OpenAIProvider instance", () => {
    expect(OpenAIProvider.getInstance()).toBeInstanceOf(OpenAIProvider);
  });
});

describe("analyzeDocument", () => {
  it("calls modelConfig.getModelForFlow with the flow type", async () => {
    const provider = OpenAIProvider.getInstance();
    await provider.analyzeDocument(makeContent(), makeSchema(), makeTokenUsage(), {
      flowType: "extraction",
    });
    expect(mockGetModelForFlow).toHaveBeenCalledWith("extraction");
  });

  it("uses default flow type 'medical_analysis' when no flowType given", async () => {
    const provider = OpenAIProvider.getInstance();
    await provider.analyzeDocument(makeContent(), makeSchema(), makeTokenUsage());
    expect(mockGetModelForFlow).toHaveBeenCalledWith("medical_analysis");
  });

  it("creates ChatOpenAI with the model id and api key from config", async () => {
    const { ChatOpenAI } = await import("@langchain/openai");
    const provider = OpenAIProvider.getInstance();
    await provider.analyzeDocument(makeContent(), makeSchema(), makeTokenUsage());
    expect(ChatOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-4o-mini", apiKey: "sk-test" }),
    );
  });

  it("calls structuredModel.invoke with messages", async () => {
    const provider = OpenAIProvider.getInstance();
    await provider.analyzeDocument(makeContent(), makeSchema(), makeTokenUsage());
    expect(mockInvoke).toHaveBeenCalledWith(
      expect.arrayContaining([expect.anything(), expect.anything()]),
    );
  });

  it("returns the result from invoke", async () => {
    mockInvoke.mockResolvedValue({ diagnoses: ["flu"] });
    const provider = OpenAIProvider.getInstance();
    const result = await provider.analyzeDocument(
      makeContent(),
      makeSchema(),
      makeTokenUsage(),
    );
    expect(result).toEqual({ diagnoses: ["flu"] });
  });

  it("throws when the provider returned by getModelForFlow is not openai", async () => {
    mockGetModelForFlow.mockReturnValue({
      provider: "anthropic",
      modelInfo: { model_id: "claude-3", temperature: 0, max_tokens: 4096 },
      config: {},
    });
    const provider = OpenAIProvider.getInstance();
    await expect(
      provider.analyzeDocument(makeContent(), makeSchema(), makeTokenUsage()),
    ).rejects.toThrow(/anthropic.*only OpenAI/i);
  });

  it("calls calculateCost after successful analysis", async () => {
    const provider = OpenAIProvider.getInstance();
    await provider.analyzeDocument(makeContent(), makeSchema(), makeTokenUsage());
    expect(mockCalculateCost).toHaveBeenCalledWith(
      "openai",
      expect.any(String),
      expect.any(Number),
    );
  });

  it("calls logModelUsage after successful analysis", async () => {
    const provider = OpenAIProvider.getInstance();
    await provider.analyzeDocument(makeContent(), makeSchema(), makeTokenUsage());
    expect(mockLogModelUsage).toHaveBeenCalled();
  });

  it("propagates error when invoke rejects", async () => {
    mockInvoke.mockRejectedValue(new Error("network error"));
    const provider = OpenAIProvider.getInstance();
    await expect(
      provider.analyzeDocument(makeContent(), makeSchema(), makeTokenUsage()),
    ).rejects.toThrow("network error");
  });
});

describe("isAvailable()", () => {
  it("returns true when modelConfig.isProviderAvailable returns true", () => {
    mockIsProviderAvailable.mockReturnValue(true);
    const provider = OpenAIProvider.getInstance();
    expect(provider.isAvailable()).toBe(true);
    expect(mockIsProviderAvailable).toHaveBeenCalledWith("openai");
  });

  it("returns false when modelConfig.isProviderAvailable returns false", () => {
    mockIsProviderAvailable.mockReturnValue(false);
    const provider = OpenAIProvider.getInstance();
    expect(provider.isAvailable()).toBe(false);
  });
});

describe("getAvailableModels()", () => {
  it("returns an array containing the model id from getModelForFlow", () => {
    const provider = OpenAIProvider.getInstance();
    const models = provider.getAvailableModels();
    expect(models).toEqual(["gpt-4o-mini"]);
  });

  it("returns empty array when getModelForFlow throws", () => {
    mockGetModelForFlow.mockImplementation(() => {
      throw new Error("no config");
    });
    const provider = OpenAIProvider.getInstance();
    expect(provider.getAvailableModels()).toEqual([]);
  });
});

describe("fetchGptCompatible()", () => {
  it("delegates to analyzeDocument and returns result", async () => {
    mockInvoke.mockResolvedValue({ result: "ok" });
    const provider = OpenAIProvider.getInstance();
    const result = await provider.fetchGptCompatible(
      makeContent(),
      makeSchema(),
      makeTokenUsage(),
      "Czech",
      "extraction",
    );
    expect(result).toEqual({ result: "ok" });
    expect(mockGetModelForFlow).toHaveBeenCalledWith("extraction");
  });

  it("uses default language English and flow medical_analysis when not provided", async () => {
    const provider = OpenAIProvider.getInstance();
    await provider.fetchGptCompatible(makeContent(), makeSchema(), makeTokenUsage());
    expect(mockGetModelForFlow).toHaveBeenCalledWith("medical_analysis");
  });
});

describe("fetchGpt() module-level function", () => {
  it("works as a wrapper around openaiProvider.fetchGptCompatible", async () => {
    mockInvoke.mockResolvedValue({ wrapped: true });
    // Reset singleton so openaiProvider picks up fresh mocks
    (OpenAIProvider as any).instance = undefined;
    const result = await fetchGpt(
      makeContent(),
      makeSchema(),
      makeTokenUsage(),
      "English",
      "medical_analysis",
    );
    expect(result).toEqual({ wrapped: true });
  });
});

describe("openaiProvider singleton export", () => {
  it("is an instance of OpenAIProvider", () => {
    // openaiProvider was created at module load time; reset won't affect it
    expect(openaiProvider).toBeInstanceOf(OpenAIProvider);
  });
});
