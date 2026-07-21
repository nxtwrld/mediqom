import { describe, it, expect } from "vitest";
import {
  SUPPORTED_LANGUAGES,
  getLanguageEnglishName,
  getSupportedLanguageNames,
} from "./languages";

describe("SUPPORTED_LANGUAGES", () => {
  it("contains the expected minimum set of languages", () => {
    expect(SUPPORTED_LANGUAGES.en).toBe("English");
    expect(SUPPORTED_LANGUAGES.cs).toBe("Czech");
    expect(SUPPORTED_LANGUAGES.de).toBe("German");
  });
});

describe("getLanguageEnglishName", () => {
  it("returns the English name for a supported code", () => {
    expect(getLanguageEnglishName("cs")).toBe("Czech");
    expect(getLanguageEnglishName("de")).toBe("German");
  });

  it("falls back to 'English' for unknown codes", () => {
    expect(getLanguageEnglishName("xx")).toBe("English");
    expect(getLanguageEnglishName("")).toBe("English");
  });
});

describe("getSupportedLanguageNames", () => {
  it("returns all language names", () => {
    const names = getSupportedLanguageNames();
    expect(names).toContain("English");
    expect(names).toContain("Czech");
    expect(names.length).toBe(Object.keys(SUPPORTED_LANGUAGES).length);
  });
});
