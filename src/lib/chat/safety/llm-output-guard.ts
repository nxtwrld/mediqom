/**
 * LLM-based Output Safety Guard
 *
 * Uses gpt-4o-mini to check AI responses for safety violations
 * in non-English languages where regex patterns are insufficient.
 *
 * Only runs when: language !== "en" AND mode !== "clinical"
 * Fail-open: returns null on timeout or error (falls back to regex-only).
 */

import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { OutputSafetyResult } from "./types";
import { logger } from "$lib/logging/logger";

const log = logger.namespace("LLMOutputGuard");

const SAFETY_CHECK_SYSTEM_PROMPT = `You are a medical safety classifier. Analyze the following AI assistant response and check for safety concerns.

Check for:
1. **Medication dosages** — Any specific dosage amounts (e.g. "500 mg", "2 tablety", "10 ml") in any language or format
2. **Prohibited diagnostic terms** — Direct cancer diagnoses or similar serious diagnoses presented as definitive (e.g. "rak", "Krebs", "tumore", "karcinom", "nowotwór") — only flag if the AI states the diagnosis as a fact, NOT if it's discussing test results or what a doctor said
3. **Specific treatment recommendations** — The AI recommending specific treatments, drugs, or procedures as if prescribing them

Respond with ONLY a JSON object (no markdown):
{
  "safe": true/false,
  "flags": ["list of specific concerns found, empty if safe"],
  "severity": "none" | "low" | "high"
}

Severity guide:
- "none": No concerns
- "low": Mentions dosages from existing records or mild concerns
- "high": Definitive diagnoses, specific treatment prescriptions, or dangerous dosage recommendations`;

const LLM_TIMEOUT_MS = 3000;

let cachedModel: ChatOpenAI | null = null;

function getModel(): ChatOpenAI {
  if (!cachedModel) {
    cachedModel = new ChatOpenAI({
      modelName: "gpt-4o-mini",
      temperature: 0,
      maxTokens: 256,
    });
  }
  return cachedModel;
}

/**
 * Check AI response for safety violations using an LLM.
 *
 * @returns OutputSafetyResult or null if timed out / errored (fail-open)
 */
export async function checkOutputSafety(
  response: string,
  mode: string,
  language: string,
): Promise<OutputSafetyResult | null> {
  // Only run for non-English, non-clinical
  if (language === "en" || mode === "clinical") {
    return null;
  }

  try {
    const model = getModel();

    const result = await Promise.race([
      model.invoke([
        new SystemMessage(SAFETY_CHECK_SYSTEM_PROMPT),
        new HumanMessage(`Language: ${language}\nMode: ${mode}\n\nAI Response to check:\n${response.slice(0, 2000)}`),
      ]),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), LLM_TIMEOUT_MS)),
    ]);

    if (!result) {
      log.warn("LLM output guard timed out, falling back to regex-only");
      return null;
    }

    const content = result.content.toString().trim();

    // Parse JSON response, handling potential markdown wrapping
    const jsonStr = content.replace(/^```json?\n?/, "").replace(/\n?```$/, "");
    const parsed = JSON.parse(jsonStr);

    return {
      safe: parsed.safe ?? true,
      flags: Array.isArray(parsed.flags) ? parsed.flags : [],
      severity: parsed.severity || "none",
    };
  } catch (err) {
    log.warn("LLM output guard error, falling back to regex-only:", err);
    return null;
  }
}
