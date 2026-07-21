import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("virtual:configs", () => ({
  configs: {
    modelsYaml: null, // Force fallback configuration
  },
}));

vi.mock("$env/dynamic/private", () => ({
  env: {
    OPENAI_API_KEY: "test-openai-key",
    ANTHROPIC_API_KEY: "test-anthropic-key",
    GOOGLE_API_KEY: "test-google-key",
  },
}));

import { ModelConfigManager } from "./model-config";

// Reset both the singleton instance and the module-level config cache between tests
async function resetState() {
  (ModelConfigManager as any).instance = undefined;

  // Reset the module-level cachedConfig by reloading the module
  // We access it via the vi module cache reset
  const mod = await import("./model-config");
  // Clear via internal reference — cachedConfig is module-scoped, not exported.
  // Resetting the singleton is sufficient because getInstance() calls loadConfiguration()
  // fresh when cachedConfig is null. We clear it via a fresh instance after reloadConfiguration().
}

describe("ModelConfigManager", () => {
  beforeEach(async () => {
    // Reset singleton so each test gets a fresh instance
    (ModelConfigManager as any).instance = undefined;
    // Clear the module-level cache by calling reloadConfiguration on whatever instance exists
    // We instantiate a temporary manager just to clear the cache
    const mgr = ModelConfigManager.getInstance();
    mgr.reloadConfiguration();
    // Now reset the singleton again so tests get a truly fresh getInstance()
    (ModelConfigManager as any).instance = undefined;
  });

  describe("getInstance()", () => {
    it("returns a ModelConfigManager instance", () => {
      const inst = ModelConfigManager.getInstance();
      expect(inst).toBeInstanceOf(ModelConfigManager);
    });

    it("returns the same instance on repeated calls", () => {
      const a = ModelConfigManager.getInstance();
      const b = ModelConfigManager.getInstance();
      expect(a).toBe(b);
    });
  });

  describe("getCurrentConfiguration()", () => {
    it("returns a non-null configuration object (fallback kicks in)", () => {
      const mgr = ModelConfigManager.getInstance();
      const config = mgr.getCurrentConfiguration();
      expect(config).not.toBeNull();
      expect(config).toBeDefined();
    });

    it("config has required top-level keys", () => {
      const mgr = ModelConfigManager.getInstance();
      const config = mgr.getCurrentConfiguration();
      expect(config).toHaveProperty("providers");
      expect(config).toHaveProperty("flows");
      expect(config).toHaveProperty("performance");
    });
  });

  describe("getModelForFlow()", () => {
    it("returns an object with provider and modelInfo for 'extraction'", () => {
      const mgr = ModelConfigManager.getInstance();
      const result = mgr.getModelForFlow("extraction");
      expect(result).toHaveProperty("provider");
      expect(result).toHaveProperty("modelInfo");
      expect(typeof result.provider).toBe("string");
    });

    it("modelInfo has model and provider-related fields", () => {
      const mgr = ModelConfigManager.getInstance();
      const { modelInfo } = mgr.getModelForFlow("extraction");
      expect(modelInfo).toHaveProperty("model_id");
      expect(modelInfo).toHaveProperty("max_tokens");
      expect(modelInfo).toHaveProperty("temperature");
    });

    it("throws for an unknown flow type", () => {
      const mgr = ModelConfigManager.getInstance();
      expect(() => mgr.getModelForFlow("unknown_flow" as any)).toThrow();
    });

    it("returns a result for 'medical_analysis' flow", () => {
      const mgr = ModelConfigManager.getInstance();
      const result = mgr.getModelForFlow("medical_analysis");
      expect(result.provider).toBeTruthy();
      expect(result.modelInfo.model_id).toBeTruthy();
    });
  });

  describe("getProviderApiKey()", () => {
    it("returns the mocked API key for 'openai'", () => {
      const mgr = ModelConfigManager.getInstance();
      const key = mgr.getProviderApiKey("openai");
      expect(key).toBe("test-openai-key");
    });

    it("throws for an unknown provider name", () => {
      const mgr = ModelConfigManager.getInstance();
      expect(() => mgr.getProviderApiKey("nonexistent")).toThrow();
    });
  });

  describe("model info accessors via getModelForFlow()", () => {
    it("getModelForFlow returns a model_id string (equivalent of getModelName)", () => {
      const mgr = ModelConfigManager.getInstance();
      const { modelInfo } = mgr.getModelForFlow("extraction");
      expect(typeof modelInfo.model_id).toBe("string");
      expect(modelInfo.model_id.length).toBeGreaterThan(0);
    });

    it("getModelForFlow returns a numeric temperature", () => {
      const mgr = ModelConfigManager.getInstance();
      const { modelInfo } = mgr.getModelForFlow("extraction");
      expect(typeof modelInfo.temperature).toBe("number");
    });

    it("getModelForFlow returns a positive max_tokens number", () => {
      const mgr = ModelConfigManager.getInstance();
      const { modelInfo } = mgr.getModelForFlow("extraction");
      expect(typeof modelInfo.max_tokens).toBe("number");
      expect(modelInfo.max_tokens).toBeGreaterThan(0);
    });
  });

  describe("isProviderAvailable()", () => {
    it("returns true for 'openai' when OPENAI_API_KEY is set", () => {
      const mgr = ModelConfigManager.getInstance();
      expect(mgr.isProviderAvailable("openai")).toBe(true);
    });

    it("returns false for an unknown provider", () => {
      const mgr = ModelConfigManager.getInstance();
      expect(mgr.isProviderAvailable("unknown-provider")).toBe(false);
    });
  });

  describe("getAvailableProviders()", () => {
    it("returns an array", () => {
      const mgr = ModelConfigManager.getInstance();
      const providers = mgr.getAvailableProviders();
      expect(Array.isArray(providers)).toBe(true);
    });

    it("includes 'openai' when OPENAI_API_KEY is set", () => {
      const mgr = ModelConfigManager.getInstance();
      const providers = mgr.getAvailableProviders();
      expect(providers).toContain("openai");
    });
  });

  describe("getPerformanceSettings()", () => {
    it("returns performance config with expected fields", () => {
      const mgr = ModelConfigManager.getInstance();
      const perf = mgr.getPerformanceSettings();
      expect(perf).toHaveProperty("max_retries");
      expect(perf).toHaveProperty("timeout_ms");
      expect(typeof perf.max_retries).toBe("number");
    });
  });

  describe("reloadConfiguration()", () => {
    it("does not throw and reloads successfully", () => {
      const mgr = ModelConfigManager.getInstance();
      expect(() => mgr.reloadConfiguration()).not.toThrow();
    });

    it("config is still accessible after reload", () => {
      const mgr = ModelConfigManager.getInstance();
      mgr.reloadConfiguration();
      const config = mgr.getCurrentConfiguration();
      expect(config).not.toBeNull();
    });
  });
});
