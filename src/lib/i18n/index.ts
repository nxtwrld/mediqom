import { init, register, _, t as svelteT, locale } from "svelte-i18n";
import { get } from "svelte/store";
import {
  getLanguageEnglishName as getEnglishName,
} from "$lib/languages";

const defaultLocale = "en";

register("en", () => import("./locales/en.json"));
register("cs", () => import("./locales/cs-CZ.json"));
register("de", () => import("./locales/de-DE.json"));
register("it", () => import("./locales/it-IT.json"));
register("es", () => import("./locales/es-ES.json"));
register("pl", () => import("./locales/pl-PL.json"));
register("tr", () => import("./locales/tr-TR.json"));

init({
  fallbackLocale: defaultLocale,
  // Don't set initial locale here - it will be set in the layout based on user preference
  // This prevents the flicker from default to user language
});

function getLocale() {
  return get(locale);
}

function getLanguage() {
  return get(svelteT)("languages." + getLocale());
}

function getLanguageEnglishName() {
  const locale = getLocale();
  return locale ? getEnglishName(locale) : "English";
}

// Flexible wrapper around svelte-i18n's t function to accept any parameters
const t = svelteT as unknown as typeof svelteT & {
  (id: string, values?: Record<string, any>): string;
};

export { _, t, getLocale, getLanguage, getLanguageEnglishName };
