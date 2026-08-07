// Vercel AI Gateway seam — the single place chat talks to an LLM via the AI SDK.
// Provider-agnostic: the model is a plain "provider/model" gateway slug, so switching
// models is just changing a string. Reuses existing JSON-Schema FunctionDefinitions via
// jsonSchema() — no Zod rewrite of the schema configs.
//
// Auth: resolved by @ai-sdk/gateway from AI_GATEWAY_API_KEY, or VERCEL_OIDC_TOKEN on Vercel.

import { generateObject, jsonSchema } from "ai";
import type { ModelMessage } from "ai";
import type { Content, TokenUsage } from "$lib/ai/types.d";
import { log } from "$lib/logging/logger";

const aiLogger = log.analysis;

/** Minimal shape we consume from the existing LangChain-style schema configs. */
export interface StructuredSchema {
  name?: string;
  description?: string;
  parameters: Record<string, unknown>;
}

export interface GenerateStructuredOptions {
  /** Gateway "provider/model" slug (e.g. "openai/gpt-5.4"). */
  model: string;
  /** Language name for the system instruction (e.g. "English"). */
  language?: string;
  temperature?: number;
  /** Accumulates token usage in place (same contract as the legacy provider). */
  tokenUsage?: TokenUsage;
  /** End-user id for gateway spend attribution + per-user rate limiting. */
  userId?: string;
  /** Gateway tags for cost attribution (e.g. ["feature:chat"]). */
  tags?: string[];
}

/**
 * Medical language-instruction system message. Mirrors the instruction the legacy
 * enhanced-abstraction layer prepended, so switching to the gateway keeps behavior.
 */
function buildSystemInstruction(language: string): string {
  return `You are a medical AI assistant. You MUST respond in ${language} language ONLY. All free-text fields in your response must be in ${language}. Do not use any other language for free-text content. This is critical - strictly follow the language requirement. IMPORTANT EXCEPTION: When the JSON schema defines an "enum" array for a field, you MUST use the exact enum values as provided - never translate enum values.`;
}

/** Map the app's Content[] into AI SDK user-message content parts. */
function toUserContent(content: Content[]) {
  return content.map((item) => {
    if (item.type === "image_url" && item.image_url?.url) {
      return { type: "image" as const, image: item.image_url.url };
    }
    return { type: "text" as const, text: item.text ?? "" };
  });
}

/**
 * Structured generation via the AI Gateway. Returns the parsed object in the same shape
 * callers already expect from the legacy analyzeDocument() (schema-shaped JSON).
 */
export async function generateStructured(
  content: Content[],
  schema: StructuredSchema,
  options: GenerateStructuredOptions,
): Promise<any> {
  const language = options.language || "English";
  const startTime = Date.now();

  const messages: ModelMessage[] = [
    { role: "system", content: buildSystemInstruction(language) },
    { role: "user", content: toUserContent(content) },
  ];

  aiLogger.info("Gateway request", {
    model: options.model,
    function: schema.name,
    language,
    temperature: options.temperature ?? 0,
  });

  const result = await generateObject({
    model: options.model,
    schema: jsonSchema(schema.parameters),
    messages,
    temperature: options.temperature ?? 0,
    providerOptions: {
      gateway: {
        // Route only to providers that do not train on prompt data (PHI safety).
        disallowPromptTraining: true,
        ...(options.userId ? { user: options.userId } : {}),
        ...(options.tags ? { tags: options.tags } : {}),
      },
    },
  });

  const tokens = result.usage?.totalTokens ?? 0;
  if (options.tokenUsage) {
    options.tokenUsage.total += tokens;
    if (schema.description) {
      options.tokenUsage[schema.description] = tokens;
    }
  }

  aiLogger.info("Gateway response", {
    model: options.model,
    function: schema.name,
    tokens,
    executionTime: Date.now() - startTime,
  });

  return result.object;
}
