/**
 * Timeframe normalisation (Care Plan build row 1b).
 *
 * The primary source of a task's due date is the LLM-emitted
 * `timeframeNormalized: { unit, value }` field (see core.recommendations.ts).
 * `computeDueDate()` turns that into an ISO date. For legacy extractions that
 * only carry free-text `timeframeText`, `parseTimeframeFallback()` does a thin
 * client-side parse: chrono-node for EN, regex tables for cs/de. The fallback
 * is intentionally conservative — it returns undefined rather than guessing, so
 * "as needed" / "dle potřeby" never produce a fake due date.
 */
import * as chrono from "chrono-node";

export type TimeUnit = "days" | "weeks" | "months" | "years";
export interface NormalizedTimeframe {
  unit: TimeUnit;
  value: number;
}

const UNIT_DAYS: Record<TimeUnit, number> = {
  days: 1,
  weeks: 7,
  months: 30,
  years: 365,
};

/**
 * Compute an ISO due date from a source document date plus a normalized
 * timeframe. Returns undefined when no timeframe is given.
 */
export function computeDueDate(
  sourceDocumentDate: string,
  tf?: NormalizedTimeframe | null,
): string | undefined {
  if (!tf || !Number.isFinite(tf.value)) return undefined;
  const base = new Date(sourceDocumentDate);
  if (Number.isNaN(base.getTime())) return undefined;
  const days = Math.round(tf.value * UNIT_DAYS[tf.unit]);
  const due = new Date(base.getTime());
  due.setUTCDate(due.getUTCDate() + days);
  return due.toISOString().slice(0, 10);
}

// ── Fallback parsing for legacy free-text timeframes ─────────────────────────

interface UnitRule {
  words: string[];
  unit: TimeUnit;
  hours?: boolean; // value is in hours → convert to whole days
}

/** Build a Unicode-safe word-boundary matcher (ASCII `\b` breaks on í, ě, ů…). */
function wordRe(words: string[]): RegExp {
  const alt = words.join("|");
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alt})(?![\\p{L}\\p{N}])`, "iu");
}

const CZECH_UNITS: UnitRule[] = [
  {
    words: ["hodina", "hodiny", "hodin", "hodinách"],
    unit: "days",
    hours: true,
  },
  { words: ["den", "dny", "dní", "dnech", "dnů"], unit: "days" },
  { words: ["týden", "týdny", "týdnů", "týdnech"], unit: "weeks" },
  { words: ["měsíc", "měsíce", "měsíců", "měsících"], unit: "months" },
  { words: ["rok", "roky", "roků", "let", "letech", "roku"], unit: "years" },
];

const GERMAN_UNITS: UnitRule[] = [
  { words: ["stunde", "stunden"], unit: "days", hours: true },
  { words: ["tag", "tage", "tagen"], unit: "days" },
  { words: ["woche", "wochen"], unit: "weeks" },
  { words: ["monat", "monate", "monaten"], unit: "months" },
  { words: ["jahr", "jahre", "jahren"], unit: "years" },
];

const ENGLISH_UNITS: UnitRule[] = [
  { words: ["hour", "hours"], unit: "days", hours: true },
  { words: ["day", "days"], unit: "days" },
  { words: ["week", "weeks"], unit: "weeks" },
  { words: ["month", "months"], unit: "months" },
  { words: ["year", "years"], unit: "years" },
];

// Adverbs that imply a cadence without a number ("annually" → 1 year).
const ENGLISH_ADVERBS: Array<{ words: string[]; tf: NormalizedTimeframe }> = [
  { words: ["daily"], tf: { unit: "days", value: 1 } },
  { words: ["weekly"], tf: { unit: "weeks", value: 1 } },
  { words: ["monthly"], tf: { unit: "months", value: 1 } },
  { words: ["yearly", "annually", "annual"], tf: { unit: "years", value: 1 } },
];

// Words that explicitly mean "no schedule" — never produce a due date.
const OPEN_ENDED = wordRe([
  "as needed",
  "prn",
  "when needed",
  "if needed",
  "ongoing",
  "as required",
  "dle potřeby",
  "dle potreby",
  "podle potřeby",
  "bei bedarf",
  "nach bedarf",
]);

const HALF = wordRe([
  "half",
  "půl",
  "pul",
  "halb",
  "halbes",
  "halbe",
  "halben",
]);

const CZECH_WORD_NUMBERS: Record<string, number> = {
  jeden: 1,
  jedna: 1,
  dva: 2,
  dvě: 2,
  tři: 3,
  čtyři: 4,
  pět: 5,
  šest: 6,
  sedm: 7,
  osm: 8,
  devět: 9,
  deset: 10,
};
const GERMAN_WORD_NUMBERS: Record<string, number> = {
  ein: 1,
  eine: 1,
  einer: 1,
  einem: 1,
  zwei: 2,
  drei: 3,
  vier: 4,
  fünf: 5,
  sechs: 6,
  sieben: 7,
  acht: 8,
  neun: 9,
  zehn: 10,
};
const ENGLISH_WORD_NUMBERS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

function extractNumber(
  text: string,
  words: Record<string, number>,
): number | undefined {
  const digit = text.match(/(\d+(?:[.,]\d+)?)/);
  if (digit) {
    const n = parseFloat(digit[1].replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  for (const [w, n] of Object.entries(words)) {
    if (wordRe([w]).test(text)) return n;
  }
  return undefined;
}

function parseHalf(
  text: string,
  unit: TimeUnit,
): NormalizedTimeframe | undefined {
  // "half a year" / "půl roku" / "ein halbes Jahr"
  if (HALF.test(text)) {
    if (unit === "years") return { unit: "months", value: 6 };
    if (unit === "months") return { unit: "weeks", value: 2 };
  }
  return undefined;
}

function parseWith(
  text: string,
  units: UnitRule[],
  words: Record<string, number>,
): NormalizedTimeframe | undefined {
  for (const { words: unitWords, unit, hours } of units) {
    if (wordRe(unitWords).test(text)) {
      const half = parseHalf(text, unit);
      if (half) return half;
      const value = extractNumber(text, words);
      if (hours) {
        // Convert an hours count to whole days (rounded up, min 1).
        const days = value != null ? Math.max(1, Math.round(value / 24)) : 1;
        return { unit: "days", value: days };
      }
      if (value != null) return { unit, value };
      // unit present but no number → assume 1 ("in a week")
      return { unit, value: 1 };
    }
  }
  return undefined;
}

/**
 * Best-effort parse of a free-text timeframe into a normalized duration.
 * Returns undefined for open-ended phrases or anything unparseable.
 */
export function parseTimeframeFallback(
  text: string | undefined | null,
  locale: string = "en",
): NormalizedTimeframe | undefined {
  if (!text) return undefined;
  const trimmed = text.trim();
  if (!trimmed || OPEN_ENDED.test(trimmed)) return undefined;

  const lang = locale.slice(0, 2).toLowerCase();

  if (lang === "cs") {
    return parseWith(trimmed, CZECH_UNITS, CZECH_WORD_NUMBERS);
  }
  if (lang === "de") {
    return parseWith(trimmed, GERMAN_UNITS, GERMAN_WORD_NUMBERS);
  }

  // English: explicit unit/adverb tables are precise for clinical phrasing —
  // try them first, then fall back to chrono for natural-language phrases.
  for (const { words, tf } of ENGLISH_ADVERBS) {
    if (wordRe(words).test(trimmed)) return tf;
  }
  const direct = parseWith(trimmed, ENGLISH_UNITS, ENGLISH_WORD_NUMBERS);
  if (direct) return direct;

  const ref = new Date(Date.UTC(2000, 0, 1));
  const results = chrono.parse(trimmed, ref, { forwardDate: true });
  if (results.length && results[0].start) {
    const target = results[0].start.date();
    const diffDays = Math.round(
      (target.getTime() - ref.getTime()) / 86_400_000,
    );
    if (diffDays > 0) return daysToTimeframe(diffDays);
  }
  return parseWith(trimmed, ENGLISH_UNITS, ENGLISH_WORD_NUMBERS);
}

function daysToTimeframe(days: number): NormalizedTimeframe {
  if (days % 365 === 0) return { unit: "years", value: days / 365 };
  if (days % 30 === 0) return { unit: "months", value: days / 30 };
  if (days % 7 === 0) return { unit: "weeks", value: days / 7 };
  return { unit: "days", value: days };
}
