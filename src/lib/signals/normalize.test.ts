import { describe, it, expect } from "vitest";
import {
  normalizeUnit,
  normalizeSignalEntry,
} from "./normalize";

describe("normalizeUnit", () => {
  it("returns empty string for falsy input", () => {
    expect(normalizeUnit("")).toBe("");
  });

  it.each([
    ["bpm", "beats/min"],
    ["mm hg", "mmHg"],
    ["mmhg", "mmHg"],
    ["mg/dl", "mg/dL"],
    ["g/dl", "g/dL"],
    ["µg/l", "µg/L"],
    ["ug/l", "µg/L"],
    ["nmol/l", "nmol/L"],
    ["pmol/l", "pmol/L"],
    ["mmol/l", "mmol/L"],
    ["µmol/l", "µmol/L"],
    ["umol/l", "µmol/L"],
    ["miu/l", "mIU/L"],
    ["u/l", "U/L"],
    ["iu/l", "U/L"],
    ["g/l", "g/L"],
    ["mg/l", "mg/L"],
    ["ml/min/1.73m2", "mL/min/1.73m²"],
    ["breaths/minute", "breaths/min"],
    ["kg/m2", "kg/m²"],
    ["beats per minute", "beats/min"],
    ["mm/h", "mm/hr"],
  ])("maps '%s' → '%s'", (raw, canonical) => {
    expect(normalizeUnit(raw)).toBe(canonical);
  });

  it("leaves unknown units unchanged", () => {
    expect(normalizeUnit("fL")).toBe("fL");
    expect(normalizeUnit("pg")).toBe("pg");
  });

  it("is case-insensitive (BPM → beats/min)", () => {
    expect(normalizeUnit("BPM")).toBe("beats/min");
  });
});

describe("normalizeSignalEntry", () => {
  const entry = {
    signal: "glucose",
    value: "5.5",
    unit: "mmol/l",
    reference: "",
    date: "2024-01-01",
    source: "input",
  };

  it("normalizes the unit field", () => {
    const result = normalizeSignalEntry(entry);
    expect(result.unit).toBe("mmol/L");
  });

  it("does not mutate the original entry", () => {
    const original = { ...entry };
    normalizeSignalEntry(entry);
    expect(entry.unit).toBe(original.unit);
  });

  it("preserves non-empty reference field", () => {
    const withRef = { ...entry, reference: "3.9-5.6" };
    const result = normalizeSignalEntry(withRef);
    expect(result.reference).toBe("3.9-5.6");
  });
});
