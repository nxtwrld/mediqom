import { describe, expect, it } from "vitest";
import synonyms from "./synonyms";

describe("Testing synonym matcher", () => {
  it("exact word match", () => {
    expect(synonyms("Bazofily")).toBe("basophils");
  });

  it("partial word match (prefix numbers not supported)", () => {
    expect(synonyms("03472 Bazofily")).toBeNull();
  });

  it("match order", () => {
    expect(synonyms("Bazofily -abs")).toBe("absolute_basophils");
  });
});
