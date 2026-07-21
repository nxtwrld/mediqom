/**
 * Plain-language translation cache + helper (Care Plan build row 7k).
 *
 * Lookup order for a clinical string:
 *   1. i18n dictionary key `medical.icd10.<code>.plain` — free, consistent for
 *      common conditions that the locale files cover over time.
 *   2. On-item cache `item.plainLanguage[field]` (valid while the source hash
 *      and UI language match).
 *   3. LLM rewrite via /v1/careplan/plain-language, cached back onto the item.
 *
 * Steps 1–2 and the hashing are pure and unit-tested; step 3 is an async
 * boundary the caller wires through `apiFetch`.
 */
import { apiFetch } from "$lib/api/client";
import type { CarePlanItem, PlainLanguageCache } from "./types";

export type PlainLanguageField =
  | "diagnosisDescription"
  | "taskText"
  | "goalText";

/** Stable, fast non-crypto hash (djb2) for cache invalidation. */
export function sourceHash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++)
    h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** i18n key for an ICD-10 plain-language string (user-pinned convention). */
export function icd10PlainKey(code: string): string {
  return `medical.icd10.${code.replace(/\./g, "_").toLowerCase()}.plain`;
}

/** A cache entry is valid when both the source hash and language still match. */
export function getCachedPlain(
  cache: PlainLanguageCache | undefined,
  field: string,
  source: string,
  language: string,
): string | undefined {
  const entry = cache?.[field];
  if (!entry) return undefined;
  if (entry.language !== language) return undefined;
  if (entry.sourceHash !== sourceHash(source)) return undefined;
  return entry.text;
}

/** Translation function abstracted for testability — returns the i18n value or
 * the key itself when missing (svelte-i18n behaviour). */
export type TranslateFn = (key: string) => string;

/**
 * Resolve a plain-language string. Pure resolution of steps 1–2; falls through
 * to the LLM endpoint only on a miss. The caller passes the i18n `t` function
 * and is responsible for persisting any new cache entry via the store.
 */
export async function resolvePlainLanguage(args: {
  item: Pick<CarePlanItem, "diagnosisCode" | "plainLanguage">;
  field: PlainLanguageField;
  source: string;
  language: string;
  t: TranslateFn;
  fetchFn?: typeof globalThis.fetch;
}): Promise<{
  text: string;
  fromCache: boolean;
  cacheEntry?: PlainLanguageCache[string];
}> {
  const { item, field, source, language, t } = args;

  // 1. i18n dictionary (only for diagnosis descriptions with an ICD-10 code).
  if (field === "diagnosisDescription" && item.diagnosisCode) {
    const key = icd10PlainKey(item.diagnosisCode);
    const value = t(key);
    if (value && value !== key) return { text: value, fromCache: true };
  }

  // 2. On-item cache.
  const cached = getCachedPlain(item.plainLanguage, field, source, language);
  if (cached) return { text: cached, fromCache: true };

  // 3. LLM rewrite.
  const res = await apiFetch("/v1/careplan/plain-language", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: source, language }),
    fetch: args.fetchFn,
  });
  if (!res.ok) return { text: source, fromCache: false };
  const data = (await res.json()) as { text?: string };
  const text = data.text?.trim() || source;
  return {
    text,
    fromCache: false,
    cacheEntry: { text, sourceHash: sourceHash(source), language },
  };
}
