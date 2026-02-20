/**
 * Environment-based Logging Configuration
 * Configures the logger based on environment variables
 */

import { browser } from "$app/environment";
import { logger, LogLevel } from "$lib/logging/logger";
import * as env from "$env/static/public";

export interface LoggingConfig {
  level: LogLevel;
  namespaces: string[];
  verboseAI: boolean;
  debugSSE: boolean;
  debugStateTransitions: boolean;
  debugLangGraph: boolean;
  logAIResponses: boolean;
  enableWorkflowTracing: boolean;
}

/**
 * Parse log level from environment variable
 */
function parseLogLevel(level: string): LogLevel {
  const numLevel = parseInt(level, 10);
  if (isNaN(numLevel)) {
    return LogLevel.WARN; // Default
  }

  // Clamp to valid range
  return Math.max(0, Math.min(5, numLevel)) as LogLevel;
}

/**
 * Parse namespaces from environment variable
 */
function parseNamespaces(namespaces: string): string[] {
  if (!namespaces || namespaces.trim() === "") {
    return ["*"]; // Default to all
  }

  if (namespaces === "*") {
    return ["*"];
  }

  return namespaces
    .split(",")
    .map((ns) => ns.trim())
    .filter((ns) => ns.length > 0);
}

/**
 * Parse boolean from environment variable
 */
function parseBoolean(value: string): boolean {
  return value === "true" || value === "1";
}

/**
 * Get logging configuration from environment variables
 */
export function getLoggingConfig(): LoggingConfig {
  // Safely access env - may be undefined in certain build configurations
  const safeEnv = (env || {}) as Record<string, string | undefined>;

  return {
    level: parseLogLevel(safeEnv.PUBLIC_LOG_LEVEL || "2"),
    namespaces: parseNamespaces(safeEnv.PUBLIC_LOG_NAMESPACES || "*"),
    verboseAI: parseBoolean(safeEnv.PUBLIC_VERBOSE_AI_LOGGING || "false"),
    debugSSE: parseBoolean(safeEnv.PUBLIC_DEBUG_SSE_PROGRESS || "false"),
    debugStateTransitions: parseBoolean(
      safeEnv.PUBLIC_DEBUG_STATE_TRANSITIONS || "false",
    ),
    debugLangGraph: parseBoolean(safeEnv.PUBLIC_DEBUG_LANGGRAPH || "false"),
    logAIResponses: parseBoolean(safeEnv.PUBLIC_LOG_AI_RESPONSES || "false"),
    enableWorkflowTracing: parseBoolean(
      safeEnv.PUBLIC_ENABLE_WORKFLOW_TRACING || "false",
    ),
  };
}

/**
 * Apply logging configuration to the logger instance
 */
export function applyLoggingConfig(config?: LoggingConfig) {
  const loggingConfig = config || getLoggingConfig();

  // Set log level
  logger.setLevel(loggingConfig.level);

  // Enable namespaces
  if (loggingConfig.namespaces.includes("*")) {
    logger.enableNamespaces("*");
  } else {
    logger.enableNamespaces(...loggingConfig.namespaces);
  }

  // Log the configuration (only in browser to avoid server-side spam)
  if (browser) {
    console.log("🔧 Logging configuration applied:", {
      level: LogLevel[loggingConfig.level],
      namespaces: loggingConfig.namespaces,
      verboseAI: loggingConfig.verboseAI,
      debugSSE: loggingConfig.debugSSE,
      debugStateTransitions: loggingConfig.debugStateTransitions,
      debugLangGraph: loggingConfig.debugLangGraph,
      logAIResponses: loggingConfig.logAIResponses,
      enableWorkflowTracing: loggingConfig.enableWorkflowTracing,
    });
  }
}

/**
 * Initialize logging configuration automatically
 * Call this during app startup
 */
export function initializeLogging() {
  applyLoggingConfig();
}

/**
 * Check if verbose AI logging is enabled
 */
export function isVerboseAILoggingEnabled(): boolean {
  return parseBoolean((env as any).PUBLIC_VERBOSE_AI_LOGGING || "false");
}

/**
 * Check if SSE progress debugging is enabled
 */
export function isSSEProgressDebuggingEnabled(): boolean {
  return parseBoolean((env as any).PUBLIC_DEBUG_SSE_PROGRESS || "false");
}

/**
 * Check if state transition debugging is enabled
 */
export function isStateTransitionDebuggingEnabled(): boolean {
  return parseBoolean((env as any).PUBLIC_DEBUG_STATE_TRANSITIONS || "false");
}

/**
 * Check if LangGraph debugging is enabled
 */
export function isLangGraphDebuggingEnabled(): boolean {
  return parseBoolean((env as any).PUBLIC_DEBUG_LANGGRAPH || "false");
}

/**
 * Check if AI response logging is enabled
 */
export function isAIResponseLoggingEnabled(): boolean {
  return parseBoolean((env as any).PUBLIC_LOG_AI_RESPONSES || "false");
}

/**
 * Check if workflow tracing is enabled
 */
export function isWorkflowTracingEnabled(): boolean {
  return parseBoolean((env as any).PUBLIC_ENABLE_WORKFLOW_TRACING || "false");
}

// Auto-initialize logging when this module is imported
// Wrap in try-catch to prevent initialization failures from breaking the app
try {
  initializeLogging();
} catch (e) {
  console.warn("[LoggingConfig] Failed to initialize logging:", e);
}
