import { describe, it, expect } from "vitest";
import {
  generateNamespacedTags,
  parseTag,
  filterTagsByNamespace,
  getLegacyTags,
} from "./generateTags";

describe("generateNamespacedTags", () => {
  it("returns empty array for empty content", () => {
    expect(generateNamespacedTags({})).toEqual([]);
  });

  it("generates body: tags from bodyParts", () => {
    const tags = generateNamespacedTags({
      bodyParts: [
        { identification: "left knee" },
        { identification: "right shoulder" },
      ],
    });
    expect(tags).toContain("body:left knee");
    expect(tags).toContain("body:right shoulder");
  });

  it("skips bodyParts with empty identification", () => {
    const tags = generateNamespacedTags({
      bodyParts: [{ identification: "" }, { identification: "arm" }],
    });
    expect(tags).toEqual(["body:arm"]);
  });

  it("generates signal: tags from signals array", () => {
    const tags = generateNamespacedTags({
      signals: [{ signal: "Hemoglobin" }, { test: "Glucose" }],
    });
    expect(tags).toContain("signal:hemoglobin");
    expect(tags).toContain("signal:glucose");
  });

  it("handles nested signals.signals array", () => {
    const tags = generateNamespacedTags({
      signals: { signals: [{ signal: "WBC" }] },
    });
    expect(tags).toContain("signal:wbc");
  });

  it("generates dx: tags from diagnosis codes", () => {
    const tags = generateNamespacedTags({
      diagnosis: [{ code: "E11.9" }, { code: "I10" }],
    });
    expect(tags).toContain("dx:E11.9");
    expect(tags).toContain("dx:I10");
  });

  it("generates med: tags from medications", () => {
    const tags = generateNamespacedTags({
      medications: [{ name: "Aspirin" }, { name: "Metformin" }],
    });
    expect(tags).toContain("med:aspirin");
    expect(tags).toContain("med:metformin");
  });

  it("generates med: tags from prescription.medications", () => {
    const tags = generateNamespacedTags({
      prescription: { medications: [{ name: "Ibuprofen" }] },
    });
    expect(tags).toContain("med:ibuprofen");
  });

  it("generates proc: tags from procedures", () => {
    const tags = generateNamespacedTags({
      procedures: [{ name: "Appendectomy" }],
    });
    expect(tags).toContain("proc:appendectomy");
  });

  it("generates img: tag from imaging category", () => {
    const tags = generateNamespacedTags({
      imaging: { imagingCategory: "CT" },
    });
    expect(tags).toContain("img:ct");
  });

  it("generates allergy: tags", () => {
    const tags = generateNamespacedTags({
      allergies: [{ allergen: "Penicillin" }],
    });
    expect(tags).toContain("allergy:penicillin");
  });

  it("generates imm: tags from immunizations array", () => {
    const tags = generateNamespacedTags({
      immunizations: [{ name: "COVID-19" }],
    });
    expect(tags).toContain("imm:covid-19");
  });

  it("generates imm: tag from single immunization object", () => {
    const tags = generateNamespacedTags({
      immunization: { name: "Tetanus" },
    });
    expect(tags).toContain("imm:tetanus");
  });

  it("generates spec: tags from specimens", () => {
    const tags = generateNamespacedTags({
      specimens: [{ specimenType: "Blood" }],
    });
    expect(tags).toContain("spec:blood");
  });

  it("generates perf: tags from performer specialty", () => {
    const tags = generateNamespacedTags({
      performer: [{ specialty: "Cardiology" }],
    });
    expect(tags).toContain("perf:cardiology");
  });

  it("generates gene: tags (case-sensitive)", () => {
    const tags = generateNamespacedTags({
      molecular: {
        geneticVariants: [{ gene: "BRCA1" }],
      },
    });
    expect(tags).toContain("gene:BRCA1");
  });

  it("generates bio: tags from biomarkers", () => {
    const tags = generateNamespacedTags({
      molecular: {
        biomarkers: [{ biomarker: "HER2" }],
      },
    });
    expect(tags).toContain("bio:HER2");
  });

  it("generates echo: tag from study type", () => {
    const tags = generateNamespacedTags({
      echo: { studyType: "Transthoracic" },
    });
    expect(tags).toContain("echo:transthoracic");
  });

  it("generates ecg: tag from primary rhythm", () => {
    const tags = generateNamespacedTags({
      ecg: { rhythm: { primaryRhythm: "Sinus" } },
    });
    expect(tags).toContain("ecg:sinus");
  });

  it("generates rec: tags from recommendations", () => {
    const tags = generateNamespacedTags({
      recommendations: [{ category: "Follow-up" }, { category: "Imaging" }],
    });
    expect(tags).toContain("rec:follow-up");
    expect(tags).toContain("rec:imaging");
  });

  it("deduplicates tags", () => {
    const tags = generateNamespacedTags({
      bodyParts: [
        { identification: "knee" },
        { identification: "knee" },
      ],
    });
    expect(tags).toEqual(["body:knee"]);
  });

  it("handles complex document with multiple namespaces", () => {
    const tags = generateNamespacedTags({
      bodyParts: [{ identification: "heart" }],
      diagnosis: [{ code: "I25.1" }],
      medications: [{ name: "Aspirin" }],
      ecg: { rhythm: { primaryRhythm: "AFib" } },
    });
    expect(tags).toHaveLength(4);
    expect(tags).toContain("body:heart");
    expect(tags).toContain("dx:I25.1");
    expect(tags).toContain("med:aspirin");
    expect(tags).toContain("ecg:afib");
  });

  it("skips non-string values", () => {
    const tags = generateNamespacedTags({
      bodyParts: [{ identification: 123 }],
      diagnosis: [{ code: null }],
      procedures: [{ name: undefined }],
    });
    expect(tags).toEqual([]);
  });
});

describe("parseTag", () => {
  it("parses namespaced tag", () => {
    expect(parseTag("body:knee")).toEqual(["body", "knee"]);
  });

  it("parses tag with multiple colons", () => {
    expect(parseTag("dx:E11.9")).toEqual(["dx", "E11.9"]);
  });

  it("returns null namespace for unnamespaced tag", () => {
    expect(parseTag("general")).toEqual([null, "general"]);
  });

  it("returns null namespace for tag starting with colon", () => {
    expect(parseTag(":value")).toEqual([null, ":value"]);
  });

  it("returns null namespace for tag ending with colon", () => {
    expect(parseTag("ns:")).toEqual([null, "ns:"]);
  });
});

describe("filterTagsByNamespace", () => {
  const tags = ["body:knee", "body:arm", "dx:E11.9", "signal:wbc", "general"];

  it("filters to specified namespace", () => {
    expect(filterTagsByNamespace(tags, "body")).toEqual(["knee", "arm"]);
  });

  it("returns values without prefix", () => {
    expect(filterTagsByNamespace(tags, "dx")).toEqual(["E11.9"]);
  });

  it("returns empty for non-matching namespace", () => {
    expect(filterTagsByNamespace(tags, "med")).toEqual([]);
  });
});

describe("getLegacyTags", () => {
  it("returns only unnamespaced tags", () => {
    const tags = ["body:knee", "general", "dx:E11.9", "oldtag"];
    expect(getLegacyTags(tags)).toEqual(["general", "oldtag"]);
  });

  it("returns empty for all namespaced tags", () => {
    expect(getLegacyTags(["body:knee", "dx:I10"])).toEqual([]);
  });

  it("returns all for non-namespaced tags", () => {
    expect(getLegacyTags(["tag1", "tag2"])).toEqual(["tag1", "tag2"]);
  });
});
