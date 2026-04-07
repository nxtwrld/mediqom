/**
 * Emergency Symptom Detector (M2)
 *
 * Scans user messages for emergency keywords before sending to AI.
 * If detected, returns an emergency banner to prepend to the AI response.
 * Does NOT replace the AI response — augments it.
 *
 * Supports multilingual detection across 7 languages.
 */

import { getEmergencyPatterns } from "./safety/multilingual-patterns";
import { safetyText } from "./safety/i18n-server";

export interface EmergencyDetection {
  detected: boolean;
  categories: string[];
  banner: string | null;
}

/**
 * Scan a user message for emergency symptoms.
 * Returns an emergency banner string if detected, null otherwise.
 *
 * @param message - The user message to scan
 * @param language - Language code (e.g. "en", "cs", "de"). Defaults to "en".
 */
export function detectEmergency(message: string, language = "en"): EmergencyDetection {
  const categories = new Set<string>();

  // Get universal + language-specific patterns
  const patterns = getEmergencyPatterns(language);

  for (const { pattern, category } of patterns) {
    if (pattern.test(message)) {
      categories.add(category);
    }
  }

  // Also check English patterns if language is not English (users may mix languages)
  if (language !== "en") {
    const enPatterns = getEmergencyPatterns("en");
    for (const { pattern, category } of enPatterns) {
      if (pattern.test(message)) {
        categories.add(category);
      }
    }
  }

  if (categories.size === 0) {
    return { detected: false, categories: [], banner: null };
  }

  // Build localized banner
  const bannerTitle = safetyText("chat.safety.emergency-banner", language);
  const emergencyEU = safetyText("chat.safety.emergency-eu", language);
  const emergencyUS = safetyText("chat.safety.emergency-us", language);
  const emergencyUK = safetyText("chat.safety.emergency-uk", language);
  const emergencyMH = safetyText("chat.safety.emergency-mental-health", language);
  const doNotWait = safetyText("chat.safety.emergency-do-not-wait", language);

  const banner = `**${bannerTitle}**\n- **EU:** ${emergencyEU}\n- **US:** ${emergencyUS}\n- **UK:** ${emergencyUK}\n- **${emergencyMH}**\n\n*${doNotWait}*\n\n---\n\n`;

  return {
    detected: true,
    categories: [...categories],
    banner,
  };
}
