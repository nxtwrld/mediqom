import { describe, it, expect, beforeEach } from "vitest";
import { normalizeBodyPartRef, unionMergeBodyParts } from "./bodyparts";
import {
  resetUnresolvedAnatomyCount,
  getUnresolvedAnatomyCount,
} from "$data/anatomy-aliases";
import type { CarePlanBodyPartRef, ExtractedBodyPart } from "./types";

describe("normalizeBodyPartRef", () => {
  beforeEach(() => resetUnresolvedAnatomyCount());

  it("validates a mesh and computes its rollup parent", () => {
    expect(normalizeBodyPartRef("R_patella")).toEqual({
      identification: "R_patella",
      part: "R_knee",
    });
  });

  it("returns a region id with no part (it is its own parent)", () => {
    expect(normalizeBodyPartRef("R_knee")).toEqual({
      identification: "R_knee",
    });
  });

  it("returns null and counts unknown ids", () => {
    expect(normalizeBodyPartRef("not_a_mesh")).toBeNull();
    expect(getUnresolvedAnatomyCount()).toBe(1);
  });

  it("returns null for empty input without counting", () => {
    expect(normalizeBodyPartRef("")).toBeNull();
    expect(getUnresolvedAnatomyCount()).toBe(0);
  });
});

describe("unionMergeBodyParts", () => {
  it("adds a new body part with its source", () => {
    const incoming: ExtractedBodyPart[] = [
      { identification: "R_patella", urgency: 3, status: "active" },
    ];
    const out = unionMergeBodyParts([], incoming, "doc1");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      identification: "R_patella",
      part: "R_knee",
      urgency: 3,
      status: "active",
      sources: ["doc1"],
    });
  });

  it("takes the max urgency and unions sources across documents", () => {
    const existing: CarePlanBodyPartRef[] = [
      {
        identification: "R_patella",
        part: "R_knee",
        urgency: 2,
        sources: ["doc1"],
      },
    ];
    const incoming: ExtractedBodyPart[] = [
      { identification: "R_patella", urgency: 4 },
    ];
    const out = unionMergeBodyParts(existing, incoming, "doc2");
    expect(out).toHaveLength(1);
    expect(out[0].urgency).toBe(4);
    expect(out[0].sources).toEqual(["doc1", "doc2"]);
  });

  it("does not lower urgency when the new value is smaller", () => {
    const existing: CarePlanBodyPartRef[] = [
      { identification: "R_patella", urgency: 5, sources: ["doc1"] },
    ];
    const out = unionMergeBodyParts(
      existing,
      [{ identification: "R_patella", urgency: 1 }],
      "doc2",
    );
    expect(out[0].urgency).toBe(5);
  });

  it("clamps out-of-range urgency", () => {
    const out = unionMergeBodyParts(
      [],
      [{ identification: "heart", urgency: 9 }],
      "d",
    );
    expect(out[0].urgency).toBe(5);
  });

  it("drops unknown body parts", () => {
    const out = unionMergeBodyParts(
      [],
      [{ identification: "bogus", urgency: 3 }],
      "d",
    );
    expect(out).toEqual([]);
  });

  it("does not duplicate a source already present", () => {
    const existing: CarePlanBodyPartRef[] = [
      { identification: "heart", urgency: 2, sources: ["doc1"] },
    ];
    const out = unionMergeBodyParts(
      existing,
      [{ identification: "heart", urgency: 2 }],
      "doc1",
    );
    expect(out[0].sources).toEqual(["doc1"]);
  });
});
