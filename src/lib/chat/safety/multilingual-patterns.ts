/**
 * Multilingual Emergency & Injection Patterns
 *
 * Emergency symptoms are a closed vocabulary — regex works well here.
 * Injection patterns are best-effort speed bumps, not a wall.
 */

import type { EmergencyPattern, InjectionPattern } from "./types";

// ---------------------------------------------------------------------------
// Universal patterns — terms that are similar across many languages
// ---------------------------------------------------------------------------

export const UNIVERSAL_EMERGENCY_PATTERNS: EmergencyPattern[] = [
  { pattern: /\banaphyla/i, category: "allergic" },
  { pattern: /\bsuicid/i, category: "mental_health" },
  { pattern: /\b(112|911|999|988)\b/, category: "emergency_number" },
  { pattern: /\binfarkt/i, category: "cardiac" }, // cs, de, pl, tr
  { pattern: /\b(CPR|AED)\b/i, category: "cardiac" },
];

// ---------------------------------------------------------------------------
// Language-specific emergency patterns
// ---------------------------------------------------------------------------

export const EMERGENCY_PATTERNS_ML: Record<string, EmergencyPattern[]> = {
  en: [
    { pattern: /\bchest\s+pain\b/i, category: "cardiac" },
    { pattern: /\bheart\s+attack\b/i, category: "cardiac" },
    { pattern: /\bcan'?t\s+breathe\b/i, category: "respiratory" },
    { pattern: /\bdifficulty\s+breathing\b/i, category: "respiratory" },
    { pattern: /\bshortness\s+of\s+breath\b/i, category: "respiratory" },
    { pattern: /\bkill\s+(my|him|her|them|our)self\b/i, category: "mental_health" },
    { pattern: /\bwant\s+to\s+die\b/i, category: "mental_health" },
    { pattern: /\boverdose\b/i, category: "poisoning" },
    { pattern: /\bsevere\s+bleeding\b/i, category: "trauma" },
    { pattern: /\bunconscious\b/i, category: "neurological" },
    { pattern: /\bseizure\b/i, category: "neurological" },
    { pattern: /\bstroke\b/i, category: "neurological" },
    { pattern: /\bcan'?t\s+swallow\b/i, category: "respiratory" },
    { pattern: /\bchoking\b/i, category: "respiratory" },
  ],

  cs: [
    // Cardiac
    { pattern: /\bbolest\s+(na\s+)?hrudi\b/i, category: "cardiac" },
    { pattern: /\bsr?de[cč]n[ií]\s+(z[aá]chvat|p[rř][ií]hoda)\b/i, category: "cardiac" },
    { pattern: /\btlak\s+na\s+hrudi\b/i, category: "cardiac" },
    // Respiratory
    { pattern: /\bnem[oů][zž][eu]\s+d[ýy]chat\b/i, category: "respiratory" },
    { pattern: /\bdušnost\b/i, category: "respiratory" },
    { pattern: /\bzad[ýy]ch[aá]v[aá]n[ií]\b/i, category: "respiratory" },
    // Mental health
    { pattern: /\bsebevra[zž]d/i, category: "mental_health" },
    { pattern: /\bchci\s+(um[rř][ií]t|zem[rř][ií]t)\b/i, category: "mental_health" },
    { pattern: /\bnechci\s+[zž][ií]t\b/i, category: "mental_health" },
    // Neurological
    { pattern: /\bbezv[eě]dom[ií]\b/i, category: "neurological" },
    { pattern: /\bz[aá]chvat\b/i, category: "neurological" },
    { pattern: /\bk[rř]e[cč]e\b/i, category: "neurological" },
    { pattern: /\bmozkov[aá]\s+p[rř][ií]hoda\b/i, category: "neurological" },
    // Trauma
    { pattern: /\bsiln[eé]\s+krv[aá]cen[ií]\b/i, category: "trauma" },
    // Poisoning
    { pattern: /\bp[rř]ed[aá]vkov[aá]n[ií]\b/i, category: "poisoning" },
    { pattern: /\botrava\b/i, category: "poisoning" },
    // Choking
    { pattern: /\bdušen[ií]\b/i, category: "respiratory" },
    { pattern: /\bzalknut[ií]\b/i, category: "respiratory" },
  ],

  de: [
    // Cardiac
    { pattern: /\bBrustschmerz(en)?\b/i, category: "cardiac" },
    { pattern: /\bHerzinfarkt\b/i, category: "cardiac" },
    { pattern: /\bHerzanfall\b/i, category: "cardiac" },
    // Respiratory
    { pattern: /\bkann\s+nicht\s+atmen\b/i, category: "respiratory" },
    { pattern: /\bAtemnot\b/i, category: "respiratory" },
    { pattern: /\bLuftnot\b/i, category: "respiratory" },
    { pattern: /\bErstick/i, category: "respiratory" },
    // Mental health
    { pattern: /\bSuizid/i, category: "mental_health" },
    { pattern: /\bSelbstmord/i, category: "mental_health" },
    { pattern: /\bwill\s+sterben\b/i, category: "mental_health" },
    { pattern: /\bumbringen\b/i, category: "mental_health" },
    // Neurological
    { pattern: /\bbewusstlos/i, category: "neurological" },
    { pattern: /\bKrampfanfall\b/i, category: "neurological" },
    { pattern: /\bSchlaganfall\b/i, category: "neurological" },
    // Trauma
    { pattern: /\bstarke\s+Blutung\b/i, category: "trauma" },
    { pattern: /\bschwere\s+Blutung\b/i, category: "trauma" },
    // Poisoning
    { pattern: /\b[UÜu]berdosis\b/i, category: "poisoning" },
    { pattern: /\bVergiftung\b/i, category: "poisoning" },
  ],

  it: [
    // Cardiac
    { pattern: /\bdolore\s+(al\s+)?petto\b/i, category: "cardiac" },
    { pattern: /\bdolore\s+toracico\b/i, category: "cardiac" },
    { pattern: /\binfarto\b/i, category: "cardiac" },
    { pattern: /\battacco\s+(di\s+)?cuore\b/i, category: "cardiac" },
    // Respiratory
    { pattern: /\bnon\s+(riesco\s+a\s+)?respirare\b/i, category: "respiratory" },
    { pattern: /\bdifficolt[aà]\s+(a\s+)?respirare\b/i, category: "respiratory" },
    { pattern: /\bdispnea\b/i, category: "respiratory" },
    { pattern: /\bsoffocamento\b/i, category: "respiratory" },
    // Mental health
    { pattern: /\bsuicidio\b/i, category: "mental_health" },
    { pattern: /\bvoglio\s+morire\b/i, category: "mental_health" },
    // Neurological
    { pattern: /\bincoscien/i, category: "neurological" },
    { pattern: /\bsveniment/i, category: "neurological" },
    { pattern: /\bconvulsion/i, category: "neurological" },
    { pattern: /\bictus\b/i, category: "neurological" },
    // Trauma
    { pattern: /\bemorragia\s+grave\b/i, category: "trauma" },
    // Poisoning
    { pattern: /\bsovradosaggio\b/i, category: "poisoning" },
    { pattern: /\bavvelenamento\b/i, category: "poisoning" },
  ],

  es: [
    // Cardiac
    { pattern: /\bdolor\s+(de|en\s+el)\s+pecho\b/i, category: "cardiac" },
    { pattern: /\bdolor\s+tor[aá]cico\b/i, category: "cardiac" },
    { pattern: /\binfarto\b/i, category: "cardiac" },
    { pattern: /\bataque\s+(al\s+)?coraz[oó]n\b/i, category: "cardiac" },
    // Respiratory
    { pattern: /\bno\s+puedo\s+respirar\b/i, category: "respiratory" },
    { pattern: /\bdificultad\s+para\s+respirar\b/i, category: "respiratory" },
    { pattern: /\bdisnea\b/i, category: "respiratory" },
    { pattern: /\basfixia\b/i, category: "respiratory" },
    // Mental health
    { pattern: /\bsuicidio\b/i, category: "mental_health" },
    { pattern: /\bquiero\s+morir(me)?\b/i, category: "mental_health" },
    { pattern: /\bmatarme\b/i, category: "mental_health" },
    // Neurological
    { pattern: /\binconsciente\b/i, category: "neurological" },
    { pattern: /\bconvulsi[oó]n/i, category: "neurological" },
    { pattern: /\bderrame\s+cerebral\b/i, category: "neurological" },
    { pattern: /\bictus\b/i, category: "neurological" },
    // Trauma
    { pattern: /\bhemorragia\s+grave\b/i, category: "trauma" },
    { pattern: /\bsangrado\s+severo\b/i, category: "trauma" },
    // Poisoning
    { pattern: /\bsobredosis\b/i, category: "poisoning" },
    { pattern: /\benvenenamiento\b/i, category: "poisoning" },
  ],

  pl: [
    // Cardiac
    { pattern: /\bb[oó]l\s+w\s+klatce\b/i, category: "cardiac" },
    { pattern: /\bb[oó]l\s+w\s+piersi/i, category: "cardiac" },
    { pattern: /\bzawa[lł]\s+serca\b/i, category: "cardiac" },
    // Respiratory
    { pattern: /\bnie\s+mog[eę]\s+oddycha[cć]\b/i, category: "respiratory" },
    { pattern: /\bduszno[sś][cć]\b/i, category: "respiratory" },
    { pattern: /\bbrak\s+tchu\b/i, category: "respiratory" },
    // Mental health
    { pattern: /\bsamob[oó]j/i, category: "mental_health" },
    { pattern: /\bchc[eę]\s+umrze[cć]\b/i, category: "mental_health" },
    // Neurological
    { pattern: /\bnieprzytomn/i, category: "neurological" },
    { pattern: /\bdrgawki\b/i, category: "neurological" },
    { pattern: /\budar\s+m[oó]zgu\b/i, category: "neurological" },
    // Trauma
    { pattern: /\bsilne\s+krwawienie\b/i, category: "trauma" },
    // Poisoning
    { pattern: /\bprzedawkowanie\b/i, category: "poisoning" },
    { pattern: /\bzatrucie\b/i, category: "poisoning" },
  ],

  tr: [
    // Cardiac
    { pattern: /\bg[oö][gğ][uü]s\s+a[gğ]r[iı]s[iı]\b/i, category: "cardiac" },
    { pattern: /\bkalp\s+krizi\b/i, category: "cardiac" },
    // Respiratory
    { pattern: /\bnefes\s+alam[iı]yorum\b/i, category: "respiratory" },
    { pattern: /\bnefes\s+darl[iı][gğ][iı]\b/i, category: "respiratory" },
    { pattern: /\bbo[gğ]ulma\b/i, category: "respiratory" },
    // Mental health
    { pattern: /\bintihar\b/i, category: "mental_health" },
    { pattern: /\b[oö]lmek\s+istiyorum\b/i, category: "mental_health" },
    // Neurological
    { pattern: /\bbay[iı]lma\b/i, category: "neurological" },
    { pattern: /\bbilin[cç]\s+kayb[iı]\b/i, category: "neurological" },
    { pattern: /\bnöbet\b/i, category: "neurological" },
    { pattern: /\binme\b/i, category: "neurological" },
    // Trauma
    { pattern: /\bşiddetli\s+kanama\b/i, category: "trauma" },
    // Poisoning
    { pattern: /\ba[sş][iı]r[iı]\s+doz\b/i, category: "poisoning" },
    { pattern: /\bzehirlenme\b/i, category: "poisoning" },
  ],
};

// ---------------------------------------------------------------------------
// Multilingual injection patterns (best-effort speed bumps)
// ---------------------------------------------------------------------------

export const INJECTION_PATTERNS_ML: Record<string, InjectionPattern[]> = {
  cs: [
    { pattern: /ignoruj\s+(všechny\s+)?(předchozí|dřívější)\s+(instrukce|pravidla|pokyny)/i, description: "Ignore previous instructions (CS)" },
    { pattern: /zapomeň\s+(na\s+)?(všechny\s+)?(instrukce|pravidla|pokyny)/i, description: "Forget instructions (CS)" },
    { pattern: /jsi\s+nyní\b/i, description: "You are now (CS)" },
  ],
  de: [
    { pattern: /ignorier(e|en)\s+(alle\s+)?(vorherigen|bisherigen)\s+(Anweisungen|Regeln|Instruktionen)/i, description: "Ignore previous instructions (DE)" },
    { pattern: /vergiss\s+(alle\s+)?(deine\s+)?(Anweisungen|Regeln|Instruktionen)/i, description: "Forget instructions (DE)" },
    { pattern: /du\s+bist\s+(jetzt|nun)\s+(ein|eine)\b/i, description: "You are now (DE)" },
  ],
  es: [
    { pattern: /ignora\s+(todas?\s+)?(las?\s+)?(instrucciones|reglas)\s+(anteriores|previas)/i, description: "Ignore previous instructions (ES)" },
    { pattern: /olvida\s+(todas?\s+)?(las?\s+)?(instrucciones|reglas)/i, description: "Forget instructions (ES)" },
  ],
  it: [
    { pattern: /ignora\s+(tutte?\s+)?(le\s+)?(istruzioni|regole)\s+(precedenti|sopra)/i, description: "Ignore previous instructions (IT)" },
    { pattern: /dimentica\s+(tutte?\s+)?(le\s+)?(istruzioni|regole)/i, description: "Forget instructions (IT)" },
  ],
  pl: [
    { pattern: /ignoruj\s+(wszystkie\s+)?(poprzednie|wcześniejsze)\s+(instrukcje|zasady|polecenia)/i, description: "Ignore previous instructions (PL)" },
    { pattern: /zapomnij\s+(o\s+)?(wszystkich\s+)?(instrukcjach|zasadach|poleceniach)/i, description: "Forget instructions (PL)" },
  ],
  tr: [
    { pattern: /önceki\s+(tüm\s+)?(talimatları|kuralları)\s+(yok\s+say|görmezden\s+gel)/i, description: "Ignore previous instructions (TR)" },
    { pattern: /talimatları\s+unut/i, description: "Forget instructions (TR)" },
  ],
};

/**
 * Get emergency patterns for a given language code.
 * Returns universal + language-specific patterns.
 */
export function getEmergencyPatterns(language: string): EmergencyPattern[] {
  const langKey = language.split("-")[0].toLowerCase(); // "cs-CZ" → "cs"
  const langPatterns = EMERGENCY_PATTERNS_ML[langKey] || EMERGENCY_PATTERNS_ML.en || [];
  return [...UNIVERSAL_EMERGENCY_PATTERNS, ...langPatterns];
}

/**
 * Get injection patterns for a given language code.
 * Returns language-specific patterns (English patterns are in the main sanitizer).
 */
export function getInjectionPatterns(language: string): InjectionPattern[] {
  const langKey = language.split("-")[0].toLowerCase();
  return INJECTION_PATTERNS_ML[langKey] || [];
}
