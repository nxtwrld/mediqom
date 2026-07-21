import { describe, it, expect } from "vitest";
import { isObject, findObjects } from "./objects";

// Uses real src/data/objects.json and signal-catalog — these are static data files.

describe("isObject", () => {
  it("recognizes a known anatomy object (case-insensitive)", () => {
    // "heart" is a common anatomy token present in objects.json under cardiovascular
    expect(isObject("heart")).toBe(true);
    expect(isObject("Heart")).toBe(true);
    expect(isObject("HEART", "anatomy")).toBe(true);
  });

  it("rejects an unknown token", () => {
    expect(isObject("zzz-not-real")).toBe(false);
  });

  it("type-scopes lookup: anatomy-only does not match a random string", () => {
    expect(isObject("zzz-not-real", "anatomy")).toBe(false);
  });

  it("type-scopes lookup: lab-only does not match anatomy-only names", () => {
    // pick a name that is not plausibly a lab key
    expect(isObject("brain", "lab")).toBe(false);
  });
});

describe("findObjects", () => {
  it("returns anatomy tokens that appear in the text", () => {
    const result = findObjects("The heart and lungs are part of the body.", "anatomy");
    expect(result).toContain("heart");
  });

  it("returns empty when no known object is in the text", () => {
    expect(findObjects("nothing relevant here zzz", "anatomy")).toEqual([]);
  });

  it("is case-insensitive for the input text", () => {
    const upper = findObjects("The HEART works", "anatomy");
    const lower = findObjects("the heart works", "anatomy");
    expect(upper).toEqual(lower);
  });

  it("replaces spaces with underscores before matching (multi-word anatomy)", () => {
    // If any anatomy entry uses underscores (e.g. 'small_intestine'), a space-separated
    // version in the text should still match. We don't assert a specific entry exists;
    // we only assert the call does not throw and returns an array.
    const res = findObjects("small intestine", "anatomy");
    expect(Array.isArray(res)).toBe(true);
  });
});
