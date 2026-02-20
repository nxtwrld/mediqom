import {
  DEBUG_ANALYSIS,
  DEBUG_EXTRACTOR,
  DEBUG_ANALYSIS_REPLAY_DELAY,
} from "$env/static/private";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { DocumentProcessingState } from "$lib/langgraph/state";
import type { Content, TokenUsage } from "$lib/ai/types";
import { log } from "$lib/logging/logger";

/**
 * Debug Workflow Recorder and Replay System
 *
 * Handles recording and replaying of complete workflows including:
 * - DEBUG_EXTRACT: OCR/extraction phase
 * - DEBUG_ANALYSIS: LangGraph analysis phase
 * - Step-by-step workflow recording
 * - Replay functionality with state restoration
 */

export interface WorkflowStep {
  stepId: string;
  stepName: string;
  timestamp: string;
  inputState: Partial<DocumentProcessingState>;
  outputState: Partial<DocumentProcessingState>;
  duration: number;
  tokenUsage: TokenUsage;
  aiRequests?: AIRequestLog[];
  errors?: string[];
  metadata: {
    provider?: string;
    model?: string;
    flowType?: string;
    nodeType: string;
  };
}

export interface AIRequestLog {
  provider: string;
  model: string;
  timestamp: string;
  request: {
    systemMessage?: string;
    humanMessage?: any;
    schema?: any;
    functions?: any;
    function_call?: any;
  };
  response: {
    content?: any;
    function_call?: any;
    additional_kwargs?: any;
    parsedResult?: any;
  };
  tokenUsage: TokenUsage;
  duration: number;
}

export interface WorkflowRecording {
  recordingId: string;
  timestamp: string;
  phase: "extract" | "analysis" | "complete";
  input: {
    images?: string[];
    text?: string;
    language?: string;
    metadata?: any;
  };
  steps: WorkflowStep[];
  finalResult: any;
  totalDuration: number;
  totalTokenUsage: TokenUsage;
  version: string;
}

export class WorkflowRecorder {
  private static instance: WorkflowRecorder;
  private currentRecording: WorkflowRecording | null = null;
  private recordingEnabled: boolean = false;
  private replayMode: string | false = false;
  private debugDir: string;

  private constructor() {
    // Skip all initialization in production/Vercel
    const isProduction =
      process.env.NODE_ENV === "production" || process.env.VERCEL === "1";

    if (isProduction) {
      // Explicitly disable recording in production
      this.recordingEnabled = false;
      this.replayMode = false;
      this.debugDir = "/tmp"; // Safe fallback, won't be used
      console.log("WorkflowRecorder: Disabled in production environment");
      return;
    }

    console.log("WorkflowRecorder: Constructor called");
    this.debugDir = join(process.cwd(), "test-data", "workflows");
    console.log("WorkflowRecorder: Debug directory set to:", this.debugDir);
    this.initializeFromEnvironment();
    // Only ensure directory if recording is actually enabled
    if (this.recordingEnabled) {
      this.ensureDebugDirectory();
    }
  }

  static getInstance(): WorkflowRecorder {
    if (!this.instance) {
      this.instance = new WorkflowRecorder();
    }
    return this.instance;
  }

  private initializeFromEnvironment() {
    // Never enable recording in production
    const isProduction =
      process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
    if (isProduction) {
      this.recordingEnabled = false;
      this.replayMode = false;
      return;
    }

    // Check for DEBUG_ANALYSIS environment variable
    const debugAnalysis = DEBUG_ANALYSIS;

    console.log("WorkflowRecorder: Initializing from environment");
    console.log("WorkflowRecorder: DEBUG_ANALYSIS =", debugAnalysis);
    console.log(
      "WorkflowRecorder: typeof DEBUG_ANALYSIS =",
      typeof debugAnalysis,
    );

    if (debugAnalysis === "true") {
      this.recordingEnabled = true;
      log.analysis.info("Debug recording enabled - will save workflow steps");
      console.log("WorkflowRecorder: Recording ENABLED");
    } else if (debugAnalysis && debugAnalysis !== "false") {
      // Path to replay file provided
      this.replayMode = debugAnalysis;
      log.analysis.info("Debug replay mode enabled", { file: debugAnalysis });
      console.log("WorkflowRecorder: Replay mode ENABLED");
    } else {
      console.log("WorkflowRecorder: Recording DISABLED");
    }

    // Also check legacy DEBUG_EXTRACTOR for backwards compatibility
    const debugExtractor = DEBUG_EXTRACTOR;
    if (debugExtractor === "true" && !this.recordingEnabled) {
      this.recordingEnabled = true;
      log.analysis.info("Debug recording enabled via DEBUG_EXTRACTOR");
    }
  }

  /**
   * Get the configured replay delay in milliseconds
   */
  getReplayDelay(): number {
    const delayEnv = DEBUG_ANALYSIS_REPLAY_DELAY;
    const delay = delayEnv ? parseInt(delayEnv, 10) : 500;

    // Ensure delay is within reasonable bounds (50ms to 5000ms)
    return Math.max(50, Math.min(5000, delay));
  }

  private ensureDebugDirectory() {
    if (!existsSync(this.debugDir)) {
      mkdirSync(this.debugDir, { recursive: true });
    }
  }

  /**
   * Start a new workflow recording
   */
  startRecording(phase: "extract" | "analysis", input: any): string | null {
    console.log("WorkflowRecorder.startRecording called:", {
      phase,
      recordingEnabled: this.recordingEnabled,
      hasExistingRecording: !!this.currentRecording,
      debugDir: this.debugDir,
    });

    if (!this.recordingEnabled) {
      console.log(
        "WorkflowRecorder: Recording disabled, not starting recording",
      );
      return null;
    }

    // Clear any existing recording
    if (this.currentRecording) {
      console.log(
        "WorkflowRecorder: Warning - clearing existing recording:",
        this.currentRecording.recordingId,
      );
    }

    const recordingId = `workflow-${phase}-${new Date().toISOString().replace(/[:.]/g, "-")}`;

    this.currentRecording = {
      recordingId,
      timestamp: new Date().toISOString(),
      phase,
      input,
      steps: [],
      finalResult: null,
      totalDuration: 0,
      totalTokenUsage: { total: 0 },
      version: "1.0",
    };

    // Handle both legacy and unified workflow input structures
    const hasImages = !!(input?.images || input?.inputs?.images);
    const hasText = !!(input?.text || input?.inputs?.text);
    const language = input?.language || input?.inputs?.language;

    log.analysis.info("Started workflow recording", {
      recordingId,
      phase,
      hasImages,
      hasText,
      language,
      workflowType: input?.workflowType,
    });

    console.log("WorkflowRecorder: Recording started with ID:", recordingId);
    console.log("WorkflowRecorder: Current recording state:", {
      id: this.currentRecording.recordingId,
      phase: this.currentRecording.phase,
      inputKeys: Object.keys(this.currentRecording.input || {}),
      stepsCount: this.currentRecording.steps.length,
    });

    return recordingId;
  }

  /**
   * Record a workflow step
   */
  recordStep(
    stepName: string,
    inputState: Partial<DocumentProcessingState>,
    outputState: Partial<DocumentProcessingState>,
    duration: number,
    aiRequests: AIRequestLog[] = [],
    errors: string[] = [],
    metadata: any = {},
  ) {
    console.log("WorkflowRecorder.recordStep called:", {
      stepName,
      hasCurrentRecording: !!this.currentRecording,
      recordingId: this.currentRecording?.recordingId,
      currentStepsCount: this.currentRecording?.steps?.length || 0,
      duration,
      aiRequestsCount: aiRequests.length,
      errorsCount: errors.length,
    });

    if (!this.currentRecording) {
      console.log(
        "WorkflowRecorder: No current recording - cannot record step",
      );
      return;
    }

    const stepId = `${this.currentRecording.steps.length + 1}-${stepName}`;

    const step: WorkflowStep = {
      stepId,
      stepName,
      timestamp: new Date().toISOString(),
      inputState: this.sanitizeState(inputState),
      outputState: this.sanitizeState(outputState),
      duration,
      tokenUsage: outputState.tokenUsage || { total: 0 },
      aiRequests,
      errors,
      metadata: {
        nodeType: stepName,
        ...metadata,
      },
    };

    this.currentRecording.steps.push(step);
    this.currentRecording.totalDuration += duration;

    // Update total token usage
    if (step.tokenUsage.total) {
      this.currentRecording.totalTokenUsage.total += step.tokenUsage.total;
    }

    console.log("WorkflowRecorder: Step recorded successfully:", {
      stepId,
      totalSteps: this.currentRecording.steps.length,
      totalDuration: this.currentRecording.totalDuration,
      totalTokens: this.currentRecording.totalTokenUsage.total,
    });

    log.analysis.debug("Recorded workflow step", {
      stepId,
      stepName,
      duration,
      tokensUsed: step.tokenUsage.total,
      aiRequestsCount: aiRequests.length,
      errorsCount: errors.length,
    });
  }

  /**
   * Record an AI request/response pair
   */
  recordAIRequest(
    provider: string,
    model: string,
    request: any,
    response: any,
    tokenUsage: TokenUsage,
    duration: number,
  ): AIRequestLog {
    const aiRequest: AIRequestLog = {
      provider,
      model,
      timestamp: new Date().toISOString(),
      request: this.sanitizeAIRequest(request),
      response: this.sanitizeAIResponse(response),
      tokenUsage,
      duration,
    };

    return aiRequest;
  }

  /**
   * Finish recording and save to file
   */
  finishRecording(finalResult: any): string | null {
    console.log("WorkflowRecorder.finishRecording called:", {
      hasCurrentRecording: !!this.currentRecording,
      recordingId: this.currentRecording?.recordingId,
      stepsCount: this.currentRecording?.steps?.length || 0,
      finalResultExists: !!finalResult,
    });

    if (!this.currentRecording) {
      console.log("WorkflowRecorder: No current recording to finish");
      return null;
    }

    this.currentRecording.finalResult = finalResult;

    const fileName = `${this.currentRecording.recordingId}.json`;
    const filePath = join(this.debugDir, fileName);

    console.log("WorkflowRecorder: Attempting to save to:", filePath);
    console.log(
      "WorkflowRecorder: Directory exists:",
      existsSync(this.debugDir),
    );
    console.log(
      "WorkflowRecorder: Recording data size:",
      JSON.stringify(this.currentRecording).length,
      "bytes",
    );

    try {
      const jsonData = JSON.stringify(this.currentRecording, null, 2);
      console.log(
        "WorkflowRecorder: JSON serialization successful, size:",
        jsonData.length,
      );

      writeFileSync(filePath, jsonData);
      console.log("WorkflowRecorder: File write successful");

      // Verify file was actually written
      if (existsSync(filePath)) {
        console.log(
          "WorkflowRecorder: File verification successful, size:",
          require("fs").statSync(filePath).size,
        );
      } else {
        console.error(
          "WorkflowRecorder: File verification failed - file does not exist after write",
        );
      }

      log.analysis.info("Workflow recording saved", {
        file: fileName,
        steps: this.currentRecording.steps.length,
        totalDuration: this.currentRecording.totalDuration,
        totalTokens: this.currentRecording.totalTokenUsage.total,
      });

      console.log(
        "WorkflowRecorder: Recording saved successfully to:",
        filePath,
      );

      this.currentRecording = null;

      return filePath;
    } catch (error) {
      log.analysis.error("Failed to save workflow recording", error);
      console.error("WorkflowRecorder: Error saving recording:", error);
      console.error("WorkflowRecorder: Error details:", {
        name: error instanceof Error ? error.name : "Unknown",
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return null;
    }
  }

  /**
   * Load a workflow recording for replay
   */
  loadRecording(filePath: string): WorkflowRecording | null {
    try {
      // Support both absolute and relative paths
      const fullPath = filePath.startsWith("/")
        ? filePath
        : join(process.cwd(), filePath);

      if (!existsSync(fullPath)) {
        log.analysis.error("Workflow recording file not found", {
          filePath: fullPath,
        });
        return null;
      }

      const content = readFileSync(fullPath, "utf-8");
      const recording = JSON.parse(content) as WorkflowRecording;

      log.analysis.info("Loaded workflow recording", {
        recordingId: recording.recordingId,
        phase: recording.phase,
        steps: recording.steps.length,
        timestamp: recording.timestamp,
      });

      return recording;
    } catch (error) {
      log.analysis.error("Failed to load workflow recording", error);
      return null;
    }
  }

  /**
   * Check if we're in replay mode
   */
  isReplayMode(): boolean {
    return this.replayMode !== false;
  }

  /**
   * Get replay file path
   */
  getReplayFilePath(): string | false {
    return this.replayMode;
  }

  /**
   * Check if recording is enabled
   */
  isRecordingEnabled(): boolean {
    return this.recordingEnabled;
  }

  /**
   * Get current recording ID
   */
  getCurrentRecordingId(): string | null {
    return this.currentRecording?.recordingId || null;
  }

  /**
   * Sanitize state for recording (remove circular references, functions, etc.)
   */
  private sanitizeState(state: Partial<DocumentProcessingState>): any {
    return JSON.parse(
      JSON.stringify(state, (key, value) => {
        // Remove functions and circular references
        if (typeof value === "function") return "[Function]";
        if (
          key === "emitProgress" ||
          key === "emitComplete" ||
          key === "emitError"
        )
          return "[Function]";
        if (key === "progressCallback") return "[Function]";
        return value;
      }),
    );
  }

  /**
   * Sanitize AI request for recording
   */
  private sanitizeAIRequest(request: any): any {
    return {
      systemMessage:
        typeof request.systemMessage === "string"
          ? request.systemMessage
          : "[SystemMessage]",
      humanMessage: request.humanMessage,
      schema: request.schema,
      functions: request.functions,
      function_call: request.function_call,
      model: request.model,
      language: request.language,
    };
  }

  /**
   * Sanitize AI response for recording
   */
  private sanitizeAIResponse(response: any): any {
    return {
      content: response.content,
      function_call: response.function_call,
      additional_kwargs: response.additional_kwargs,
      parsedResult: response.parsedResult || response,
    };
  }
}

// Export singleton instance
export const workflowRecorder = WorkflowRecorder.getInstance();

// Helper functions for easy integration
export function startWorkflowRecording(
  phase: "extract" | "analysis",
  input: any,
): string | null {
  return workflowRecorder.startRecording(phase, input);
}

export function recordWorkflowStep(
  stepName: string,
  inputState: Partial<DocumentProcessingState>,
  outputState: Partial<DocumentProcessingState>,
  duration: number,
  aiRequests: AIRequestLog[] = [],
  errors: string[] = [],
  metadata: any = {},
) {
  workflowRecorder.recordStep(
    stepName,
    inputState,
    outputState,
    duration,
    aiRequests,
    errors,
    metadata,
  );
}

export function finishWorkflowRecording(finalResult: any): string | null {
  return workflowRecorder.finishRecording(finalResult);
}

export function isWorkflowReplayMode(): boolean {
  return workflowRecorder.isReplayMode();
}

export function isWorkflowRecordingEnabled(): boolean {
  return workflowRecorder.isRecordingEnabled();
}
