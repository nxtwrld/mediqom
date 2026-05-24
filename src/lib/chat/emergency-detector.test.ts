import { describe, it, expect } from "vitest";
import { detectEmergency } from "./emergency-detector";

describe("detectEmergency — English", () => {
  it.each([
    ["I have chest pain and shortness of breath", ["cardiac", "respiratory"]],
    ["I think I'm having a heart attack", ["cardiac"]],
    ["I can't breathe properly", ["respiratory"]],
    ["I want to die", ["mental_health"]],
    ["I took an overdose", ["poisoning"]],
    ["severe bleeding everywhere", ["trauma"]],
    ["he is unconscious", ["neurological"]],
    ["grandma had a seizure", ["neurological"]],
    ["he had a stroke", ["neurological"]],
    ["child is choking", ["respiratory"]],
  ])("detects %s", (message, expectedCategories) => {
    const result = detectEmergency(message);
    expect(result.detected).toBe(true);
    for (const cat of expectedCategories) {
      expect(result.categories).toContain(cat);
    }
    expect(result.banner).not.toBeNull();
  });

  it("returns detected:false with null banner for benign input", () => {
    const result = detectEmergency("I have a mild headache");
    expect(result.detected).toBe(false);
    expect(result.categories).toEqual([]);
    expect(result.banner).toBeNull();
  });
});

describe("detectEmergency — universal patterns", () => {
  it.each([
    "anaphylactic reaction",
    "he is suicidal",
    "call 911",
    "call 112",
    "performing CPR now",
  ])("detects universal keyword: %s", (message) => {
    const result = detectEmergency(message);
    expect(result.detected).toBe(true);
  });
});

describe("detectEmergency — multilingual", () => {
  it("detects Czech cardiac terms under language 'cs'", () => {
    const result = detectEmergency("mám bolest na hrudi", "cs");
    expect(result.detected).toBe(true);
    expect(result.categories).toContain("cardiac");
  });

  it("detects German cardiac terms under language 'de'", () => {
    const result = detectEmergency("Ich habe Brustschmerzen", "de");
    expect(result.detected).toBe(true);
    expect(result.categories).toContain("cardiac");
  });

  it("cross-matches English even when language is non-English", () => {
    // User writes in English but language is set to Czech
    const result = detectEmergency("chest pain", "cs");
    expect(result.detected).toBe(true);
    expect(result.categories).toContain("cardiac");
  });

  it("normalizes BCP-47 tags (cs-CZ → cs)", () => {
    const result = detectEmergency("mám bolest na hrudi", "cs-CZ");
    expect(result.detected).toBe(true);
  });
});

describe("detectEmergency — banner format", () => {
  it("includes emergency numbers and EU/US/UK sections", () => {
    const result = detectEmergency("chest pain");
    expect(result.banner).toMatch(/EU:/);
    expect(result.banner).toMatch(/US:/);
    expect(result.banner).toMatch(/UK:/);
  });

  it("returns deduplicated categories as an array", () => {
    // "chest pain" + "heart attack" both map to cardiac — should appear once
    const result = detectEmergency("chest pain and heart attack");
    expect(result.detected).toBe(true);
    const cardiacCount = result.categories.filter((c) => c === "cardiac").length;
    expect(cardiacCount).toBe(1);
  });
});
