import { describe, it, expect } from "vitest";
import { deriveSections } from "./sections";

describe("deriveSections", () => {
  it("returns empty array for empty content", () => {
    expect(deriveSections({})).toEqual([]);
  });

  it("derives sections from featureDetectionResults flags", () => {
    const result = deriveSections({
      featureDetectionResults: {
        hasMedications: true,
        hasPrescriptions: true,
        hasImmunizations: false,
        hasSignals: true,
      },
    });
    expect(result).toContain("medications");
    expect(result).toContain("prescriptions");
    expect(result).toContain("signals");
    expect(result).not.toContain("immunizations");
  });

  it("maps all known feature flags to sections", () => {
    const result = deriveSections({
      featureDetectionResults: {
        hasMedications: true,
        hasPrescriptions: true,
        hasImmunizations: true,
        hasSignals: true,
        hasImaging: true,
        hasAllergies: true,
      },
    });
    expect(result).toEqual(
      expect.arrayContaining([
        "medications",
        "prescriptions",
        "immunizations",
        "signals",
        "imaging",
        "allergies",
      ]),
    );
  });

  it("falls back to content.medications when flag is missing", () => {
    const result = deriveSections({
      medications: { hasMedications: true },
    });
    expect(result).toContain("medications");
  });

  it("falls back to currentMedications array", () => {
    const result = deriveSections({
      medications: { currentMedications: [{ name: "Aspirin" }] },
    });
    expect(result).toContain("medications");
  });

  it("falls back to newPrescriptions array", () => {
    const result = deriveSections({
      medications: { newPrescriptions: [{ name: "Metformin" }] },
    });
    expect(result).toContain("medications");
  });

  it("does not duplicate medications if already from feature flags", () => {
    const result = deriveSections({
      featureDetectionResults: { hasMedications: true },
      medications: { hasMedications: true },
    });
    const medCount = result.filter((s) => s === "medications").length;
    expect(medCount).toBe(1);
  });

  it("ignores unknown feature flags", () => {
    const result = deriveSections({
      featureDetectionResults: { hasUnknownFeature: true },
    });
    expect(result).toEqual([]);
  });
});
