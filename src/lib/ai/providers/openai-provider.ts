// OpenAI Provider - Simplified provider using YAML configuration
// Backwards compatible with existing GPT implementation

import { ChatOpenAI } from "@langchain/openai";
import { JsonOutputFunctionsParser } from "langchain/output_parsers";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { FunctionDefinition } from "@langchain/core/language_models/base";
import type { Content, TokenUsage } from "$lib/ai/types.d";
import { modelConfig, type FlowType } from "$lib/config/model-config";

export interface AnalysisOptions {
  language?: string;
  temperature?: number;
  maxRetries?: number;
  timeoutMs?: number;
  flowType?: FlowType;
}

export interface AnalysisResult {
  data: any;
  tokenUsage: TokenUsage;
  provider: string;
  model: string;
  executionTime: number;
  cost: number;
}

export class OpenAIProvider {
  private static instance: OpenAIProvider;

  static getInstance(): OpenAIProvider {
    if (!this.instance) {
      this.instance = new OpenAIProvider();
    }
    return this.instance;
  }

  /**
   * Main analysis method - backwards compatible with existing fetchGpt interface
   */
  async analyzeDocument(
    content: Content[],
    schema: FunctionDefinition,
    tokenUsage: TokenUsage,
    options: AnalysisOptions = {},
  ): Promise<any> {
    const startTime = Date.now();
    const flowType = options.flowType || "medical_analysis";

    try {
      // Get model configuration for this flow
      const { provider, modelInfo, config } =
        modelConfig.getModelForFlow(flowType);

      if (provider !== "openai") {
        throw new Error(
          `Flow '${flowType}' is configured for '${provider}' but only OpenAI is supported`,
        );
      }

      // Get API key
      const apiKey = modelConfig.getProviderApiKey("openai");

      const result = await this.executeOpenAI(content, schema, tokenUsage, {
        ...options,
        modelId: modelInfo.model_id,
        apiKey,
        temperature: options.temperature ?? modelInfo.temperature,
        maxTokens: modelInfo.max_tokens,
      });

      const executionTime = Date.now() - startTime;
      const tokensUsed =
        (schema.description && tokenUsage[schema.description]) || 0;
      const cost = modelConfig.calculateCost(
        "openai",
        modelInfo.model_id.replace("gpt-4o-2024-08-06", "gpt4"),
        tokensUsed,
      );

      // Log usage for monitoring
      modelConfig.logModelUsage(
        flowType,
        "openai",
        modelInfo.model_id,
        tokensUsed,
        cost,
        executionTime,
      );

      console.log(
        `✅ OpenAI analysis (${flowType}) completed in ${executionTime}ms | ${tokensUsed} tokens | $${cost.toFixed(4)}`,
      );

      return result;
    } catch (error) {
      console.error(`❌ OpenAI analysis (${flowType}) failed:`, error);
      throw error;
    }
  }

  /**
   * Execute with OpenAI using dynamic configuration
   */
  private async executeOpenAI(
    content: Content[],
    schema: FunctionDefinition,
    tokenUsage: TokenUsage,
    options: AnalysisOptions & {
      modelId: string;
      apiKey: string;
      maxTokens: number;
    },
  ): Promise<any> {
    const parser = new JsonOutputFunctionsParser();
    const language = options.language || "English";

    console.log(`🤖 OpenAI Request (${options.modelId}) Language:`, language);

    const model = new ChatOpenAI({
      model: options.modelId,
      apiKey: options.apiKey,
      temperature: options.temperature || 0,
      maxTokens: options.maxTokens,
      timeout:
        options.timeoutMs || modelConfig.getPerformanceSettings().timeout_ms,
      maxRetries:
        options.maxRetries || modelConfig.getPerformanceSettings().max_retries,
      callbacks: [
        {
          handleLLMEnd(output, runId, parentRunId, tags) {
            const tokens = output.llmOutput?.tokenUsage?.totalTokens || 0;
            tokenUsage.total += tokens;
            if (schema.description) {
              tokenUsage[schema.description] = tokens;
            }
          },
        },
      ],
    });

    const runnable = model
      .bind({
        functions: [schema],
        function_call: { name: "extractor" },
      })
      .pipe(parser);

    const systemMessage = new SystemMessage({
      content: this.createSystemMessage(language),
    });

    const humanMessage = new HumanMessage({
      content,
    });

    return await runnable.invoke([systemMessage, humanMessage]);
  }

  /**
   * Create system message for OpenAI
   */
  private createSystemMessage(language: string): string {
    return `You are a medical AI assistant. You MUST respond in ${language} language ONLY. All text in your response must be in ${language}. Do not use any other language. If the language is "English", respond only in English. If the language is "Czech", respond only in Czech. This is critical - strictly follow the language requirement.`;
  }

  /**
   * Backwards compatible wrapper for existing fetchGpt calls
   */
  async fetchGptCompatible(
    content: Content[],
    schema: FunctionDefinition,
    tokenUsage: TokenUsage,
    language: string = "English",
    flowType: FlowType = "medical_analysis",
  ): Promise<any> {
    return this.analyzeDocument(content, schema, tokenUsage, {
      language,
      flowType,
    });
  }

  /**
   * Check if OpenAI is available
   */
  isAvailable(): boolean {
    return modelConfig.isProviderAvailable("openai");
  }

  /**
   * Get available models for OpenAI
   */
  getAvailableModels(): string[] {
    try {
      const { modelInfo } = modelConfig.getModelForFlow("medical_analysis");
      return [modelInfo.model_id];
    } catch {
      return [];
    }
  }
}

// Export singleton instance
export const openaiProvider = OpenAIProvider.getInstance();

// Export backward compatibility function
export async function fetchGpt(
  content: Content[],
  schema: FunctionDefinition,
  tokenUsage: TokenUsage,
  language: string = "English",
  flowType: FlowType = "medical_analysis",
): Promise<any> {
  return openaiProvider.fetchGptCompatible(
    content,
    schema,
    tokenUsage,
    language,
    flowType,
  );
}
