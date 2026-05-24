import { describe, it, expect } from "vitest";
import { prefixes, suffixes } from "./honorificTitles";

describe("honorificTitles", () => {
  describe("prefixes", () => {
    it("is a non-empty array of strings", () => {
      expect(Array.isArray(prefixes)).toBe(true);
      expect(prefixes.length).toBeGreaterThan(50);
      expect(prefixes.every((p) => typeof p === "string")).toBe(true);
    });

    it("contains common English titles", () => {
      expect(prefixes).toContain("mr");
      expect(prefixes).toContain("mrs");
      expect(prefixes).toContain("ms");
      expect(prefixes).toContain("dr");
      expect(prefixes).toContain("prof");
    });

    it("contains European medical/academic titles", () => {
      expect(prefixes).toContain("mudr");
      expect(prefixes).toContain("judr");
      expect(prefixes).toContain("rndr");
      expect(prefixes).toContain("phdr");
      expect(prefixes).toContain("ing");
    });

    it("contains multi-language titles", () => {
      expect(prefixes).toContain("herr"); // German
      expect(prefixes).toContain("monsieur"); // French
      expect(prefixes).toContain("señor"); // Spanish
      expect(prefixes).toContain("signore"); // Italian
    });

    it("all entries are lowercase", () => {
      for (const p of prefixes) {
        expect(p).toBe(p.toLowerCase());
      }
    });
  });

  describe("suffixes", () => {
    it("is a non-empty array of strings", () => {
      expect(Array.isArray(suffixes)).toBe(true);
      expect(suffixes.length).toBeGreaterThan(30);
      expect(suffixes.every((s) => typeof s === "string")).toBe(true);
    });

    it("contains generational suffixes", () => {
      expect(suffixes).toContain("jr");
      expect(suffixes).toContain("sr");
      expect(suffixes).toContain("ii");
      expect(suffixes).toContain("iii");
    });

    it("contains academic degrees", () => {
      expect(suffixes).toContain("phd");
      expect(suffixes).toContain("md");
      expect(suffixes).toContain("mba");
      expect(suffixes).toContain("msc");
    });

    it("contains honorary titles", () => {
      expect(suffixes).toContain("cbe");
      expect(suffixes).toContain("obe");
      expect(suffixes).toContain("mbe");
    });

    it("all entries are lowercase", () => {
      for (const s of suffixes) {
        expect(s).toBe(s.toLowerCase());
      }
    });
  });
});
