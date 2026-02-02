// AI Model Configuration Loader
// Loads and manages AI model configurations from YAML file

import { env } from "$env/dynamic/private";
import { configs } from "virtual:configs";

export interface ModelInfo {
  model_id: string;
  description: string;
  max_tokens: number;
  temperature: number;
  supports_vision: boolean;
  cost_per_1k_tokens: number;
}

export interface ProviderConfig {
  name: string;
  enabled: boolean;
  api_key_env: string;
  models: Record<string, ModelInfo>;
}

export interface FlowConfig {
  provider: string;
  model: string;
  description: string;
  fallback_models: string[];
}

export interface ModelConfiguration {
  default_providers: string[];
  providers: Record<string, ProviderConfig>;
  flows: Record<string, FlowConfig>;
  performance: {
    max_retries: number;
    timeout_ms: number;
    concurrent_requests: number;
    rate_limit_per_minute: number;
  };
  cost_optimization: {
    enable_cost_optimization: boolean;
    simple_task_model: string;
    complex_task_model: string;
    simple_tasks: string[];
    complex_tasks: string[];
  };
  monitoring: {
    log_model_usage: boolean;
    track_token_costs: boolean;
    performance_metrics: boolean;
    error_tracking: boolean;
  };
}

export type FlowType =
  | "extraction"
  | "ocr_extraction"
  | "medical_analysis"
  | "feature_detection"
  | "signal_processing"
  | "document_type_routing"
  | "quality_validation";

// Global configuration cache
let cachedConfig: ModelConfiguration | null = null;

/**
 * Load configuration from build-time virtual module
 */
function loadConfiguration(): ModelConfiguration {
  if (cachedConfig) {
    return cachedConfig;
  }

  // Use build-time loaded config from virtual module
  if (configs.modelsYaml) {
    cachedConfig = configs.modelsYaml;
    console.log("📋 Model configuration loaded from build");
  } else {
    console.warn("⚠️ Using fallback model configuration");
    cachedConfig = getFallbackConfiguration();
  }

  console.log("🔧 Available providers:", Object.keys(cachedConfig.providers));
  console.log("📊 Configured flows:", Object.keys(cachedConfig.flows));

  return cachedConfig;
}

/**
 * Fallback configuration when YAML file is not available
 */
function getFallbackConfiguration(): ModelConfiguration {
  return {
    default_providers: ["openai"],
    providers: {
      openai: {
        name: "OpenAI",
        enabled: true,
        api_key_env: "OPENAI_API_KEY",
        models: {
          gpt4: {
            model_id: "gpt-4o-2024-08-06",
            description: "GPT-4 Omni - Latest with vision capabilities",
            max_tokens: 4096,
            temperature: 0,
            supports_vision: true,
            cost_per_1k_tokens: 0.03,
          },
        },
      },
    },
    flows: {
      extraction: {
        provider: "openai",
        model: "gpt4",
        description: "Extract text",
        fallback_models: [],
      },
      medical_analysis: {
        provider: "openai",
        model: "gpt4",
        description: "Medical analysis",
        fallback_models: [],
      },
      feature_detection: {
        provider: "openai",
        model: "gpt4",
        description: "Feature detection",
        fallback_models: [],
      },
      signal_processing: {
        provider: "openai",
        model: "gpt4",
        description: "Signal processing",
        fallback_models: [],
      },
      document_type_routing: {
        provider: "openai",
        model: "gpt4",
        description: "Document routing",
        fallback_models: [],
      },
      quality_validation: {
        provider: "openai",
        model: "gpt4",
        description: "Quality validation",
        fallback_models: [],
      },
    },
    performance: {
      max_retries: 3,
      timeout_ms: 30000,
      concurrent_requests: 5,
      rate_limit_per_minute: 100,
    },
    cost_optimization: {
      enable_cost_optimization: false,
      simple_task_model: "gpt4",
      complex_task_model: "gpt4",
      simple_tasks: [],
      complex_tasks: [],
    },
    monitoring: {
      log_model_usage: true,
      track_token_costs: true,
      performance_metrics: true,
      error_tracking: true,
    },
  };
}

export class ModelConfigManager {
  private static instance: ModelConfigManager;

  static getInstance(): ModelConfigManager {
    if (!this.instance) {
      this.instance = new ModelConfigManager();
    }
    return this.instance;
  }

  /**
   * Get model configuration for a specific flow
   */
  getModelForFlow(flowType: FlowType): {
    provider: string;
    modelInfo: ModelInfo;
    config: FlowConfig;
  } {
    const config = loadConfiguration();
    const flowConfig = config.flows[flowType];
    if (!flowConfig) {
      throw new Error(`Flow type '${flowType}' not configured`);
    }

    // Check if cost optimization is enabled
    let selectedModel = flowConfig.model;
    if (config.cost_optimization.enable_cost_optimization) {
      if (config.cost_optimization.simple_tasks.includes(flowType)) {
        selectedModel = config.cost_optimization.simple_task_model;
      } else if (config.cost_optimization.complex_tasks.includes(flowType)) {
        selectedModel = config.cost_optimization.complex_task_model;
      }
    }

    const provider = config.providers[flowConfig.provider];
    if (!provider || !provider.enabled) {
      throw new Error(
        `Provider '${flowConfig.provider}' not available for flow '${flowType}'`,
      );
    }

    const modelInfo = provider.models[selectedModel];
    if (!modelInfo) {
      // Try fallback models
      for (const fallbackModel of flowConfig.fallback_models) {
        const fallbackInfo = provider.models[fallbackModel];
        if (fallbackInfo) {
          console.log(
            `⚠️ Using fallback model '${fallbackModel}' for flow '${flowType}'`,
          );
          return {
            provider: flowConfig.provider,
            modelInfo: fallbackInfo,
            config: flowConfig,
          };
        }
      }
      throw new Error(
        `Model '${selectedModel}' not available for provider '${flowConfig.provider}'`,
      );
    }

    return { provider: flowConfig.provider, modelInfo, config: flowConfig };
  }

  /**
   * Check if a provider is available (has API key)
   */
  isProviderAvailable(providerName: string): boolean {
    const config = loadConfiguration();
    const provider = config.providers[providerName];
    if (!provider || !provider.enabled) {
      return false;
    }

    const apiKey = env[provider.api_key_env];
    return !!apiKey;
  }

  /**
   * Get API key for a provider
   */
  getProviderApiKey(providerName: string): string {
    const config = loadConfiguration();
    const provider = config.providers[providerName];
    if (!provider) {
      throw new Error(`Provider '${providerName}' not configured`);
    }

    const apiKey = env[provider.api_key_env];
    if (!apiKey) {
      throw new Error(
        `API key not found for provider '${providerName}' (env: ${provider.api_key_env})`,
      );
    }

    return apiKey;
  }

  /**
   * Get all available providers
   */
  getAvailableProviders(): string[] {
    const config = loadConfiguration();
    return Object.keys(config.providers).filter((providerName) =>
      this.isProviderAvailable(providerName),
    );
  }

  /**
   * Get performance settings
   */
  getPerformanceSettings() {
    const config = loadConfiguration();
    return config.performance;
  }

  /**
   * Get cost optimization settings
   */
  getCostOptimizationSettings() {
    const config = loadConfiguration();
    return config.cost_optimization;
  }

  /**
   * Get monitoring settings
   */
  getMonitoringSettings() {
    const config = loadConfiguration();
    return config.monitoring;
  }

  /**
   * Log model usage for monitoring
   */
  logModelUsage(
    flowType: FlowType,
    provider: string,
    model: string,
    tokens: number,
    cost: number,
    duration: number,
  ): void {
    const config = loadConfiguration();
    if (config.monitoring.log_model_usage) {
      console.log(
        `📊 Model Usage: ${flowType} | ${provider}:${model} | ${tokens} tokens | $${cost.toFixed(4)} | ${duration}ms`,
      );
    }
  }

  /**
   * Calculate cost for token usage
   */
  calculateCost(provider: string, model: string, tokens: number): number {
    const config = loadConfiguration();
    const providerConfig = config.providers[provider];
    const modelInfo = providerConfig?.models[model];

    if (!modelInfo) {
      return 0;
    }

    return (tokens / 1000) * modelInfo.cost_per_1k_tokens;
  }

  /**
   * Reload configuration from YAML file (useful for development)
   */
  reloadConfiguration(): void {
    cachedConfig = null; // Clear cache
    const config = loadConfiguration(); // Force reload
    console.log("🔄 Model configuration reloaded from YAML file");
    console.log("🔧 Available providers:", Object.keys(config.providers));
    console.log("📊 Configured flows:", Object.keys(config.flows));
  }

  /**
   * Get the current configuration object (for debugging)
   */
  getCurrentConfiguration(): ModelConfiguration {
    return loadConfiguration();
  }
}

// Export singleton instance
export const modelConfig = ModelConfigManager.getInstance();
