/**
 * Server-side i18n helper for safety text.
 *
 * Reads from the existing locale JSON files at build time.
 * Falls back to English if a translation is missing.
 */

import en from "$lib/i18n/locales/en.json";
import cs from "$lib/i18n/locales/cs-CZ.json";
import de from "$lib/i18n/locales/de-DE.json";
import it from "$lib/i18n/locales/it-IT.json";
import es from "$lib/i18n/locales/es-ES.json";
import pl from "$lib/i18n/locales/pl-PL.json";
import tr from "$lib/i18n/locales/tr-TR.json";

const locales: Record<string, Record<string, any>> = { en, cs, de, it, es, pl, tr };

/**
 * Resolve a dot-separated key from a nested object.
 */
function resolveKey(obj: Record<string, any>, key: string): string | undefined {
  const parts = key.split(".");
  let current: any = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = current[part];
  }
  return typeof current === "string" ? current : undefined;
}

/**
 * Get a localized safety text string.
 * Falls back to English if the key is missing in the target language.
 *
 * @param key - Dot-separated key, e.g. "app.chat.safety.emergency-banner"
 * @param language - Language code, e.g. "cs", "de", "en", "cs-CZ"
 */
export function safetyText(key: string, language: string): string {
  const langKey = language.split("-")[0].toLowerCase();
  const locale = locales[langKey];

  // Callers use short keys like "chat.safety.disclaimer" — resolve with
  // and without the "app." prefix to match the locale JSON structure.
  const keys = key.startsWith("app.") ? [key] : [`app.${key}`, key];

  if (locale) {
    for (const k of keys) {
      const value = resolveKey(locale, k);
      if (value) return value;
    }
  }

  // Fallback to English
  for (const k of keys) {
    const value = resolveKey(en, k);
    if (value) return value;
  }
  return key;
}
