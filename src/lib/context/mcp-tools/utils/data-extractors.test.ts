import { describe, it, expect } from "vitest";
import {
  extractMedicationData,
  extractTestResults,
  extractTimelineEvents,
  extractConditionsFromSearchResults,
  extractProceduresFromSearchResults,
  extractAllergiesFromSearchResults,
  extractVitalSigns,
  extractKeyFindings,
  identifyRiskFactors,
} from "./data-extractors";

describe("extractMedicationData", () => {
  it("returns [] when no search results mention medications", () => {
    const result = extractMedicationData([
      { excerpt: "just a follow-up visit" },
    ]);
    expect(result).toEqual([]);
  });

  it("extracts a medication from 'prescribed X' content", () => {
    const result = extractMedicationData([
      {
        // content must include one of: "medication", "prescription", "drug"
        excerpt:
          "Prescription filled; prescribed Amoxicillin at the visit.",
        metadata: { author: "Dr Smith", date: "2024-01-15" },
      },
    ]);
    expect(result.length).toBe(1);
    expect(result[0].name).toBe("Amoxicillin");
    expect(result[0].status).toBe("active");
    expect(result[0].prescribedBy).toBe("Dr Smith");
  });

  it("keys on 'medication' keyword in content", () => {
    const result = extractMedicationData([
      { excerpt: "Current medication Lisinopril daily" },
    ]);
    expect(result[0].name).toBe("Lisinopril");
  });
});

describe("extractTestResults", () => {
  it("returns [] when nothing mentions tests/results/lab", () => {
    const result = extractTestResults([{ excerpt: "general checkup" }]);
    expect(result).toEqual([]);
  });

  it("extracts test result with numeric value", () => {
    const result = extractTestResults([
      {
        excerpt: "Lab result 42 mg/dL",
        metadata: { title: "Glucose", date: "2024-03-01" },
      },
    ]);
    expect(result.length).toBe(1);
    expect(result[0].name).toBe("Glucose");
    expect(result[0].value).toBe("42");
  });
});

describe("extractTimelineEvents", () => {
  it("skips results without a date", () => {
    const result = extractTimelineEvents([
      { excerpt: "no date here" },
      { excerpt: "has date", metadata: { date: "2024-01-01" } },
    ]);
    expect(result.length).toBe(1);
  });

  it("sorts events chronologically (oldest first)", () => {
    const result = extractTimelineEvents([
      { metadata: { date: "2024-06-01" }, documentId: "b" },
      { metadata: { date: "2024-01-01" }, documentId: "a" },
      { metadata: { date: "2024-12-01" }, documentId: "c" },
    ]);
    expect(result.map((e) => e.documentId)).toEqual(["a", "b", "c"]);
  });
});

describe("extractConditionsFromSearchResults", () => {
  it("extracts a diagnosis name and passes through metadata", () => {
    const result = extractConditionsFromSearchResults([
      {
        excerpt: "Diagnosis: Hypertension confirmed",
        metadata: { date: "2024-02-01" },
        documentId: "doc-1",
      },
    ]);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].name.toLowerCase()).toContain("hypertension");
    expect(result[0].documentId).toBe("doc-1");
    expect(result[0].date).toBe("2024-02-01");
  });

  it("picks up severity when present", () => {
    const result = extractConditionsFromSearchResults([
      { excerpt: "Diagnosis: Asthma; severity mild" },
    ]);
    expect(result[0].severity).toBe("mild");
  });

  it("ignores content without diagnosis keywords", () => {
    const result = extractConditionsFromSearchResults([
      { excerpt: "routine checkup, all normal" },
    ]);
    expect(result).toEqual([]);
  });
});

describe("extractProceduresFromSearchResults", () => {
  it("extracts procedure entries with outcome", () => {
    const result = extractProceduresFromSearchResults([
      {
        excerpt: "Surgery was successful with no complications",
        metadata: { title: "Appendectomy", date: "2024-04-01" },
        documentId: "p-1",
      },
    ]);
    expect(result[0].name).toBe("Appendectomy");
    expect(result[0].outcome).toBe("successful");
  });
});

describe("extractAllergiesFromSearchResults", () => {
  it("extracts the allergen name after 'allergic to'", () => {
    const result = extractAllergiesFromSearchResults([
      { excerpt: "Patient is allergic to peanuts; severe reaction" },
    ]);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].substance.toLowerCase()).toContain("peanuts");
    expect(result[0].severity).toBe("severe");
  });

  it("ignores results without allergy keywords", () => {
    const result = extractAllergiesFromSearchResults([
      { excerpt: "Vitals within normal limits" },
    ]);
    expect(result).toEqual([]);
  });
});

describe("extractVitalSigns", () => {
  it("extracts blood pressure and flags normal range", () => {
    const result = extractVitalSigns([
      { excerpt: "Blood pressure: 120/80 on exam" },
    ]);
    const bp = result.find((v) => v.type === "blood_pressure");
    expect(bp).toBeDefined();
    expect(bp?.value).toBe("120/80");
    expect(bp?.normal).toBe(true);
  });

  it("flags elevated blood pressure as abnormal", () => {
    const result = extractVitalSigns([
      { excerpt: "Blood pressure: 160/100" },
    ]);
    const bp = result.find((v) => v.type === "blood_pressure");
    expect(bp?.normal).toBe(false);
  });

  it("extracts heart rate as a number and flags range", () => {
    const result = extractVitalSigns([
      { excerpt: "Heart rate: 75 bpm" },
    ]);
    const hr = result.find((v) => v.type === "heart_rate");
    expect(hr?.value).toBe(75);
    expect(hr?.normal).toBe(true);
  });

  it("flags elevated heart rate as abnormal", () => {
    const result = extractVitalSigns([
      { excerpt: "Heart rate: 150" },
    ]);
    expect(result.find((v) => v.type === "heart_rate")?.normal).toBe(false);
  });

  it("extracts temperature as a float and flags range", () => {
    const result = extractVitalSigns([
      { excerpt: "Temperature: 36.8" },
    ]);
    const temp = result.find((v) => v.type === "temperature");
    expect(temp?.value).toBe(36.8);
    expect(temp?.normal).toBe(true);
  });

  it("flags fever as abnormal temperature", () => {
    const result = extractVitalSigns([
      { excerpt: "Temperature: 39.5" },
    ]);
    expect(result.find((v) => v.type === "temperature")?.normal).toBe(false);
  });
});

describe("extractKeyFindings", () => {
  it("returns at most 5 findings", () => {
    const results = Array.from({ length: 10 }, (_, i) => ({
      metadata: { title: `Finding ${i}` },
      excerpt: `detail ${i}`,
    }));
    expect(extractKeyFindings(results).length).toBe(5);
  });

  it("formats each finding as 'Title: excerpt...'", () => {
    const findings = extractKeyFindings([
      { metadata: { title: "Lab Alert" }, excerpt: "High glucose" },
    ]);
    expect(findings[0]).toContain("Lab Alert:");
    expect(findings[0]).toContain("High glucose");
  });
});

describe("identifyRiskFactors", () => {
  it("deduplicates risk factors across results", () => {
    const result = identifyRiskFactors([
      { excerpt: "has diabetes and smoking history" },
      { excerpt: "long-standing diabetes, also hypertension" },
    ]);
    expect(result).toContain("diabetes");
    expect(result).toContain("smoking");
    expect(result).toContain("hypertension");
    // Ensure no duplicates
    expect(new Set(result).size).toBe(result.length);
  });

  it("returns empty array when no risk keywords match", () => {
    expect(identifyRiskFactors([{ excerpt: "healthy patient" }])).toEqual([]);
  });
});
