import { describe, it, expect } from "vitest";

// Inline pure functions to test without store/module side effects

const prefixes = [
  "mr", "mrs", "ms", "dr", "prof", "sir", "madam", "mdm", "rev", "hon",
];
const suffixes = ["jr", "sr", "ii", "iii", "iv", "phd", "md", "esq"];

function removePrefixes(name: string): string {
  let words = name.split(/\s+/);
  while (words.length > 0 && prefixes.includes(words[0])) words.shift();
  while (words.length > 0 && suffixes.includes(words[words.length - 1]))
    words.pop();
  if (words.length > 2) words = [words[0], words[words.length - 1]];
  return words.join(" ");
}

function normalizeName(
  name: string,
  options: { removeDiacritics?: boolean } = {},
): string {
  const opt = Object.assign({ removeDiacritics: true }, options);
  if (opt.removeDiacritics)
    name = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  name = name.toLowerCase().trim();
  name = name.replace(/\^/g, " ");
  name = name.replace(/[.,\/#!$%&\*;:{}=\-_`~()]/g, "");
  name = name
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .join(" ");
  return removePrefixes(name);
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function namePartsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen <= 2) return a === b;
  const threshold = Math.max(1, Math.floor(maxLen * 0.3));
  return levenshteinDistance(a, b) <= threshold;
}

function fuzzyNameMatch(nameA: string, nameB: string): boolean {
  const partsA = normalizeName(nameA).split(/\s+/).filter(Boolean);
  const partsB = normalizeName(nameB).split(/\s+/).filter(Boolean);
  if (partsA.length === 0 || partsB.length === 0) return false;
  const [shorter, longer] =
    partsA.length <= partsB.length ? [partsA, partsB] : [partsB, partsA];
  const used = new Set<number>();
  let matchCount = 0;
  for (const partS of shorter) {
    for (let i = 0; i < longer.length; i++) {
      if (used.has(i)) continue;
      if (namePartsMatch(partS, longer[i])) {
        used.add(i);
        matchCount++;
        break;
      }
    }
  }
  return matchCount === shorter.length;
}

describe("normalizeName", () => {
  it("handles DICOM caret-separated names", () => {
    expect(normalizeName("Masek^ondrey")).toBe("masek ondrey");
  });

  it("removes diacritics", () => {
    expect(normalizeName("Ondřej Mašek")).toBe("ondrej masek");
  });

  it("lowercases and trims", () => {
    expect(normalizeName("  John SMITH  ")).toBe("john smith");
  });

  it("removes prefixes and suffixes", () => {
    expect(normalizeName("Dr. John Smith Jr.")).toBe("john smith");
  });

  it("keeps only first and last when more than 2 words", () => {
    expect(normalizeName("John Michael Smith")).toBe("john smith");
  });

  it("removes single-character initials from DICOM names", () => {
    expect(normalizeName("Smith^John^M")).toBe("smith john");
  });
});

describe("fuzzyNameMatch", () => {
  it("matches DICOM name to normal name with diacritics", () => {
    expect(fuzzyNameMatch("Masek^ondrey", "Ondřej Mašek")).toBe(true);
  });

  it("matches same name exactly", () => {
    expect(fuzzyNameMatch("John Smith", "John Smith")).toBe(true);
  });

  it("matches reversed name order", () => {
    expect(fuzzyNameMatch("Smith John", "John Smith")).toBe(true);
  });

  it("matches with diacritics differences", () => {
    expect(fuzzyNameMatch("Ondrej Masek", "Ondřej Mašek")).toBe(true);
  });

  it("matches with minor transliteration differences", () => {
    expect(fuzzyNameMatch("Masek Ondrey", "Ondrej Masek")).toBe(true);
  });

  it("does not match completely different names", () => {
    expect(fuzzyNameMatch("John Smith", "Anna Novakova")).toBe(false);
  });

  it("does not match partial single-name overlap", () => {
    expect(fuzzyNameMatch("John Smith", "John Doe")).toBe(false);
  });

  it("handles DICOM format with multiple carets", () => {
    expect(fuzzyNameMatch("Smith^John^M", "John Smith")).toBe(true);
  });

  it("handles case differences", () => {
    expect(fuzzyNameMatch("MASEK^ONDREY", "ondřej mašek")).toBe(true);
  });
});

describe("levenshteinDistance", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshteinDistance("abc", "abc")).toBe(0);
  });

  it("computes correct distance for ondrey/ondrej", () => {
    expect(levenshteinDistance("ondrey", "ondrej")).toBe(1);
  });

  it("handles empty strings", () => {
    expect(levenshteinDistance("", "abc")).toBe(3);
    expect(levenshteinDistance("abc", "")).toBe(3);
  });
});
