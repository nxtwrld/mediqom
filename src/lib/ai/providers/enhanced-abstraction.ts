// Enhanced Provider Abstraction - Provider-agnostic function calling
// Dynamically adapts function calling to each AI provider's requirements

import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatAnthropic } from "@langchain/anthropic";
import { JsonOutputFunctionsParser } from "langchain/output_parsers";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { FunctionDefinition } from "@langchain/core/language_models/base";
import type { Content, TokenUsage } from "$lib/ai/types.d";
import { modelConfig, type FlowType } from "$lib/config/model-config";
import { log } from "$lib/logging/logger";
import {
  isVerboseAILoggingEnabled,
  isAIResponseLoggingEnabled,
} from "$lib/config/logging-config";
import { workflowRecorder } from "$lib/debug/workflow-recorder";

// Create AI-specific logger
const aiLogger = log.analysis;

export interface AnalysisOptions {
  language?: string;
  temperature?: number;
  maxRetries?: number;
  timeoutMs?: number;
  flowType?: FlowType;
  progressCallback?: (stage: string, progress: number, message: string) => void;
}

export interface AnalysisResult {
  data: any;
  tokenUsage: TokenUsage;
  provider: string;
  model: string;
  executionTime: number;
  cost: number;
  functionName: string; // Track which function was called
}

/**
 * Enhanced AI Provider Abstraction with dynamic function calling
 */
export class EnhancedAIProvider {
  private static instance: EnhancedAIProvider;

  static getInstance(): EnhancedAIProvider {
    if (!this.instance) {
      this.instance = new EnhancedAIProvider();
    }
    return this.instance;
  }

  /**
   * Dynamic function name resolution with fallback strategy
   */
  private resolveFunctionName(schema: FunctionDefinition): string {
    // Priority order:
    // 1. Use schema.name if it exists
    // 2. Fallback to "extractor" for backward compatibility
    // 3. Last resort: "extract_data"

    if (schema.name && schema.name.trim()) {
      return schema.name;
    }

    aiLogger.warn('Schema missing name field, using fallback "extractor"');
    return "extractor";
  }

  /**
   * Ensure schema has a valid function name
   */
  private normalizeSchema(schema: FunctionDefinition): FunctionDefinition {
    const functionName = this.resolveFunctionName(schema);

    return {
      ...schema,
      name: functionName,
    };
  }

  /**
   * Main analysis method with provider-agnostic function calling
   */
  async analyzeDocument(
    content: Content[],
    schema: FunctionDefinition,
    tokenUsage: TokenUsage,
    options: AnalysisOptions = {},
  ): Promise<any> {
    const startTime = Date.now();
    const flowType = options.flowType || "medical_analysis";

    // CRITICAL: Prevent AI calls during replay mode
    if (workflowRecorder.isReplayMode()) {
      const replayFilePath = workflowRecorder.getReplayFilePath();
      aiLogger.error(`🚫 AI call blocked during replay mode`, {
        flowType,
        replayFile: replayFilePath,
        schemaName: schema.name,
        stack: new Error().stack,
      });
      throw new Error(
        `AI calls are not allowed during replay mode. Replay file: ${replayFilePath}. This suggests the replay mechanism is not working correctly.`,
      );
    }

    try {
      // Emit progress: Starting AI analysis
      options.progressCallback?.(
        flowType,
        0,
        `Initializing ${flowType} with AI provider`,
      );

      // Get model configuration for this flow
      const { provider, modelInfo, config } =
        modelConfig.getModelForFlow(flowType);

      options.progressCallback?.(
        flowType,
        10,
        `Configured ${provider} provider`,
      );

      // Normalize schema with proper function name
      const normalizedSchema = this.normalizeSchema(schema);
      const functionName = normalizedSchema.name;

      aiLogger.info(
        `Using function "${functionName}" with provider "${provider}"`,
      );

      // Get API key
      const apiKey = modelConfig.getProviderApiKey(provider);

      options.progressCallback?.(
        flowType,
        30,
        `Sending request to ${provider} AI`,
      );

      // Execute with the appropriate provider
      const result = await this.executeWithProvider(
        provider,
        content,
        normalizedSchema,
        tokenUsage,
        {
          ...options,
          modelId: modelInfo.model_id,
          apiKey,
          temperature: options.temperature ?? modelInfo.temperature,
          maxTokens: modelInfo.max_tokens,
        },
      );

      options.progressCallback?.(
        flowType,
        80,
        `Processing ${provider} AI response`,
      );

      // Log the actual AI response for debugging (only if enabled)
      if (isAIResponseLoggingEnabled()) {
        aiLogger.debug(`${provider} response received`, {
          flowType,
          functionName,
          resultPreview: JSON.stringify(result).substring(0, 300) + "...",
          resultKeys: Object.keys(result || {}),
          hasResult: !!result,
        });
      }

      // Log the full result if verbose AI logging is enabled
      if (isVerboseAILoggingEnabled()) {
        aiLogger.trace(`${provider} full response`, {
          flowType,
          functionName,
          fullResult: result,
        });
      }

      const executionTime = Date.now() - startTime;
      const tokensUsed =
        (schema.description && tokenUsage[schema.description]) || 0;
      const cost = modelConfig.calculateCost(
        provider,
        modelInfo.model_id.replace("gpt-4o-2024-08-06", "gpt4"),
        tokensUsed,
      );

      // Log usage for monitoring
      modelConfig.logModelUsage(
        flowType,
        provider,
        modelInfo.model_id,
        tokensUsed,
        cost,
        executionTime,
      );

      aiLogger.info(`${provider} analysis (${flowType}) completed`, {
        executionTime,
        tokensUsed,
        cost: cost.toFixed(4),
        functionName,
        flowType,
      });

      options.progressCallback?.(
        flowType,
        100,
        `${flowType} completed successfully`,
      );

      return result;
    } catch (error) {
      options.progressCallback?.(
        flowType,
        0,
        `${flowType} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      aiLogger.error(`Enhanced provider analysis (${flowType}) failed:`, error);
      throw error;
    }
  }

  /**
   * Execute with specific provider using provider-specific function calling
   */
  private async executeWithProvider(
    provider: string,
    content: Content[],
    schema: FunctionDefinition,
    tokenUsage: TokenUsage,
    options: AnalysisOptions & {
      modelId: string;
      apiKey: string;
      maxTokens: number;
    },
  ): Promise<any> {
    switch (provider) {
      case "openai":
        return this.executeOpenAI(content, schema, tokenUsage, options);

      case "google":
        return this.executeGemini(content, schema, tokenUsage, options);

      case "anthropic":
        return this.executeClaude(content, schema, tokenUsage, options);

      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Execute with OpenAI using dynamic function names
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
    const functionName = schema.name; // Use dynamic function name

    aiLogger.info(`OpenAI Request`, {
      model: options.modelId,
      function: functionName,
      language,
      temperature: options.temperature || 0,
      maxTokens: options.maxTokens,
    });

    // Report progress before making the API call
    options.progressCallback?.(
      "ai_processing",
      70,
      "Sending request to AI model...",
    );

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
            aiLogger.debug(`OpenAI response received`, {
              tokens,
              runId,
              model: options.modelId,
              function: functionName,
            });
          },
        },
      ],
    });

    // Skip parser to match legacy behavior and manually parse function calls
    const modelWithoutParser = model.bind({
      functions: [schema],
      function_call: { name: functionName }, // 🔧 Dynamic function name!
    });

    const systemMessage = new SystemMessage({
      content: this.createSystemMessage(language),
    });

    const humanMessage = new HumanMessage({
      content,
    });

    // Log the AI request
    const requestData = {
      provider: "enhanced-openai",
      systemMessage: systemMessage.content,
      humanMessage: { content },
      schema: schema,
      model: options.modelId,
      language: language,
      functions: [schema],
      function_call: { name: functionName },
    };
    //console.log("AI REQUEST:", JSON.stringify(requestData, null, 2));

    const requestStartTime = Date.now();
    const result = await modelWithoutParser.invoke([
      systemMessage,
      humanMessage,
    ]);
    const requestDuration = Date.now() - requestStartTime;

    // Report progress after receiving response
    options.progressCallback?.(
      "ai_processing",
      85,
      "Processing AI response...",
    );

    // Record AI request for debugging if recording is enabled
    if (workflowRecorder.isRecordingEnabled()) {
      const aiRequest = workflowRecorder.recordAIRequest(
        "enhanced-openai",
        options.modelId,
        requestData,
        result,
        tokenUsage,
        requestDuration,
      );
    }

    // Extract function call data from raw response (matching legacy behavior)
    let parsedResult = result;
    if (result?.additional_kwargs?.function_call) {
      const functionCallData = result.additional_kwargs.function_call;

      try {
        parsedResult = JSON.parse(functionCallData.arguments);
      } catch (parseError) {
        aiLogger.error("Failed to parse function call arguments:", {
          error:
            parseError instanceof Error ? parseError.message : "Unknown error",
          functionName: functionCallData.name,
        });
        parsedResult = result;
      }
    }

    return parsedResult;
  }

  /**
   * Execute with Google Gemini using native function declarations
   */
  private async executeGemini(
    content: Content[],
    schema: FunctionDefinition,
    tokenUsage: TokenUsage,
    options: AnalysisOptions & {
      modelId: string;
      apiKey: string;
      maxTokens: number;
    },
  ): Promise<any> {
    const language = options.language || "English";
    const functionName = schema.name;

    aiLogger.info(`Gemini Request`, {
      model: options.modelId,
      function: functionName,
      language,
      temperature: options.temperature || 0,
    });

    const model = new ChatGoogleGenerativeAI({
      model: options.modelId.replace("gpt-4o-2024-08-06", "gemini-pro-vision"), // Map to actual Gemini model
      apiKey: options.apiKey,
      temperature: options.temperature || 0,
      callbacks: [
        {
          handleLLMEnd: (output, runId, parentRunId, tags) => {
            const estimatedTokens = this.estimateTokens(content);
            tokenUsage.total += estimatedTokens;
            if (schema.description) {
              tokenUsage[schema.description] = estimatedTokens;
            }
            aiLogger.debug(`Gemini response received`, {
              estimatedTokens,
              runId,
              model: options.modelId,
              function: functionName,
            });
          },
        },
      ],
    });

    // Use Gemini's native function declaration format
    const tools = [
      {
        functionDeclarations: [
          {
            name: functionName, // 🔧 Dynamic function name!
            description: schema.description,
            parameters: schema.parameters,
          },
        ],
      },
    ];

    const systemMessage = new SystemMessage({
      content: this.createSystemMessage(language),
    });

    const humanMessage = new HumanMessage({
      content,
    });

    // Gemini function calling approach
    const result = await model.invoke([systemMessage, humanMessage], {
      tools,
      tool_choice: { type: "function", function: { name: functionName } },
    });

    return this.parseGeminiResult(result, schema);
  }

  /**
   * Execute with Anthropic Claude using schema-in-prompt approach
   */
  private async executeClaude(
    content: Content[],
    schema: FunctionDefinition,
    tokenUsage: TokenUsage,
    options: AnalysisOptions & {
      modelId: string;
      apiKey: string;
      maxTokens: number;
    },
  ): Promise<any> {
    const language = options.language || "English";
    const functionName = schema.name;

    aiLogger.info(`Claude Request`, {
      model: options.modelId,
      function: functionName,
      language,
      temperature: options.temperature || 0,
      maxTokens: options.maxTokens,
    });

    const model = new ChatAnthropic({
      model: options.modelId.replace(
        "gpt-4o-2024-08-06",
        "claude-3-sonnet-20240229",
      ), // Map to actual Claude model
      apiKey: options.apiKey,
      temperature: options.temperature || 0,
      maxTokens: options.maxTokens,
      callbacks: [
        {
          handleLLMEnd: (output, runId, parentRunId, tags) => {
            const estimatedTokens = this.estimateTokens(content);
            tokenUsage.total += estimatedTokens;
            if (schema.description) {
              tokenUsage[schema.description] = estimatedTokens;
            }
            aiLogger.debug(`Claude response received`, {
              estimatedTokens,
              runId,
              model: options.modelId,
              function: functionName,
            });
          },
        },
      ],
    });

    // Claude uses schema-in-prompt approach (function name is less critical)
    const systemMessage = new SystemMessage({
      content:
        this.createSystemMessage(language) +
        this.createClaudeSchemaInstructions(schema, functionName),
    });

    const humanMessage = new HumanMessage({
      content,
    });

    const result = await model.invoke([systemMessage, humanMessage]);

    return this.parseClaudeResult(result, schema);
  }

  /**
   * Create system message for all providers
   */
  private createSystemMessage(language: string): string {
    return `You are a medical AI assistant. You MUST respond in ${language} language ONLY. All free-text fields in your response must be in ${language}. Do not use any other language for free-text content. This is critical - strictly follow the language requirement. IMPORTANT EXCEPTION: When the JSON schema defines an "enum" array for a field, you MUST use the exact enum values as provided - never translate enum values.`;
  }

  /**
   * Create Claude-specific schema instructions
   */
  private createClaudeSchemaInstructions(
    schema: FunctionDefinition,
    functionName: string,
  ): string {
    return `\n\nYou must analyze the medical content and respond with a JSON object that follows this schema for the "${functionName}" function:\n\n${JSON.stringify(schema.parameters, null, 2)}\n\nRespond ONLY with the JSON object, no additional text.`;
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

      // Fallback: try to extract from tool calls
      if (result.additional_kwargs?.tool_calls) {
        const toolCall = result.additional_kwargs.tool_calls[0];
        if (toolCall?.function?.arguments) {
          return JSON.parse(toolCall.function.arguments);
        }
      }

      // Legacy fallback for function_call format
      if (result.additional_kwargs?.function_call) {
        return JSON.parse(result.additional_kwargs.function_call.arguments);
      }

      throw new Error(
        "Unable to parse Gemini result - no valid function call found",
      );
    } catch (error) {
      aiLogger.error("Failed to parse Gemini result:", {
        error,
        rawResult: JSON.stringify(result, null, 2),
      });
      throw error;
    }
  }

  /**
   * Parse Claude result to match expected format
   */
  private parseClaudeResult(result: any, schema: FunctionDefinition): any {
    try {
      if (result.content && typeof result.content === "string") {
        // Claude returns JSON directly in content
        const jsonMatch = result.content.match(/\{.*\}/s);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }

        // Try parsing the entire content as JSON
        return JSON.parse(result.content);
      }

      throw new Error("Unable to parse Claude result - no valid JSON found");
    } catch (error) {
      aiLogger.error("Failed to parse Claude result:", {
        error,
        rawResult: JSON.stringify(result, null, 2),
      });
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
   * Backward compatibility wrapper for existing fetchGpt calls
   */
  async fetchGptCompatible(
    content: Content[],
    schema: FunctionDefinition,
    tokenUsage: TokenUsage,
    language: string = "English",
    flowType: FlowType = "medical_analysis",
    progressCallback?: (
      stage: string,
      progress: number,
      message: string,
    ) => void,
  ): Promise<any> {
    return this.analyzeDocument(content, schema, tokenUsage, {
      language,
      flowType,
      progressCallback,
    });
  }
}

// Export singleton instance
export const enhancedAIProvider = EnhancedAIProvider.getInstance();

// Export backward compatibility function
export async function fetchGptEnhanced(
  content: Content[],
  schema: FunctionDefinition,
  tokenUsage: TokenUsage,
  language: string = "English",
  flowType: FlowType = "medical_analysis",
  progressCallback?: (stage: string, progress: number, message: string) => void,
): Promise<any> {
  return enhancedAIProvider.fetchGptCompatible(
    content,
    schema,
    tokenUsage,
    language,
    flowType,
    progressCallback,
  );
}
