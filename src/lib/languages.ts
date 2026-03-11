export const SUPPORTED_LANGUAGES = {
  en: "English",
  cs: "Czech",
  de: "German",
  it: "Italian",
  es: "Spanish",
  pl: "Polish",
  tr: "Turkish",
} as const;

export type LanguageCode = keyof typeof SUPPORTED_LANGUAGES;
export type LanguageType = LanguageCode; // backward compat for Profile.svelte

export function getLanguageEnglishName(code: string): string {
  return SUPPORTED_LANGUAGES[code as LanguageCode] ?? "English";
}

export function getSupportedLanguageNames(): string[] {
  return Object.values(SUPPORTED_LANGUAGES);
}

export default SUPPORTED_LANGUAGES;
