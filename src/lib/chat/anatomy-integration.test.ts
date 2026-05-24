import { describe, it, expect, vi } from "vitest";

// Stub store/UI modules that AnatomyIntegration imports at module-evaluate time.
vi.mock("./store", () => ({
  chatActions: {
    setFocusedBodyPart: vi.fn(),
    toggleAnatomyModel: vi.fn(),
  },
}));
vi.mock("$lib/ui", () => ({
  default: { emit: vi.fn(), listen: vi.fn(() => () => {}) },
}));
vi.mock("$lib/focused", () => ({
  default: { set: vi.fn() },
}));

import AnatomyIntegration from "./anatomy-integration";

describe("AnatomyIntegration.detectBodyParts", () => {
  it("detects a common body-part word", () => {
    const refs = AnatomyIntegration.detectBodyParts("my knee hurts");
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.some((r) => r.text === "knee")).toBe(true);
  });

  it("is case-insensitive (word-boundary match)", () => {
    const refs = AnatomyIntegration.detectBodyParts("KNEE PAIN");
    expect(refs.some((r) => r.text === "knee")).toBe(true);
  });

  it("does not match partial words", () => {
    // "kneecap" contains "knee" but not as a whole word with word boundaries.
    // The regex uses \b which DOES match at k-n-e-e|c boundary, so we pick a safer test.
    const refs = AnatomyIntegration.detectBodyParts("my kneepad is loose");
    // "kneepad" — \b between 'knee' and 'pad' doesn't exist (both word chars),
    // so "knee" should NOT match.
    expect(refs.some((r) => r.text === "knee")).toBe(false);
  });

  it("returns an empty array for text with no body parts", () => {
    const refs = AnatomyIntegration.detectBodyParts("I feel fine today");
    expect(refs).toEqual([]);
  });

  it("deduplicates references by bodyPartId", () => {
    const refs = AnatomyIntegration.detectBodyParts(
      "my knee is sore and my knee still hurts",
    );
    const kneeHits = refs.filter((r) => r.text === "knee");
    expect(kneeHits.length).toBe(1);
  });

  it("boosts confidence when medical context words are present", () => {
    const plain = AnatomyIntegration.detectBodyParts("my knee thing");
    const medical = AnatomyIntegration.detectBodyParts("my knee pain");
    const plainRef = plain.find((r) => r.text === "knee");
    const medRef = medical.find((r) => r.text === "knee");
    expect(medRef!.confidence).toBeGreaterThan(plainRef!.confidence);
  });

  it("confidence is capped at 1.0", () => {
    const refs = AnatomyIntegration.detectBodyParts(
      "my knee pain injury surgery condition",
    );
    const kneeRef = refs.find((r) => r.text === "knee");
    expect(kneeRef!.confidence).toBeLessThanOrEqual(1.0);
  });

  it("sorts by confidence, highest first", () => {
    const refs = AnatomyIntegration.detectBodyParts(
      "my back hurts from knee pain",
    );
    for (let i = 1; i < refs.length; i++) {
      expect(refs[i - 1].confidence).toBeGreaterThanOrEqual(refs[i].confidence);
    }
  });
});

describe("AnatomyIntegration.suggestAnatomyView", () => {
  it("returns null when no body parts are provided", () => {
    expect(AnatomyIntegration.suggestAnatomyView([])).toBeNull();
  });

  it("uses the first body part as the primary reference", () => {
    const result = AnatomyIntegration.suggestAnatomyView([
      { text: "knee", bodyPartId: "L_patella", confidence: 0.8 } as any,
      { text: "back", bodyPartId: "lumbar_spine", confidence: 0.6 } as any,
    ]);
    expect(result?.suggestion).toContain("knee");
    expect(result?.actionText).toContain("knee");
  });
});

describe("AnatomyIntegration.isValidBodyPart", () => {
  it("returns false for unknown body parts", () => {
    expect(AnatomyIntegration.isValidBodyPart("not_a_real_part")).toBe(false);
  });
});

describe("AnatomyIntegration.getRelatedBodyParts", () => {
  it("returns empty array when bodyPartId is not in any mapping", () => {
    expect(AnatomyIntegration.getRelatedBodyParts("unknown_id")).toEqual([]);
  });

  it("returns siblings but excludes the part itself", () => {
    // "knee" maps to ["L_patella", "R_patella", "cartilage_knee", "ligaments_knee"]
    const related = AnatomyIntegration.getRelatedBodyParts("L_patella");
    expect(related).toContain("R_patella");
    expect(related).toContain("cartilage_knee");
    expect(related).not.toContain("L_patella");
  });
});

describe("AnatomyIntegration.getAnatomyContext", () => {
  it("returns shape with focusedBodyParts, availableSystems, relatedParts", () => {
    const ctx = AnatomyIntegration.getAnatomyContext(["L_patella"]);
    expect(ctx).toHaveProperty("focusedBodyParts");
    expect(ctx).toHaveProperty("availableSystems");
    expect(ctx).toHaveProperty("relatedParts");
    expect(ctx.focusedBodyParts).toEqual(["L_patella"]);
  });

  it("flattens related parts across multiple body parts", () => {
    const ctx = AnatomyIntegration.getAnatomyContext(["L_patella", "R_patella"]);
    // Each patella should contribute related siblings.
    expect(ctx.relatedParts.length).toBeGreaterThan(0);
  });
});
