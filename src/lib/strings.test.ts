import { describe, it, expect } from "vitest";
import {
  searchOptimize,
  removeNonAlphanumeric,
  removeNonNumeric,
  removeNonAlpha,
  capitalizeFirstLetters,
} from "./strings";

describe("searchOptimize", () => {
  it("lowercases ASCII input", () => {
    expect(searchOptimize("HELLO World")).toBe("hello world");
  });

  it("strips diacritics", () => {
    expect(searchOptimize("Příliš žluťoučký kůň")).toBe("prilis zlutoucky kun");
  });

  it("strips German umlauts by decomposition (ä → a)", () => {
    expect(searchOptimize("Ärger")).toBe("arger");
    expect(searchOptimize("über")).toBe("uber");
  });

  it("preserves non-latin letters that have no diacritics to strip", () => {
    expect(searchOptimize("日本語")).toBe("日本語");
  });

  it("returns empty string for empty input", () => {
    expect(searchOptimize("")).toBe("");
  });
});

describe("removeNonAlphanumeric", () => {
  it("strips whitespace, punctuation, and symbols", () => {
    expect(removeNonAlphanumeric("Hello, World! 123")).toBe("HelloWorld123");
  });
  it("keeps alphanumeric ASCII only", () => {
    expect(removeNonAlphanumeric("a1 b2-c3_d4")).toBe("a1b2c3d4");
  });
  it("strips unicode letters (by design — ASCII-only alphanumeric)", () => {
    expect(removeNonAlphanumeric("café")).toBe("caf");
  });
  it("returns empty for empty input", () => {
    expect(removeNonAlphanumeric("")).toBe("");
  });
});

describe("removeNonNumeric", () => {
  it("keeps digits only", () => {
    expect(removeNonNumeric("Phone: +420 123-456-789")).toBe("420123456789");
  });
  it("returns empty for non-digit-only input", () => {
    expect(removeNonNumeric("abc")).toBe("");
  });
});

describe("removeNonAlpha", () => {
  it("keeps ASCII letters only", () => {
    expect(removeNonAlpha("abc123!@#DEF")).toBe("abcDEF");
  });
  it("strips digits and whitespace", () => {
    expect(removeNonAlpha("1 2 3")).toBe("");
  });
});

describe("capitalizeFirstLetters", () => {
  it("capitalizes the first letter of each word", () => {
    expect(capitalizeFirstLetters("john doe")).toBe("John Doe");
  });

  it("lowercases shouted input before capitalizing", () => {
    expect(capitalizeFirstLetters("JOHN DOE")).toBe("John Doe");
  });

  it("handles hyphenated names", () => {
    expect(capitalizeFirstLetters("jean-luc picard")).toBe("Jean-Luc Picard");
  });

  it("capitalizes diacritical letters (Č, Ž, Ü)", () => {
    expect(capitalizeFirstLetters("čtvrtek")).toBe("Čtvrtek");
    expect(capitalizeFirstLetters("über müller")).toBe("Über Müller");
  });

  it("trims surrounding whitespace", () => {
    expect(capitalizeFirstLetters("  hello world  ")).toBe("Hello World");
  });

  it("returns empty string unchanged", () => {
    expect(capitalizeFirstLetters("")).toBe("");
  });
});
