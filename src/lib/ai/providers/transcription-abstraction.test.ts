import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist mock variables so they can be used in vi.mock() factories
const { mockOpenAICreate, mockConfigs } = vi.hoisted(() => ({
  mockOpenAICreate: vi.fn().mockResolvedValue({
    text: "Transcribed medical text",
    segments: [],
    language: "en",
    duration: 5.0,
  }),
  mockConfigs: { transcription: null as any },
}));

vi.mock("virtual:configs", () => ({
  get configs() {
    return mockConfigs;
  },
}));

vi.mock("$env/static/private", () => ({
  OPENAI_API_KEY: "test-key",
  AZURE_SPEECH_KEY: "",
  GOOGLE_API_KEY: "",
}));

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(function (this: any) {
    this.audio = {
      transcriptions: { create: mockOpenAICreate },
    };
  }),
}));

import { TranscriptionProviderAbstraction } from "./transcription-abstraction";

// Reset the singleton between tests so each test gets a clean state
function resetSingleton() {
  // Access private static field via type cast
  (TranscriptionProviderAbstraction as any).instance = undefined;
}

describe("TranscriptionProviderAbstraction", () => {
  beforeEach(() => {
    resetSingleton();
    mockOpenAICreate.mockClear();
  });

  describe("getInstance()", () => {
    it("returns an instance of TranscriptionProviderAbstraction", () => {
      const inst = TranscriptionProviderAbstraction.getInstance();
      expect(inst).toBeInstanceOf(TranscriptionProviderAbstraction);
    });

    it("returns the same instance on repeated calls", () => {
      const a = TranscriptionProviderAbstraction.getInstance();
      const b = TranscriptionProviderAbstraction.getInstance();
      expect(a).toBe(b);
    });
  });

  describe("initialize()", () => {
    it("can be called without error using fallback config when virtual:configs returns null", async () => {
      const inst = TranscriptionProviderAbstraction.getInstance();
      await expect(inst.initialize()).resolves.toBeUndefined();
    });

    it("does not throw when API keys are missing (empty strings)", async () => {
      // AZURE_SPEECH_KEY and GOOGLE_API_KEY are mocked as empty strings
      const inst = TranscriptionProviderAbstraction.getInstance();
      await expect(inst.initialize()).resolves.not.toThrow();
    });
  });

  describe("getConfig()", () => {
    it("returns null before initialization", () => {
      const inst = TranscriptionProviderAbstraction.getInstance();
      expect(inst.getConfig()).toBeNull();
    });

    it("returns non-null config after initialization", async () => {
      const inst = TranscriptionProviderAbstraction.getInstance();
      await inst.initialize();
      expect(inst.getConfig()).not.toBeNull();
    });
  });

  describe("isProviderAvailable()", () => {
    it("returns false before initialization", () => {
      const inst = TranscriptionProviderAbstraction.getInstance();
      expect(inst.isProviderAvailable("openai")).toBe(false);
    });

    it("returns true for 'openai' after initialization with OPENAI_API_KEY", async () => {
      const inst = TranscriptionProviderAbstraction.getInstance();
      await inst.initialize();
      expect(inst.isProviderAvailable("openai")).toBe(true);
    });

    it("returns false for unknown provider after initialization", async () => {
      const inst = TranscriptionProviderAbstraction.getInstance();
      await inst.initialize();
      expect(inst.isProviderAvailable("unknown-provider")).toBe(false);
    });
  });

  describe("getAvailableProviders()", () => {
    it("returns an array before initialization (may be empty)", () => {
      const inst = TranscriptionProviderAbstraction.getInstance();
      expect(Array.isArray(inst.getAvailableProviders())).toBe(true);
    });

    it("returns array containing 'openai' after initialization", async () => {
      const inst = TranscriptionProviderAbstraction.getInstance();
      await inst.initialize();
      expect(inst.getAvailableProviders()).toContain("openai");
    });
  });

  describe("transcribeAudio()", () => {
    it("returns TranscriptionResult with text when OpenAI provider is available", async () => {
      const inst = TranscriptionProviderAbstraction.getInstance();
      await inst.initialize();

      const file = new File(["audio-data"], "test.mp3", { type: "audio/mp3" });
      const result = await inst.transcribeAudio(file, { provider: "openai", model: "whisper" });

      expect(result.text).toBe("Transcribed medical text");
    });

    it("returns result with provider and modelUsed fields", async () => {
      const inst = TranscriptionProviderAbstraction.getInstance();
      await inst.initialize();

      const file = new File(["audio-data"], "test.mp3", { type: "audio/mp3" });
      const result = await inst.transcribeAudio(file, { provider: "openai", model: "whisper" });

      expect(result.provider).toBe("openai");
      expect(result.modelUsed).toBe("whisper");
    });

    it("returns result with processingTime field", async () => {
      const inst = TranscriptionProviderAbstraction.getInstance();
      await inst.initialize();

      const file = new File(["audio-data"], "test.mp3", { type: "audio/mp3" });
      const result = await inst.transcribeAudio(file);

      expect(typeof result.processingTime).toBe("number");
      expect(result.processingTime).toBeGreaterThanOrEqual(0);
    });

    it("throws when OpenAI provider is not initialized and fallback is exhausted", async () => {
      // Do NOT call initialize() — providers map is empty
      const inst = TranscriptionProviderAbstraction.getInstance();

      // Manually set config so transcribeAudio doesn't auto-initialize,
      // but leave providers empty by resetting after initialize
      await inst.initialize();
      // Clear providers map via private field access
      (inst as any).providers.clear();

      const file = new File(["audio-data"], "test.mp3", { type: "audio/mp3" });

      // With no providers and fallback enabled but no fallback providers available, should throw
      await expect(inst.transcribeAudio(file, { provider: "openai" })).rejects.toThrow();
    });

    it("calls the OpenAI transcriptions.create API", async () => {
      const inst = TranscriptionProviderAbstraction.getInstance();
      await inst.initialize();

      const file = new File(["audio-data"], "test.mp3", { type: "audio/mp3" });
      await inst.transcribeAudio(file, { provider: "openai", model: "whisper" });

      expect(mockOpenAICreate).toHaveBeenCalledOnce();
    });
  });

  describe("transcribeAudioCompatible()", () => {
    it("calls transcribeAudio internally and returns an object with text", async () => {
      const inst = TranscriptionProviderAbstraction.getInstance();
      await inst.initialize();

      const file = new File(["audio-data"], "test.mp3", { type: "audio/mp3" });
      const result = await inst.transcribeAudioCompatible(file, { lang: "en" });

      expect(result).toHaveProperty("text");
      expect(typeof result.text).toBe("string");
    });

    it("uses default language 'en' when no instructions provided", async () => {
      const inst = TranscriptionProviderAbstraction.getInstance();
      await inst.initialize();

      const file = new File(["audio-data"], "test.mp3", { type: "audio/mp3" });
      const result = await inst.transcribeAudioCompatible(file);

      expect(result).toHaveProperty("text");
    });

    it("strips prompt hallucination from text when prompt matches prefix", async () => {
      const prompt = "This is a medical consultation recording.";
      mockOpenAICreate.mockResolvedValueOnce({
        text: `${prompt} Patient says headache.`,
        segments: [],
        language: "en",
        duration: 3.0,
      });

      const inst = TranscriptionProviderAbstraction.getInstance();
      await inst.initialize();

      const file = new File(["audio-data"], "test.mp3", { type: "audio/mp3" });
      const result = await inst.transcribeAudioCompatible(file, { lang: "en", prompt });

      // The prompt prefix should be stripped
      expect(result.text.startsWith(prompt)).toBe(false);
    });

    it("strips hallucinated prompt in backup check (transcribeAudioCompatible level)", async () => {
      // The inner executeOpenAI stripHallucinatedPrompt won't fire because we use a custom prompt
      // but we set a prompt that is different from the config prompt, so the inner check won't match.
      // The backup check in transcribeAudioCompatible fires when result.text still starts with the prompt.
      const customPrompt = "Custom medical prompt.";
      // Return text that starts with the prompt (simulating hallucination not caught by inner check)
      mockOpenAICreate.mockResolvedValueOnce({
        text: `${customPrompt} Doctor says hello.`,
        segments: [],
        language: "en",
        duration: 2.0,
      });

      const inst = TranscriptionProviderAbstraction.getInstance();
      await inst.initialize();

      const file = new File(["audio-data"], "test.mp3", { type: "audio/mp3" });
      const result = await inst.transcribeAudioCompatible(file, {
        lang: "en",
        prompt: customPrompt,
      });

      expect(result.text).toBe("Doctor says hello.");
    });
  });

  describe("initialize() — error catch path", () => {
    it("falls back to default config when initializeProviders throws", async () => {
      const inst = TranscriptionProviderAbstraction.getInstance();

      // Patch initializeProviders to throw on first call, succeed on second
      let callCount = 0;
      const origInitProviders = (inst as any).initializeProviders.bind(inst);
      (inst as any).initializeProviders = async function () {
        callCount++;
        if (callCount === 1) throw new Error("Init failed");
        return origInitProviders();
      };

      await inst.initialize();

      // Should have recovered via catch → getDefaultConfig → initializeProviders
      expect(inst.getConfig()).not.toBeNull();
      expect(callCount).toBe(2);
    });
  });

  describe("initialize() — with real transcription config", () => {
    it("loads config from virtual:configs when configs.transcription is non-null", async () => {
      // Temporarily set a real transcription config object
      mockConfigs.transcription = {
        providers: {
          openai: { enabled: true, apiKeyEnv: "OPENAI_API_KEY", models: { whisper: { name: "whisper-1", description: "", supportedFormats: [], maxFileSize: "25MB", languages: [], responseFormats: [], temperature: 0 } } },
        },
        defaultProvider: "openai",
        defaultModel: "whisper",
        transcriptionSettings: {
          defaultLanguage: "en",
          responseFormat: "text",
          includeTimestamps: false,
          medicalContext: { enabled: false, prompt: "", translatePrompt: "", medicalTermsBoost: false, speakerIdentification: false },
        },
        performance: { maxRetries: 3, timeoutMs: 30000, batchProcessing: { enabled: false, maxBatchSize: 10, batchTimeoutMs: 60000 } },
        fallback: { enableFallback: true, fallbackProviders: ["openai"], fallbackOnError: true, fallbackOnTimeout: true },
        quality: { confidenceThreshold: 0.7, enableQualityFiltering: false, profanityFilter: false, medicalTermsValidation: false },
        monitoring: { logTranscriptions: false, trackTokenUsage: false, performanceMetrics: false, errorTracking: false },
      };

      const inst = TranscriptionProviderAbstraction.getInstance();
      await inst.initialize();

      const config = inst.getConfig();
      expect(config).not.toBeNull();
      expect(config!.defaultProvider).toBe("openai");

      // Restore
      mockConfigs.transcription = null;
    });
  });

  describe("executeTranscription() — provider routing", () => {
    // Helper to disable fallback so errors propagate cleanly
    function disableFallback(inst: TranscriptionProviderAbstraction) {
      (inst as any).config.fallback.enableFallback = false;
    }

    it("throws 'Azure Speech Services not yet implemented' when provider is 'azure'", async () => {
      const inst = TranscriptionProviderAbstraction.getInstance();
      await inst.initialize();
      disableFallback(inst);

      const file = new File(["audio-data"], "test.mp3", { type: "audio/mp3" });
      await expect(
        inst.transcribeAudio(file, { provider: "azure", model: "whisper" }),
      ).rejects.toThrow("Azure Speech Services not yet implemented");
    });

    it("throws 'Google Cloud Speech-to-Text not yet implemented' when provider is 'google'", async () => {
      const inst = TranscriptionProviderAbstraction.getInstance();
      await inst.initialize();
      disableFallback(inst);

      const file = new File(["audio-data"], "test.mp3", { type: "audio/mp3" });
      await expect(
        inst.transcribeAudio(file, { provider: "google", model: "whisper" }),
      ).rejects.toThrow("Google Cloud Speech-to-Text not yet implemented");
    });

    it("throws 'Unsupported transcription provider' for unknown provider", async () => {
      const inst = TranscriptionProviderAbstraction.getInstance();
      await inst.initialize();
      disableFallback(inst);

      const file = new File(["audio-data"], "test.mp3", { type: "audio/mp3" });
      await expect(
        inst.transcribeAudio(file, { provider: "unknown-xyz", model: "whisper" }),
      ).rejects.toThrow("Unsupported transcription provider: unknown-xyz");
    });
  });

  describe("executeOpenAITranscription() — various options", () => {
    function disableFallback(inst: TranscriptionProviderAbstraction) {
      (inst as any).config.fallback.enableFallback = false;
    }

    it("throws 'Model X not found in OpenAI provider config' for unknown model", async () => {
      const inst = TranscriptionProviderAbstraction.getInstance();
      await inst.initialize();
      disableFallback(inst);

      const file = new File(["audio-data"], "test.mp3", { type: "audio/mp3" });
      await expect(
        inst.transcribeAudio(file, { provider: "openai", model: "nonexistent-model" }),
      ).rejects.toThrow("not found in OpenAI provider config");
    });

    it("uses translate prompt when options.translate is true and no custom prompt", async () => {
      const inst = TranscriptionProviderAbstraction.getInstance();
      await inst.initialize();

      const file = new File(["audio-data"], "test.mp3", { type: "audio/mp3" });
      await inst.transcribeAudio(file, {
        provider: "openai",
        model: "whisper",
        translate: true,
      });

      // The OpenAI API should have been called with a translate prompt
      expect(mockOpenAICreate).toHaveBeenCalled();
      const callArg = mockOpenAICreate.mock.calls[mockOpenAICreate.mock.calls.length - 1][0];
      expect(callArg.prompt).toContain("translate");
    });

    it("includes timestamp_granularities when includeTimestamps is true and model supports it", async () => {
      // Set up a model config with timestampGranularities support
      const inst = TranscriptionProviderAbstraction.getInstance();
      await inst.initialize();

      // Patch the model config to have timestampGranularities
      const openaiProvider = (inst as any).providers.get("openai");
      openaiProvider.config.models["whisper"].timestampGranularities = ["segment"];

      const file = new File(["audio-data"], "test.mp3", { type: "audio/mp3" });
      await inst.transcribeAudio(file, {
        provider: "openai",
        model: "whisper",
        includeTimestamps: true,
      });

      const callArg = mockOpenAICreate.mock.calls[mockOpenAICreate.mock.calls.length - 1][0];
      expect(callArg.timestamp_granularities).toEqual(["segment"]);
    });

    it("sets response_format to verbose_json when includeTimestamps and responseFormat is verbose_json", async () => {
      const inst = TranscriptionProviderAbstraction.getInstance();
      await inst.initialize();

      const openaiProvider = (inst as any).providers.get("openai");
      openaiProvider.config.models["whisper"].timestampGranularities = ["segment"];

      const file = new File(["audio-data"], "test.mp3", { type: "audio/mp3" });
      await inst.transcribeAudio(file, {
        provider: "openai",
        model: "whisper",
        includeTimestamps: true,
        responseFormat: "verbose_json",
      });

      const callArg = mockOpenAICreate.mock.calls[mockOpenAICreate.mock.calls.length - 1][0];
      expect(callArg.response_format).toBe("verbose_json");
    });

    it("adds include logprobs and sets response_format to json when includeLogprobs is true", async () => {
      const inst = TranscriptionProviderAbstraction.getInstance();
      await inst.initialize();

      const file = new File(["audio-data"], "test.mp3", { type: "audio/mp3" });
      await inst.transcribeAudio(file, {
        provider: "openai",
        model: "whisper",
        includeLogprobs: true,
      });

      const callArg = mockOpenAICreate.mock.calls[mockOpenAICreate.mock.calls.length - 1][0];
      expect(callArg.include).toEqual(["logprobs"]);
      expect(callArg.response_format).toBe("json");
    });

    it("returns text result when OpenAI returns a plain string", async () => {
      mockOpenAICreate.mockResolvedValueOnce("Plain string transcription");

      const inst = TranscriptionProviderAbstraction.getInstance();
      await inst.initialize();

      const file = new File(["audio-data"], "test.mp3", { type: "audio/mp3" });
      const result = await inst.transcribeAudio(file, { provider: "openai", model: "whisper" });

      expect(result.text).toBe("Plain string transcription");
      expect(result.confidence).toBe(0.8);
    });

    it("strips hallucinated prompt from plain string response", async () => {
      // Use a custom prompt that won't match the default medical context prompt
      // Force inner strip by using a custom prompt and returning text prefixed with that prompt
      const customPrompt = "CUSTOM_PROMPT";

      // Override the config's medicalContext to use our custom prompt for testing
      const inst = TranscriptionProviderAbstraction.getInstance();
      await inst.initialize();
      const config = (inst as any).config;
      const origPrompt = config.transcriptionSettings.medicalContext.prompt;
      config.transcriptionSettings.medicalContext.prompt = customPrompt;

      mockOpenAICreate.mockResolvedValueOnce(`${customPrompt} actual text`);

      const file = new File(["audio-data"], "test.mp3", { type: "audio/mp3" });
      // Don't pass a prompt so medicalContext prompt gets used
      const result = await inst.transcribeAudio(file, { provider: "openai", model: "whisper" });

      expect(result.text).toBe("actual text");

      // Restore
      config.transcriptionSettings.medicalContext.prompt = origPrompt;
    });

    it("throws 'Unexpected transcription response format' when result is object without text", async () => {
      mockOpenAICreate.mockResolvedValueOnce({ duration: 5.0 }); // no .text

      const inst = TranscriptionProviderAbstraction.getInstance();
      await inst.initialize();
      disableFallback(inst);

      const file = new File(["audio-data"], "test.mp3", { type: "audio/mp3" });
      await expect(
        inst.transcribeAudio(file, { provider: "openai", model: "whisper" }),
      ).rejects.toThrow("Unexpected transcription response format");
    });

    it("maps segments and words when verbose_json response includes them", async () => {
      mockOpenAICreate.mockResolvedValueOnce({
        text: "Full transcription",
        segments: [
          {
            start: 0.0,
            end: 1.5,
            text: "Hello world",
            words: [
              { word: "Hello", start: 0.0, end: 0.5 },
              { word: "world", start: 0.6, end: 1.5 },
            ],
          },
          {
            start: 1.5,
            end: 3.0,
            text: "No words here",
            words: undefined,
          },
        ],
        language: "en",
        duration: 3.0,
      });

      const inst = TranscriptionProviderAbstraction.getInstance();
      await inst.initialize();
      disableFallback(inst);

      const file = new File(["audio-data"], "test.mp3", { type: "audio/mp3" });
      const result = await inst.transcribeAudio(file, { provider: "openai", model: "whisper" });

      expect(result.segments).toHaveLength(2);
      expect(result.segments![0].words).toHaveLength(2);
      expect(result.segments![0].words![0].word).toBe("Hello");
      expect(result.segments![1].words).toBeUndefined();
    });

    it("handles empty prompt (no hallucination stripping) for string response", async () => {
      // When no custom prompt and medicalContext.enabled is false, prompt remains undefined
      // and stripHallucinatedPrompt returns text unchanged
      mockOpenAICreate.mockResolvedValueOnce("Clean transcription text");

      const inst = TranscriptionProviderAbstraction.getInstance();
      await inst.initialize();
      // Disable medical context so prompt stays undefined
      (inst as any).config.transcriptionSettings.medicalContext.enabled = false;
      disableFallback(inst);

      const file = new File(["audio-data"], "test.mp3", { type: "audio/mp3" });
      const result = await inst.transcribeAudio(file, {
        provider: "openai",
        model: "whisper",
      });

      expect(result.text).toBe("Clean transcription text");
    });
  });

  describe("transcribeAudio() — auto-initialize and fallback", () => {
    it("auto-initializes when config is null before transcription", async () => {
      // Don't call initialize() — transcribeAudio should call it
      const inst = TranscriptionProviderAbstraction.getInstance();
      expect(inst.getConfig()).toBeNull();

      const file = new File(["audio-data"], "test.mp3", { type: "audio/mp3" });
      const result = await inst.transcribeAudio(file, { provider: "openai", model: "whisper" });

      expect(result.text).toBe("Transcribed medical text");
      expect(inst.getConfig()).not.toBeNull();
    });

    it("attempts fallback when primary provider fails and fallback is enabled", async () => {
      const inst = TranscriptionProviderAbstraction.getInstance();
      await inst.initialize();

      // Make primary provider fail
      mockOpenAICreate.mockRejectedValueOnce(new Error("Primary failed"));

      // Set up fallback config to include "openai" as fallback (but from a different call)
      // Since openai is the only provider, fallback will find no other providers and throw
      const file = new File(["audio-data"], "test.mp3", { type: "audio/mp3" });
      await expect(
        inst.transcribeAudio(file, { provider: "openai", model: "whisper" }),
      ).rejects.toThrow();
    });

    it("throws 'All transcription providers failed' when all fallbacks are exhausted", async () => {
      const inst = TranscriptionProviderAbstraction.getInstance();
      await inst.initialize();

      // "openai" is the primary provider that will fail.
      // Setting fallback providers to only "openai" means it gets filtered out
      // (can't fall back to the provider that just failed), so fallback list is empty.
      (inst as any).config.fallback.fallbackProviders = ["openai"];

      mockOpenAICreate.mockRejectedValueOnce(new Error("Primary failed"));

      const file = new File(["audio-data"], "test.mp3", { type: "audio/mp3" });
      await expect(
        inst.transcribeAudio(file, { provider: "openai", model: "whisper" }),
      ).rejects.toThrow("All transcription providers failed");
    });

    it("returns result from fallback provider when primary fails and fallback succeeds", async () => {
      const inst = TranscriptionProviderAbstraction.getInstance();
      await inst.initialize();

      // Use "azure" as the primary (always throws) and "openai" as fallback.
      (inst as any).config.fallback.fallbackProviders = ["openai"];

      mockOpenAICreate.mockResolvedValueOnce({
        text: "Fallback result",
        segments: [],
        language: "en",
        duration: 2.0,
      });

      const file = new File(["audio-data"], "test.mp3", { type: "audio/mp3" });
      // azure will throw → fallback to openai which succeeds
      const result = await inst.transcribeAudio(file, { provider: "azure", model: "whisper" });

      expect(result.text).toBe("Fallback result");
    });

    it("skips a failing fallback and tries the next one (catch+continue path)", async () => {
      const inst = TranscriptionProviderAbstraction.getInstance();
      await inst.initialize();

      // Add "fake-provider" to providers map — it will be tried as first fallback
      const openaiEntry = (inst as any).providers.get("openai");
      (inst as any).providers.set("fake-provider", openaiEntry);
      (inst as any).config.fallback.fallbackProviders = ["fake-provider", "openai"];

      // Patch transcribeAudio to throw when called with fake-provider, succeed for openai
      const origTranscribeAudio = inst.transcribeAudio.bind(inst);
      let patchActive = true;
      inst.transcribeAudio = async function (audioData: File, options: any = {}) {
        if (patchActive && options.provider === "fake-provider") {
          throw new Error("Fake provider failed");
        }
        return origTranscribeAudio(audioData, options);
      };

      mockOpenAICreate.mockResolvedValueOnce({
        text: "Second fallback result",
        segments: [],
        language: "en",
        duration: 1.5,
      });

      const file = new File(["audio-data"], "test.mp3", { type: "audio/mp3" });
      // azure primary fails → fallback to fake-provider → throws → catch+continue
      // → fallback to openai → succeeds
      const result = await origTranscribeAudio(file, { provider: "azure", model: "whisper" });
      patchActive = false;

      expect(result.text).toBe("Second fallback result");
    });
  });
});
