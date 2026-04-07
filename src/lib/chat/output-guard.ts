/**
 * Chat Output Guard
 *
 * Post-processes AI responses in patient/caregiver mode to detect
 * potentially harmful content like medication dosages or prohibited terms.
 * Appends safety disclaimers when such content is detected.
 */

import { safetyText } from "./safety/i18n-server";

/** Pattern matching medication dosages like "500 mg", "10 ml", "2.5mg" */
const DOSAGE_PATTERN = /\b\d+(?:\.\d+)?\s*(?:mg|ml|mcg|μg|iu|units?|tablets?|capsules?|drops?)\b/i;

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
  response: string;
  disclaimerAdded: boolean;
  flags: string[];
}

/**
 * Scan AI response for patient/caregiver mode safety concerns.
 * Only applies in patient or caregiver mode.
 *
 * @param response - The AI response to check
 * @param mode - The chat mode ("patient", "caregiver", "clinical")
 * @param language - Language code for localized disclaimer. Defaults to "en".
 */
export function guardOutput(
  response: string,
  mode: string,
  language = "en",
): GuardResult {
  // Only apply in patient/caregiver mode
  if (mode === "clinical") {
    return { response, disclaimerAdded: false, flags: [] };
  }

  const flags: string[] = [];

  if (DOSAGE_PATTERN.test(response)) {
    flags.push("medication_dosage_detected");
  }

  for (const pattern of PROHIBITED_TERMS) {
    if (pattern.test(response)) {
      flags.push("prohibited_diagnostic_term");
      break;
    }
  }

  const disclaimerAdded = flags.length > 0;
  const disclaimer = safetyText("chat.safety.disclaimer", language);
  const finalResponse = disclaimerAdded
    ? response + `\n\n---\n*${disclaimer}*`
    : response;

  return { response: finalResponse, disclaimerAdded, flags };
}
