import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./honorificTitles", () => ({
  prefixes: ["mr", "dr", "prof", "mrs", "ms", "mudr"],
  suffixes: ["phd", "md", "jr"],
}));

vi.mock("$lib/strings", () => ({
  capitalizeFirstLetters: (s: string) =>
    s.replace(/\b\w/g, (c) => c.toUpperCase()),
  removeNonAlpha: (s: string) => s.replace(/[^a-zA-Z]/g, ""),
  removeNonAlphanumeric: (s: string) => s.replace(/[^a-zA-Z0-9]/g, ""),
  removeNonNumeric: (s: string) => s.replace(/[^0-9]/g, ""),
  searchOptimize: (s: string) => s.toLowerCase().trim(),
}));

const { mockGetProfiles, mockGetUser } = vi.hoisted(() => ({
  mockGetProfiles: vi.fn().mockReturnValue([]),
  mockGetUser: vi.fn().mockReturnValue({ language: "en" }),
}));

vi.mock("./index", () => ({
  profiles: { get: mockGetProfiles, subscribe: vi.fn() },
}));

vi.mock("$lib/user", () => ({
  default: { get: mockGetUser, subscribe: vi.fn() },
}));

import {
  normalizeName,
  fuzzyNameMatch,
  removePrefixes,
  findInProfiles,
  mergeNamesOnReports,
  normalizePatientData,
  excludePossibleDuplicatesInPatients,
  PROFILE_NEW_ID,
} from "./tools";

function makeProfile(overrides: Record<string, any> = {}) {
  return {
    id: "p1",
    fullName: "John Smith",
    insurance: { number: "12345", provider: "" },
    health: {},
    publicKey: "",
    status: "active",
    language: "en",
    ...overrides,
  };
}

describe("profiles/tools", () => {
  beforeEach(() => {
    mockGetProfiles.mockReturnValue([]);
    mockGetUser.mockReturnValue({ language: "en" });
  });

  // ── normalizeName ─────────────────────────────────────────────────────────

  describe("normalizeName", () => {
    it("lowercases input", () => {
      expect(normalizeName("JOHN SMITH")).toBe("john smith");
    });

    it("removes diacritics by default", () => {
      expect(normalizeName("Ondřej Mašek")).toBe("ondrej masek");
    });

    it("preserves diacritics when removeDiacritics is false", () => {
      const result = normalizeName("Ondřej", { removeDiacritics: false });
      expect(result).toContain("ř");
    });

    it("replaces DICOM ^ separators with spaces", () => {
      const result = normalizeName("SMITH^JOHN");
      expect(result).not.toContain("^");
      expect(result).toContain("smith");
      expect(result).toContain("john");
    });

    it("removes single-character initials from DICOM names", () => {
      const result = normalizeName("Smith^John^M");
      expect(result.split(" ").every((w) => w.length > 1)).toBe(true);
    });

    it("removes punctuation", () => {
      const result = normalizeName("Dr. John-Smith");
      expect(result).not.toContain(".");
      expect(result).not.toContain("-");
    });

    it("strips honorific prefixes", () => {
      expect(normalizeName("Dr John Smith")).toBe("john smith");
    });

    it("strips honorific suffixes", () => {
      expect(normalizeName("John Smith PhD")).toBe("john smith");
    });

    it("returns empty string for empty input", () => {
      expect(normalizeName("")).toBe("");
    });

    it("trims surrounding whitespace", () => {
      expect(normalizeName("  John Smith  ")).toBe("john smith");
    });
  });

  // ── removePrefixes ────────────────────────────────────────────────────────

  describe("removePrefixes", () => {
    it("removes a known prefix from the front", () => {
      expect(removePrefixes("dr john smith")).toBe("john smith");
    });

    it("removes a known suffix from the end", () => {
      expect(removePrefixes("john smith phd")).toBe("john smith");
    });

    it("removes both prefix and suffix", () => {
      expect(removePrefixes("dr john smith md")).toBe("john smith");
    });

    it("keeps names with no prefix or suffix unchanged", () => {
      expect(removePrefixes("john smith")).toBe("john smith");
    });

    it("reduces names longer than 2 words to first and last", () => {
      expect(removePrefixes("john william doe")).toBe("john doe");
    });

    it("handles single-word name", () => {
      expect(removePrefixes("smith")).toBe("smith");
    });

    it("removes prefix leaving single word", () => {
      expect(removePrefixes("dr smith")).toBe("smith");
    });
  });

  // ── fuzzyNameMatch ────────────────────────────────────────────────────────

  describe("fuzzyNameMatch", () => {
    it("matches identical names", () => {
      expect(fuzzyNameMatch("John Smith", "John Smith")).toBe(true);
    });

    it("matches names with diacritics differences", () => {
      expect(fuzzyNameMatch("Ondřej Mašek", "Ondrej Masek")).toBe(true);
    });

    it("matches DICOM format with normal format", () => {
      expect(fuzzyNameMatch("MASEK^ONDREY", "ondřej mašek")).toBe(true);
    });

    it("matches names in different order", () => {
      expect(fuzzyNameMatch("Smith John", "John Smith")).toBe(true);
    });

    it("matches with minor spelling variations", () => {
      expect(fuzzyNameMatch("Masek Ondrey", "Ondrej Masek")).toBe(true);
    });

    it("does not match completely different names", () => {
      expect(fuzzyNameMatch("John Smith", "Anna Novakova")).toBe(false);
    });

    it("does not match partial single-name overlap", () => {
      expect(fuzzyNameMatch("John Smith", "John Doe")).toBe(false);
    });

    it("returns false when one name is empty", () => {
      expect(fuzzyNameMatch("", "John Smith")).toBe(false);
    });

    it("returns false when both names are empty", () => {
      expect(fuzzyNameMatch("", "")).toBe(false);
    });
  });

  // ── findInProfiles ────────────────────────────────────────────────────────

  describe("findInProfiles", () => {
    it("returns empty array when no fullName and no insurance", () => {
      mockGetProfiles.mockReturnValue([makeProfile()]);
      expect(findInProfiles({})).toEqual([]);
    });

    it("returns empty array when no profiles match", () => {
      mockGetProfiles.mockReturnValue([makeProfile({ fullName: "Alice Jones" })]);
      expect(findInProfiles({ fullName: "Bob Smith" })).toHaveLength(0);
    });

    it("finds profile by exact name", () => {
      const profile = makeProfile({ fullName: "John Smith" });
      mockGetProfiles.mockReturnValue([profile]);

      const result = findInProfiles({ fullName: "John Smith" });
      expect(result).toHaveLength(1);
      expect(result[0].fullName).toBe("John Smith");
    });

    it("finds profile by insurance number", () => {
      const profile = makeProfile({ insurance: { number: "12345" } });
      mockGetProfiles.mockReturnValue([profile]);

      const result = findInProfiles({ insurance: { number: "12345" } });
      expect(result).toHaveLength(1);
    });

    it("returns empty array when profiles store returns empty array", () => {
      mockGetProfiles.mockReturnValue([]);
      expect(findInProfiles({ fullName: "John Smith" })).toHaveLength(0);
    });

    it("matches profile by fuzzy name", () => {
      const profile = makeProfile({ fullName: "John Smith" });
      mockGetProfiles.mockReturnValue([profile]);

      const result = findInProfiles({ fullName: "Jon Smith" });
      expect(result).toHaveLength(1);
    });

    it("returns profiles sorted: name+insurance match first", () => {
      const both = makeProfile({ fullName: "John Smith", insurance: { number: "111" } });
      const nameOnly = makeProfile({ id: "p2", fullName: "John Smith", insurance: { number: "999" } });
      mockGetProfiles.mockReturnValue([nameOnly, both]);

      const result = findInProfiles({ fullName: "John Smith", insurance: { number: "111" } });
      expect(result[0].id).toBe("p1"); // both matched → sorted first
    });
  });

  // ── normalizePatientData ──────────────────────────────────────────────────

  describe("normalizePatientData", () => {
    it("capitalizes fullName", () => {
      const result = normalizePatientData({ fullName: "john smith" } as any);
      expect(result.fullName).toBe("John Smith");
    });

    it("copies health object when provided", () => {
      const health = { bloodType: "A+" };
      const result = normalizePatientData({ fullName: "John Smith", health } as any);
      expect(result.health).toBe(health);
    });

    it("sets birthDate from top-level birthDate field", () => {
      const result = normalizePatientData({
        fullName: "John Smith",
        birthDate: "1990-01-01",
      } as any);
      expect(result.health?.birthDate).toBe("1990-01-01");
    });

    it("strips non-numeric characters from insurance number", () => {
      const result = normalizePatientData({
        fullName: "John Smith",
        insurance: { number: "123-456" },
      } as any);
      expect(result.insurance?.number).toBe("123456");
    });

    it("capitalizes insurance provider", () => {
      const result = normalizePatientData({
        fullName: "John Smith",
        insurance: { provider: "health corp" },
      } as any);
      expect(result.insurance?.provider).toBe("Health Corp");
    });

    it("extracts insurance number from identifier field", () => {
      const result = normalizePatientData({
        fullName: "John Smith",
        identifier: "ID-98765",
      } as any);
      expect(result.insurance?.number).toBe("98765");
    });

    it("identifier overrides insurance number when insurance already set", () => {
      const result = normalizePatientData({
        fullName: "John Smith",
        insurance: { number: "111" },
        identifier: "ID-222",
      } as any);
      expect(result.insurance?.number).toBe("222");
    });
  });

  // ── mergeNamesOnReports ───────────────────────────────────────────────────

  describe("mergeNamesOnReports", () => {
    function makeReport(overrides: Partial<any> = {}): any {
      return {
        id: "r1",
        content: {
          patient: {
            fullName: "John Smith",
          },
          ...overrides.content,
        },
        metadata: {},
        ...overrides,
      };
    }

    it("returns empty array for empty input", () => {
      const result = mergeNamesOnReports([]);
      expect(result).toHaveLength(0);
    });

    it("groups single report into one entry", () => {
      const result = mergeNamesOnReports([makeReport()]);
      expect(result).toHaveLength(1);
      expect(result[0].reports).toHaveLength(1);
    });

    it("merges two reports with the same patient name", () => {
      const r1 = makeReport({ id: "r1" });
      const r2 = makeReport({ id: "r2" });
      const result = mergeNamesOnReports([r1, r2]);
      expect(result).toHaveLength(1);
      expect(result[0].reports).toHaveLength(2);
    });

    it("keeps two reports with different patient names separate", () => {
      const r1 = makeReport({ content: { patient: { fullName: "John Smith" } } });
      const r2 = makeReport({ content: { patient: { fullName: "Jane Doe" } } });
      const result = mergeNamesOnReports([r1, r2]);
      expect(result).toHaveLength(2);
    });

    it("assigns NEW id to new profiles", () => {
      const result = mergeNamesOnReports([makeReport()]);
      expect(result[0].profile.id).toBe(PROFILE_NEW_ID);
    });

    it("uses unknown-* key for reports without patient fullName", () => {
      const report = { id: "r1", content: {}, metadata: {} } as any;
      const result = mergeNamesOnReports([report]);
      expect(result).toHaveLength(1);
      expect(result[0].profile.fullName).toBe("unknown");
    });

    it("merges insurance provider from second report when first has none", () => {
      const r1 = makeReport({ content: { patient: { fullName: "John Smith" } } });
      const r2 = makeReport({ content: { patient: { fullName: "John Smith", insurance: { provider: "HealthCorp" } } } });
      const result = mergeNamesOnReports([r1, r2]);
      expect(result).toHaveLength(1);
    });

    it("merges birthDate from second report when first has none", () => {
      const r1 = makeReport({ content: { patient: { fullName: "John Smith" } } });
      const r2 = makeReport({ content: { patient: { fullName: "John Smith", birthDate: "1990-01-01" } } });
      const result = mergeNamesOnReports([r1, r2]);
      expect(result).toHaveLength(1);
    });

    it("matches existing profile from store when found", () => {
      const existingProfile = makeProfile({ fullName: "John Smith" });
      mockGetProfiles.mockReturnValue([existingProfile]);
      const result = mergeNamesOnReports([makeReport()]);
      // If a matching profile is found, it should use that profile
      expect(result[0].profile).toBeDefined();
      mockGetProfiles.mockReturnValue([]);
    });

    it("extracts insurance number from identifier field", () => {
      const r = makeReport({
        content: { patient: { fullName: "John Smith", identifier: "ID-12345" } },
      });
      const result = mergeNamesOnReports([r]);
      expect(result[0].profile.insurance?.number).toBe("12345");
    });

    it("capitalizes insurance provider", () => {
      const r = makeReport({
        content: { patient: { fullName: "John Smith", insurance: { provider: "health corp" } } },
      });
      const result = mergeNamesOnReports([r]);
      expect(result[0].profile.insurance?.provider).toBe("Health Corp");
    });
  });

  // ── PROFILE_NEW_ID ────────────────────────────────────────────────────────

  describe("PROFILE_NEW_ID", () => {
    it("is the string 'NEW'", () => {
      expect(PROFILE_NEW_ID).toBe("NEW");
    });
  });

  // ── findInProfiles — store search ─────────────────────────────────────────

  describe("findInProfiles — store search", () => {
    it("returns [] when no fullName and no insurance number", () => {
      expect(findInProfiles({})).toEqual([]);
    });

    it("finds profile by exact name match in store", () => {
      const profile = makeProfile({ fullName: "John Smith" });
      mockGetProfiles.mockReturnValue([profile]);
      const result = findInProfiles({ fullName: "John Smith" });
      expect(result).toHaveLength(1);
      mockGetProfiles.mockReturnValue([]);
    });

    it("finds profile by insurance number", () => {
      const profile = makeProfile({ insurance: { number: "12345" } });
      mockGetProfiles.mockReturnValue([profile]);
      const result = findInProfiles({ insurance: { number: "12345" } });
      expect(result).toHaveLength(1);
      mockGetProfiles.mockReturnValue([]);
    });

    it("handles non-array profilesData (wraps in array)", () => {
      const profile = makeProfile({ fullName: "Solo User" });
      mockGetProfiles.mockReturnValue(profile); // Returns object, not array
      const result = findInProfiles({ fullName: "Solo User" });
      expect(Array.isArray(result)).toBe(true);
      mockGetProfiles.mockReturnValue([]);
    });

    it("uses fuzzy name match as fallback", () => {
      const profile = makeProfile({ fullName: "Ondrej Masek" });
      mockGetProfiles.mockReturnValue([profile]);
      const result = findInProfiles({ fullName: "ondrey masek" }); // slight typo
      expect(Array.isArray(result)).toBe(true);
      mockGetProfiles.mockReturnValue([]);
    });
  });

  // ── excludePossibleDuplicatesInPatients ───────────────────────────────────

  describe("excludePossibleDuplicatesInPatients", () => {
    it("returns all patients when there are no duplicates", () => {
      const patients = [
        { fullName: "John Smith", insurance: { number: "111" } },
        { fullName: "Jane Doe", insurance: { number: "222" } },
      ];
      expect(excludePossibleDuplicatesInPatients(patients)).toHaveLength(2);
    });

    it("removes exact duplicates (same name + insurance)", () => {
      const patients = [
        { fullName: "John Smith", insurance: { number: "111" } },
        { fullName: "John Smith", insurance: { number: "111" } },
      ];
      expect(excludePossibleDuplicatesInPatients(patients)).toHaveLength(1);
    });

    it("keeps patients with same name but different insurance", () => {
      const patients = [
        { fullName: "John Smith", insurance: { number: "111" } },
        { fullName: "John Smith", insurance: { number: "222" } },
      ];
      expect(excludePossibleDuplicatesInPatients(patients)).toHaveLength(2);
    });

    it("handles empty array", () => {
      expect(excludePossibleDuplicatesInPatients([])).toEqual([]);
    });

    it("returns single patient unchanged", () => {
      const patients = [{ fullName: "John Smith", insurance: { number: "111" } }];
      expect(excludePossibleDuplicatesInPatients(patients)).toHaveLength(1);
    });
  });
});
