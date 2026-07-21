/**
 * Chat Output Guard — Regex Pre-Filter
 *
 * Scans AI responses for potential safety concerns using regex patterns.
 * Returns flags only — disclaimer decisions are made by the LLM guard.
 */

import { logger } from "$lib/logging/logger";

const log = logger.namespace("OutputGuard");

/** Pattern matching medication dosages like "500 mg", "10 ml", "2.5mg" */
const DOSAGE_PATTERN = /\b\d+(?:\.\d+)?\s*(?:mg|ml|mcg|μg|iu|units?|tablets?|capsules?|drops?)\b/gi;

/** Prohibited diagnostic terms in patient/caregiver mode */
const PROHIBITED_TERMS = [
  /\bcancer\b/i,
  /\btumou?r\b/i,
  /\bmalignant\b/i,
  /\bmalignancy\b/i,
  /\bmetastas/i,
  /\bcarcinoma\b/i,
  /\bsarcoma\b/i,
  /\blymphoma\b/i,
  /\bleukemia\b/i,
  /\bmelanoma\b/i,
];

export interface GuardResult {
  flags: string[];
  matches: string[];
}

/**
 * Scan AI response for potential safety concerns using regex.
 * Returns flags and matched strings for the LLM guard to validate.
 * Only applies in patient or caregiver mode.
 */
export function guardOutput(
  response: string,
  mode: string,
): GuardResult {
  if (mode === "clinical") {
    return { flags: [], matches: [] };
  }

  const flags: string[] = [];
  const matches: string[] = [];

  const dosageMatches = response.match(DOSAGE_PATTERN);
  if (dosageMatches) {
    flags.push("medication_dosage_detected");
    matches.push(...dosageMatches);
  }

  for (const pattern of PROHIBITED_TERMS) {
    const termMatch = response.match(pattern);
    if (termMatch) {
      flags.push("prohibited_diagnostic_term");
      matches.push(termMatch[0]);
      break;
    }
  }

  if (flags.length > 0) {
    log.debug("Regex pre-filter flags", { flags, matches });
  }

  return { flags, matches };
}
