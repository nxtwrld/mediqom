import { describe, it, expect } from "vitest";
import { guardOutput } from "./output-guard";

describe("guardOutput — clinical mode bypass", () => {
  it("returns no flags in clinical mode, even for flagged content", () => {
    const result = guardOutput("Patient has cancer and takes 500 mg", "clinical");
    expect(result.flags).toEqual([]);
    expect(result.matches).toEqual([]);
  });
});

describe("guardOutput — dosage detection", () => {
  it.each([
    "Take 500 mg daily",
    "10 ml of solution",
    "2.5mg dose",
    "1000 mcg vitamin",
    "5 units insulin",
    "2 tablets",
    "3 drops",
  ])("flags dosage in: %s", (text) => {
    const result = guardOutput(text, "patient");
    expect(result.flags).toContain("medication_dosage_detected");
    expect(result.matches.length).toBeGreaterThan(0);
  });

  it("does not flag when no dosage is present", () => {
    const result = guardOutput("You should see a doctor", "patient");
    expect(result.flags).not.toContain("medication_dosage_detected");
  });
});

describe("guardOutput — prohibited diagnostic terms", () => {
  it.each([
    ["cancer"],
    ["tumor"],
    ["tumour"],
    ["malignant"],
    ["metastasis"],
    ["carcinoma"],
    ["sarcoma"],
    ["lymphoma"],
    ["leukemia"],
    ["melanoma"],
  ])("flags prohibited term: %s", (term) => {
    const result = guardOutput(`The report mentions ${term}`, "patient");
    expect(result.flags).toContain("prohibited_diagnostic_term");
    expect(result.matches.length).toBeGreaterThan(0);
  });

  it("flags only once even if multiple prohibited terms appear", () => {
    const result = guardOutput("Cancer and tumor mentioned", "patient");
    const prohibitedCount = result.flags.filter(
      (f) => f === "prohibited_diagnostic_term",
    ).length;
    expect(prohibitedCount).toBe(1);
  });

  it("is case-insensitive", () => {
    const lower = guardOutput("cancer diagnosis", "patient");
    const upper = guardOutput("CANCER DIAGNOSIS", "patient");
    expect(lower.flags).toContain("prohibited_diagnostic_term");
    expect(upper.flags).toContain("prohibited_diagnostic_term");
  });
});

describe("guardOutput — caregiver mode", () => {
  it("applies the same filters as patient mode", () => {
    const result = guardOutput("500 mg of cancer medication", "caregiver");
    expect(result.flags).toContain("medication_dosage_detected");
    expect(result.flags).toContain("prohibited_diagnostic_term");
  });
});

describe("guardOutput — combined flags", () => {
  it("reports both dosage and prohibited term when both present", () => {
    const result = guardOutput(
      "Chemo regimen of 500 mg for the tumor",
      "patient",
    );
    expect(result.flags).toContain("medication_dosage_detected");
    expect(result.flags).toContain("prohibited_diagnostic_term");
  });

  it("returns empty flags for benign text", () => {
    const result = guardOutput("Drink plenty of water and rest", "patient");
    expect(result.flags).toEqual([]);
    expect(result.matches).toEqual([]);
  });
});
