/**
 * Base Processing Node Template
 *
 * Provides a reusable foundation for all specialized medical processing nodes
 * with consistent progress tracking, error handling, and AI provider integration.
 */

import type { DocumentProcessingState } from "../state";
import type { FunctionDefinition } from "@langchain/core/language_models/base";
import { fetchGptEnhanced } from "$lib/ai/providers/enhanced-abstraction";
import anatomyTags from "$lib/configurations/tags";
import { log } from "$lib/logging/logger";
// import { isStateTransitionDebuggingEnabled } from "$lib/config/logging-config";
import {
  recordWorkflowStep,
  workflowRecorder,
} from "$lib/debug/workflow-recorder";

export interface BaseProcessingNodeConfig {
  nodeName: string;
  description: string;
  schemaImportPath: string;
  progressStages: Array<{
    stage: string;
    progress: number;
    message: string;
  }>;
  featureDetectionTriggers: string[];
}

export interface ProcessingNodeResult {
  data: any;
  metadata: {
    processingTime: number;
    tokensUsed: number;
    confidence: number;
    provider: string;
  };
}

export abstract class BaseProcessingNode {
  protected config: BaseProcessingNodeConfig;
  protected schema: FunctionDefinition | null = null;

  constructor(config: BaseProcessingNodeConfig) {
    this.config = config;
  }

  /**
   * Main processing method - implements the standard workflow
   */
  async process(
    state: DocumentProcessingState,
  ): Promise<Partial<DocumentProcessingState>> {
    const stepStartTime = Date.now();

    // CRITICAL: Check if we're in replay mode and should not execute real processing
    if (workflowRecorder.isReplayMode()) {
      const replayFilePath = workflowRecorder.getReplayFilePath();
      log.analysis.error(
        `🚫 BaseProcessingNode execution blocked during replay mode`,
        {
          nodeName: this.config.nodeName,
          replayFile: replayFilePath,
          stack: new Error().stack,
        },
      );
      throw new Error(
        `BaseProcessingNode (${this.config.nodeName}) should not be executed during replay mode. Replay file: ${replayFilePath}. This suggests the replay mechanism is bypassing node execution incorrectly.`,
      );
    }

    try {
      // Check if this node should execute based on feature detection
      if (!this.shouldExecute(state)) {
        console.log(
          `⏭️ Skipping ${this.config.nodeName} - feature not detected`,
          {
            triggers: this.config.featureDetectionTriggers,
            featureResults: state.featureDetectionResults,
          },
        );
        log.analysis.debug(
          `Skipping ${this.config.nodeName} - feature not detected`,
        );
        return {};
      }

      console.log(
        `✅ ${this.config.nodeName} should execute - feature detected`,
        {
          triggers: this.config.featureDetectionTriggers,
          matchingTriggers: this.config.featureDetectionTriggers.filter(
            (trigger) =>
              (state.featureDetectionResults as any)?.[trigger] === true,
          ),
        },
      );

      // Initialize progress tracking
      const emitProgress = this.createProgressEmitter(state);
      const emitComplete = this.createCompleteEmitter(state);

      // Load schema
      emitProgress(
        this.config.progressStages[0].stage,
        this.config.progressStages[0].progress,
        this.config.progressStages[0].message,
      );
      await this.loadSchema();

      // Process section with AI
      emitProgress(
        this.config.progressStages[1].stage,
        this.config.progressStages[1].progress,
        this.config.progressStages[1].message,
      );
      console.log(`🤖 ${this.config.nodeName} starting AI processing`, {
        hasSchema: !!this.schema,
        schemaName: this.schema?.name,
        contentLength: state.content?.length || 0,
        hasText: !!state.text,
      });
      const result = await this.processWithAI(state, emitProgress);
      console.log(`🤖 ${this.config.nodeName} AI processing result:`, {
        resultType: typeof result,
        resultKeys: result ? Object.keys(result) : [],
        result: result,
      });

      // Validate and enhance results
      emitProgress(
        this.config.progressStages[2].stage,
        this.config.progressStages[2].progress,
        this.config.progressStages[2].message,
      );
      const processedData = await this.validateAndEnhance(result, state);

      // Emit completion
      emitComplete(
        "completed",
        `${this.config.description} completed successfully`,
        {
          dataExtracted: !!processedData.data,
          tokensUsed: processedData.metadata.tokensUsed,
          confidence: processedData.metadata.confidence,
        },
      );

      // Record workflow step for debugging
      const stepDuration = Date.now() - stepStartTime;
      recordWorkflowStep(
        this.config.nodeName,
        state,
        { ...state, [this.getSectionName()]: processedData.data },
        stepDuration,
        [],
        [],
        {
          provider: processedData.metadata.provider,
          flowType: this.config.nodeName,
          confidence: processedData.metadata.confidence,
        },
      );

      // Return state update
      const stateUpdate = {
        [this.getSectionName()]: processedData.data,
        tokenUsage: {
          ...state.tokenUsage,
          [this.config.nodeName]: processedData.metadata.tokensUsed,
          total:
            (state.tokenUsage?.total || 0) + processedData.metadata.tokensUsed,
        },
      };

      console.log(`📤 ${this.config.nodeName} returning state update:`, {
        sectionName: this.getSectionName(),
        dataKeys: processedData.data ? Object.keys(processedData.data) : [],
        tokensUsed: processedData.metadata.tokensUsed,
        stateUpdate,
      });

      return stateUpdate;
    } catch (error) {
      log.analysis.error(`${this.config.nodeName} processing error:`, error);

      // Record failed step
      const stepDuration = Date.now() - stepStartTime;
      recordWorkflowStep(
        this.config.nodeName,
        state,
        { ...state },
        stepDuration,
        [],
        [error instanceof Error ? error.message : String(error)],
        {
          provider: "unknown",
          flowType: this.config.nodeName,
          failed: true,
        },
      );

      return {
        errors: [
          ...(state.errors || []),
          {
            node: this.config.nodeName,
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
          },
        ],
      };
    }
  }

  /**
   * Check if this node should execute based on feature detection results
   */
  protected shouldExecute(state: DocumentProcessingState): boolean {
    const featureResults = state.featureDetectionResults;
    if (!featureResults) {
      console.log(
        `⚠️ ${this.config.nodeName} - No featureDetectionResults found in state`,
      );
      return false;
    }

    console.log(`🔍 ${this.config.nodeName} - Checking feature detection:`, {
      triggers: this.config.featureDetectionTriggers,
      featureResults: featureResults,
      matches: this.config.featureDetectionTriggers.map((trigger) => ({
        trigger,
        value: (featureResults as any)[trigger],
        matches: (featureResults as any)[trigger] === true,
      })),
    });

    const shouldExecute = this.config.featureDetectionTriggers.some(
      (trigger) => {
        return (featureResults as any)[trigger] === true;
      },
    );

    console.log(
      `${shouldExecute ? "✅" : "❌"} ${this.config.nodeName} - Should execute:`,
      shouldExecute,
    );
    return shouldExecute;
  }

  /**
   * Load the schema for this processing node
   */
  protected async loadSchema(): Promise<void> {
    try {
      // Convert $lib alias to relative path for dynamic imports
      let importPath = this.config.schemaImportPath;
      if (importPath.startsWith("$lib/")) {
        // From src/lib/langgraph/nodes/ to src/lib/configurations/
        importPath = importPath.replace("$lib/", "../../");
      }

      console.log(
        `📋 Loading schema from: ${importPath} (original: ${this.config.schemaImportPath})`,
      );
      const schemaModule = await import(importPath);
      this.schema = schemaModule.default;

      if (!this.schema) {
        throw new Error(
          `Schema module at ${importPath} does not export a default export`,
        );
      }

      // Populate empty bodyParts identification enum with anatomy tags
      const schemaItems = (this.schema as any)?.items?.properties?.identification;
      if (schemaItems?.enum && schemaItems.enum.length === 0) {
        schemaItems.enum = [...anatomyTags];
      }

      console.log(`✅ Successfully loaded schema for ${this.config.nodeName}`);
    } catch (error) {
      console.error(
        `❌ Failed to load schema for ${this.config.nodeName}:`,
        error,
      );
      throw new Error(
        `Failed to load schema from ${this.config.schemaImportPath}: ${error}`,
      );
    }
  }

  /**
   * Process content with AI using the loaded schema
   */
  protected async processWithAI(
    state: DocumentProcessingState,
    emitProgress: (stage: string, progress: number, message: string) => void,
  ): Promise<any> {
    if (!this.schema) {
      throw new Error(`Schema not loaded for ${this.config.nodeName}`);
    }

    const tokenUsage = { ...state.tokenUsage };

    // Build content array including images if available
    const content = [];
    if (state.images && state.images.length > 0) {
      content.push(
        ...state.images.map((img) => ({
          type: "image_url" as const,
          image_url: { url: img },
        })),
      );
    }
    if (state.text) {
      content.push({ type: "text" as const, text: state.text });
    }

    // Fallback to state.content if no text/images found
    const finalContent = content.length > 0 ? content : state.content || [];

    const result = await fetchGptEnhanced(
      finalContent,
      this.schema,
      tokenUsage,
      state.language || "English",
      "extraction",
      (stage, progress, message) => {
        // Convert AI progress to node progress (map to remaining progress space)
        const baseProgress = this.config.progressStages[1].progress;
        const maxProgress = this.config.progressStages[2].progress;
        const nodeProgress =
          baseProgress + (progress / 100) * (maxProgress - baseProgress);
        emitProgress(
          `${this.config.nodeName}_ai_${stage}`,
          nodeProgress,
          `AI: ${message}`,
        );
      },
    );

    return result;
  }

  /**
   * Validate and enhance the AI results
   */
  protected async validateAndEnhance(
    aiResult: any,
    state: DocumentProcessingState,
  ): Promise<ProcessingNodeResult> {
    // Default implementation - can be overridden by subclasses
    const processingTime = Date.now();
    const tokensUsed = state.tokenUsage?.[this.config.nodeName] || 0;

    return {
      data: aiResult || {},
      metadata: {
        processingTime,
        tokensUsed,
        confidence: this.calculateConfidence(aiResult),
        provider: "enhanced-openai",
      },
    };
  }

  /**
   * Calculate confidence score for the processed data
   */
  protected calculateConfidence(data: any): number {
    if (!data) return 0;

    // Basic confidence calculation - can be enhanced by subclasses
    const hasData = Object.keys(data).length > 0;
    const hasRequiredFields = this.hasRequiredFields(data);

    if (!hasData) return 0;
    if (hasRequiredFields) return 0.9;
    return 0.7;
  }

  /**
   * Check if the data has required fields - override in subclasses
   */
  protected hasRequiredFields(_data: any): boolean {
    return true; // Default implementation
  }

  /**
   * Get the section name for state storage - override in subclasses
   */
  protected abstract getSectionName(): string;

  /**
   * Create progress emitter function
   */
  protected createProgressEmitter(state: DocumentProcessingState) {
    return (stage: string, progress: number, message: string) => {
      if (state.progressCallback) {
        state.progressCallback({
          type: "progress",
          stage,
          progress,
          message,
          timestamp: Date.now(),
        });
      }
      state.emitProgress?.(stage, progress, message);
    };
  }

  /**
   * Create completion emitter function
   */
  protected createCompleteEmitter(state: DocumentProcessingState) {
    return (stage: string, message: string, data?: any) => {
      if (state.progressCallback) {
        state.progressCallback({
          type: "progress",
          stage,
          progress: 100,
          message,
          data,
          timestamp: Date.now(),
        });
      }
      state.emitComplete?.(stage, message, data);
    };
  }

  /**
   * Create error emitter function
   */
  protected createErrorEmitter(state: DocumentProcessingState) {
    return (stage: string, message: string, error?: any) => {
      if (state.progressCallback) {
        state.progressCallback({
          type: "error",
          stage,
          progress: 0,
          message,
          data: error,
          timestamp: Date.now(),
        });
      }
      state.emitError?.(stage, message, error);
    };
  }
}

/**
 * Utility function to create a simple processing node from a config
 */
export function createSimpleProcessingNode(config: BaseProcessingNodeConfig) {
  class SimpleProcessingNode extends BaseProcessingNode {
    protected getSectionName(): string {
      return this.config.nodeName.replace("-processing", "");
    }
  }

  const nodeInstance = new SimpleProcessingNode(config);

  return async (
    state: DocumentProcessingState,
  ): Promise<Partial<DocumentProcessingState>> => {
    return nodeInstance.process(state);
  };
}
