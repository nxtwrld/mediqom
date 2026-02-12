// Provider Abstraction Layer - Unified interface for multiple AI providers
// Maintains compatibility with existing GPT implementation while adding multi-provider support

import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatAnthropic } from "@langchain/anthropic";
import { JsonOutputFunctionsParser } from "langchain/output_parsers";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { FunctionDefinition } from "@langchain/core/language_models/base";
import { AIProvider, ProviderRegistry } from "./registry";
import type { Content, TokenUsage } from "$lib/ai/types.d";
import {
  OPENAI_API_KEY,
  ANTHROPIC_API_KEY,
  GOOGLE_API_KEY,
} from "$env/static/private";

export interface AnalysisOptions {
  language?: string;
  temperature?: number;
  maxRetries?: number;
  timeoutMs?: number;
}

export interface AnalysisResult {
  data: any;
  tokenUsage: TokenUsage;
  provider: AIProvider;
  executionTime: number;
  confidence?: number;
}

export interface ProviderConfig {
  provider: AIProvider;
  apiKey: string;
  modelId?: string;
  baseURL?: string;
}

export class AIProviderAbstraction {
  private static instance: AIProviderAbstraction;
  private providers: Map<AIProvider, any> = new Map();

  constructor() {
    this.initializeProviders();
  }

  static getInstance(): AIProviderAbstraction {
    if (!this.instance) {
      this.instance = new AIProviderAbstraction();
    }
    return this.instance;
  }

  /**
   * Initialize all available AI providers
   */
  private initializeProviders() {
    // OpenAI GPT providers
    if (OPENAI_API_KEY) {
      this.providers.set(AIProvider.OPENAI_GPT4, {
        modelId: "gpt-4",
        apiKey: OPENAI_API_KEY,
      });
      this.providers.set(AIProvider.OPENAI_GPT4_TURBO, {
        modelId: "gpt-4-turbo-preview",
        apiKey: OPENAI_API_KEY,
      });
    }

    // Google Gemini
    if (GOOGLE_API_KEY) {
      this.providers.set(AIProvider.GOOGLE_GEMINI, {
        modelId: "gemini-pro-vision",
        apiKey: GOOGLE_API_KEY,
      });
    }

    // Anthropic Claude
    if (ANTHROPIC_API_KEY) {
      this.providers.set(AIProvider.ANTHROPIC_CLAUDE, {
        modelId: "claude-3-opus-20240229",
        apiKey: ANTHROPIC_API_KEY,
      });
    }
  }

  /**
   * Main analysis method - backwards compatible with existing fetchGpt interface
   */
  async analyzeDocument(
    provider: AIProvider,
    content: Content[],
    schema: FunctionDefinition,
    tokenUsage: TokenUsage,
    options: AnalysisOptions = {},
  ): Promise<any> {
    const startTime = Date.now();

    try {
      const result = await this.executeWithProvider(
        provider,
        content,
        schema,
        tokenUsage,
        options,
      );

      const executionTime = Date.now() - startTime;
      console.log(`✅ ${provider} analysis completed in ${executionTime}ms`);

      return result;
    } catch (error) {
      console.error(`❌ ${provider} analysis failed:`, error);
      throw error;
    }
  }

  /**
   * Execute analysis with specific provider
   */
  private async executeWithProvider(
    provider: AIProvider,
    content: Content[],
    schema: FunctionDefinition,
    tokenUsage: TokenUsage,
    options: AnalysisOptions,
  ): Promise<any> {
    switch (provider) {
      case AIProvider.OPENAI_GPT4:
      case AIProvider.OPENAI_GPT4_TURBO:
        return this.executeOpenAI(
          provider,
          content,
          schema,
          tokenUsage,
          options,
        );

      case AIProvider.GOOGLE_GEMINI:
        return this.executeGemini(content, schema, tokenUsage, options);

      case AIProvider.ANTHROPIC_CLAUDE:
        return this.executeClaude(content, schema, tokenUsage, options);

      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Execute with OpenAI (GPT-4, GPT-4 Turbo)
   */
  private async executeOpenAI(
    provider: AIProvider,
    content: Content[],
    schema: FunctionDefinition,
    tokenUsage: TokenUsage,
    options: AnalysisOptions,
  ): Promise<any> {
    const config = this.providers.get(provider);
    if (!config) {
      throw new Error(`Provider ${provider} not configured`);
    }

    const parser = new JsonOutputFunctionsParser();
    const language = options.language || "English";

    console.log("🤖 OpenAI Request Language:", language);

    const model = new ChatOpenAI({
      model: config.modelId,
      apiKey: config.apiKey,
      temperature: options.temperature || 0,
      callbacks: [
        {
          handleLLMEnd(output, runId, parentRunId, tags) {
            const tokens = output.llmOutput?.tokenUsage.totalTokens || 0;
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
   * Execute with Google Gemini
   */
  private async executeGemini(
    content: Content[],
    schema: FunctionDefinition,
    tokenUsage: TokenUsage,
    options: AnalysisOptions,
  ): Promise<any> {
    const config = this.providers.get(AIProvider.GOOGLE_GEMINI);
    if (!config) {
      throw new Error(`Provider ${AIProvider.GOOGLE_GEMINI} not configured`);
    }

    const language = options.language || "English";
    console.log("🤖 Gemini Request Language:", language);

    const model = new ChatGoogleGenerativeAI({
      modelName: config.modelId,
      apiKey: config.apiKey,
      temperature: options.temperature || 0,
      callbacks: [
        {
          handleLLMEnd: (output, runId, parentRunId, tags) => {
            // Gemini token counting may differ, estimate for now
            const estimatedTokens = this.estimateTokens(content);
            tokenUsage.total += estimatedTokens;
            if (schema.description) {
              tokenUsage[schema.description] = estimatedTokens;
            }
          },
        },
      ],
    });

    // Convert function definition to Gemini format
    const geminiTool = this.convertToGeminiTool(schema);

    const systemMessage = new SystemMessage({
      content: this.createSystemMessage(language),
    });

    const humanMessage = new HumanMessage({
      content,
    });

    // Gemini needs special handling for function calling
    const result = await model.invoke([systemMessage, humanMessage]);

    // Parse result and extract function call data
    return this.parseGeminiResult(result, schema);
  }

  /**
   * Execute with Anthropic Claude
   */
  private async executeClaude(
    content: Content[],
    schema: FunctionDefinition,
    tokenUsage: TokenUsage,
    options: AnalysisOptions,
  ): Promise<any> {
    const config = this.providers.get(AIProvider.ANTHROPIC_CLAUDE);
    if (!config) {
      throw new Error(`Provider ${AIProvider.ANTHROPIC_CLAUDE} not configured`);
    }

    const language = options.language || "English";
    console.log("🤖 Claude Request Language:", language);

    const model = new ChatAnthropic({
      model: config.modelId,
      apiKey: config.apiKey,
      temperature: options.temperature || 0,
      callbacks: [
        {
          handleLLMEnd: (output, runId, parentRunId, tags) => {
            const estimatedTokens = this.estimateTokens(content);
            tokenUsage.total += estimatedTokens;
            if (schema.description) {
              tokenUsage[schema.description] = estimatedTokens;
            }
          },
        },
      ],
    });

    const systemMessage = new SystemMessage({
      content:
        this.createSystemMessage(language) +
        this.createClaudeToolInstructions(schema),
    });

    const humanMessage = new HumanMessage({
      content,
    });

    const result = await model.invoke([systemMessage, humanMessage]);

    // Parse Claude result to match expected schema format
    return this.parseClaudeResult(result, schema);
  }

  /**
   * Create system message for all providers
   */
  private createSystemMessage(language: string): string {
    return `You are a medical AI assistant. You MUST respond in ${language} language ONLY. All text in your response must be in ${language}. Do not use any other language. If the language is "English", respond only in English. If the language is "Czech", respond only in Czech. This is critical - strictly follow the language requirement.`;
  }

  /**
   * Create Claude-specific tool instructions
   */
  private createClaudeToolInstructions(schema: FunctionDefinition): string {
    return `\n\nYou must extract medical information and respond in JSON format according to this schema:\n${JSON.stringify(schema.parameters, null, 2)}`;
  }

  /**
   * Convert OpenAI function definition to Gemini tool format
   */
  private convertToGeminiTool(schema: FunctionDefinition): any {
    // Simplified conversion - may need enhancement for complex schemas
    return {
      functionDeclarations: [
        {
          name: schema.name,
          description: schema.description,
          parameters: schema.parameters,
        },
      ],
    };
  }

  /**
   * Parse Gemini result to match expected format
   */
  private parseGeminiResult(result: any, schema: FunctionDefinition): any {
    try {
      // Try to extract function call result
      if (result.content && typeof result.content === "string") {
        const parsed = JSON.parse(result.content);
        return parsed;
      }

      // Fallback: try to extract from function calls
      if (result.additional_kwargs?.function_call) {
        return JSON.parse(result.additional_kwargs.function_call.arguments);
      }

      throw new Error("Unable to parse Gemini result");
    } catch (error) {
      console.error("Failed to parse Gemini result:", error);
      throw error;
    }
  }

  /**
   * Parse Claude result to match expected format
   */
  private parseClaudeResult(result: any, schema: FunctionDefinition): any {
    try {
      if (result.content && typeof result.content === "string") {
        // Claude might return JSON directly in content
        const jsonMatch = result.content.match(/\{.*\}/s);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      }

      throw new Error("Unable to parse Claude result");
    } catch (error) {
      console.error("Failed to parse Claude result:", error);
      throw error;
    }
  }

  /**
   * Estimate tokens for providers that don't provide accurate counts
   */
  private estimateTokens(content: Content[]): number {
    let estimate = 0;

    for (const item of content) {
      if (item.type === "text" && item.text) {
        estimate += Math.ceil(item.text.length / 4); // Rough estimate: 4 chars per token
      } else if (item.type === "image_url") {
        estimate += 1000; // Fixed estimate for images
      }
    }

    return estimate;
  }

  /**
   * Check if a provider is available/configured
   */
  isProviderAvailable(provider: AIProvider): boolean {
    return this.providers.has(provider);
  }

  /**
   * Get list of available providers
   */
  getAvailableProviders(): AIProvider[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Backwards compatible wrapper for existing fetchGpt calls
   */
  async fetchGptCompatible(
    content: Content[],
    schema: FunctionDefinition,
    tokenUsage: TokenUsage,
    language: string = "English",
  ): Promise<any> {
    // Use GPT-4 as default for backwards compatibility
    const provider = this.isProviderAvailable(AIProvider.OPENAI_GPT4)
      ? AIProvider.OPENAI_GPT4
      : AIProvider.OPENAI_GPT4_TURBO;

    return this.analyzeDocument(provider, content, schema, tokenUsage, {
      language,
    });
  }
}
