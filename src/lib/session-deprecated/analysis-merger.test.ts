import { describe, it, expect, beforeEach } from "vitest";
import { AnalysisMerger } from "./analysis-merger";

describe("session-deprecated/analysis-merger", () => {
  let merger: AnalysisMerger;

  beforeEach(() => {
    merger = new AnalysisMerger();
  });

  // ── constructor ───────────────────────────────────────────────────────────

  describe("constructor", () => {
    it("creates instance with empty state", () => {
      expect(merger.getItems("diagnosis")).toHaveLength(0);
      expect(merger.getItems("treatment")).toHaveLength(0);
      expect(merger.getItems("medication")).toHaveLength(0);
    });

    it("initializes all item type collections", () => {
      const stats = merger.getStats();
      expect(stats).toHaveProperty("diagnosis");
      expect(stats).toHaveProperty("treatment");
      expect(stats).toHaveProperty("medication");
      expect(stats).toHaveProperty("followUp");
      expect(stats).toHaveProperty("clarifyingQuestions");
      expect(stats).toHaveProperty("doctorRecommendations");
    });
  });

  // ── mergeItemArray — new items ────────────────────────────────────────────

  describe("mergeItemArray - new items", () => {
    it("returns empty result when no items passed", () => {
      const result = merger.mergeItemArray([], "diagnosis");
      expect(result.items).toHaveLength(0);
      expect(result.hasNewItems).toBe(false);
      expect(result.hasUpdatedItems).toBe(false);
      expect(result.summary).toEqual({ added: 0, updated: 0, total: 0 });
    });

    it("adds new diagnosis items with isNew=true", () => {
      const result = merger.mergeItemArray([{ name: "Hypertension" }], "diagnosis");
      expect(result.items).toHaveLength(1);
      expect(result.hasNewItems).toBe(true);
      expect(result.items[0].isNew).toBe(true);
      expect(result.items[0].isUpdated).toBe(false);
      expect(result.summary.added).toBe(1);
      expect(result.summary.updated).toBe(0);
    });

    it("adds new treatment items", () => {
      const result = merger.mergeItemArray([{ description: "Physical therapy" }], "treatment");
      expect(result.items).toHaveLength(1);
      expect(result.items[0].isNew).toBe(true);
    });

    it("adds new medication items using name+dosage key", () => {
      const result = merger.mergeItemArray(
        [{ name: "Aspirin", dosage: "100mg" }],
        "medication",
      );
      expect(result.items).toHaveLength(1);
      expect(result.items[0].isNew).toBe(true);
    });

    it("adds multiple items in one call", () => {
      const result = merger.mergeItemArray(
        [{ name: "Flu" }, { name: "Diabetes" }],
        "diagnosis",
      );
      expect(result.items).toHaveLength(2);
      expect(result.summary.added).toBe(2);
      expect(result.summary.total).toBe(2);
    });

    it("persists items across calls", () => {
      merger.mergeItemArray([{ name: "Flu" }], "diagnosis");
      const result = merger.mergeItemArray([{ name: "Diabetes" }], "diagnosis");
      expect(result.items).toHaveLength(2);
    });

    it("embeds stable id in item data", () => {
      const result = merger.mergeItemArray([{ name: "Hypertension" }], "diagnosis");
      expect(result.items[0].data.id).toBeDefined();
    });

    it("sets updateCount to 1 for new items", () => {
      const result = merger.mergeItemArray([{ name: "Flu" }], "diagnosis");
      expect(result.items[0].updateCount).toBe(1);
    });

    it("handles null items array gracefully", () => {
      const result = merger.mergeItemArray(null as any, "diagnosis");
      expect(result.items).toHaveLength(0);
    });
  });

  // ── mergeItemArray — updates ──────────────────────────────────────────────

  describe("mergeItemArray - updates (same ID)", () => {
    it("updates existing item when same name added again", () => {
      merger.mergeItemArray([{ name: "Hypertension", probability: 0.6 }], "diagnosis");
      const result = merger.mergeItemArray(
        [{ name: "Hypertension", probability: 0.9 }],
        "diagnosis",
      );
      expect(result.items).toHaveLength(1);
      expect(result.hasUpdatedItems).toBe(true);
      expect(result.summary.updated).toBe(1);
      expect(result.summary.added).toBe(0);
    });

    it("sets isUpdated=true and isNew=false on update", () => {
      merger.mergeItemArray([{ name: "Hypertension" }], "diagnosis");
      const result = merger.mergeItemArray([{ name: "Hypertension" }], "diagnosis");
      const item = result.items[0];
      expect(item.isNew).toBe(false);
      expect(item.isUpdated).toBe(true);
    });

    it("increments updateCount on re-insertion", () => {
      merger.mergeItemArray([{ name: "Flu" }], "diagnosis");
      merger.mergeItemArray([{ name: "Flu" }], "diagnosis");
      const result = merger.mergeItemArray([{ name: "Flu" }], "diagnosis");
      const item = result.items.find((i) => i.data.name === "Flu");
      expect(item?.updateCount).toBe(3);
    });

    it("merges data from new item into existing", () => {
      merger.mergeItemArray([{ name: "Flu", severity: "mild" }], "diagnosis");
      const result = merger.mergeItemArray(
        [{ name: "Flu", severity: "moderate", newField: "value" }],
        "diagnosis",
      );
      const item = result.items[0];
      expect(item.data.newField).toBe("value");
    });
  });

  // ── mergeItemArray — similarity matching ──────────────────────────────────

  describe("mergeItemArray - similarity matching", () => {
    it("matches similar (typo) diagnosis names as same item", () => {
      merger.mergeItemArray([{ name: "hypertension" }], "diagnosis");
      const result = merger.mergeItemArray(
        [{ name: "hypertensoon" }], // 1 char diff
        "diagnosis",
      );
      // Should merge rather than add new
      expect(result.items).toHaveLength(1);
      expect(result.hasUpdatedItems).toBe(true);
    });

    it("does not merge completely different diagnosis names", () => {
      merger.mergeItemArray([{ name: "Hypertension" }], "diagnosis");
      const result = merger.mergeItemArray([{ name: "Diabetes" }], "diagnosis");
      expect(result.items).toHaveLength(2);
    });
  });

  // ── getItems ──────────────────────────────────────────────────────────────

  describe("getItems", () => {
    it("returns empty array for unknown type", () => {
      expect(merger.getItems("nonexistent")).toHaveLength(0);
    });

    it("returns stored items for known type", () => {
      merger.mergeItemArray([{ name: "Flu" }], "diagnosis");
      expect(merger.getItems("diagnosis")).toHaveLength(1);
    });
  });

  // ── getItemsData ──────────────────────────────────────────────────────────

  describe("getItemsData", () => {
    it("returns data field of each stored item", () => {
      merger.mergeItemArray([{ name: "Flu", probability: 0.8 }], "diagnosis");
      const data = merger.getItemsData("diagnosis");
      expect(data).toHaveLength(1);
      expect(data[0].name).toBe("Flu");
      expect(data[0].probability).toBe(0.8);
    });

    it("returns empty array when no items", () => {
      expect(merger.getItemsData("treatment")).toHaveLength(0);
    });
  });

  // ── clear ─────────────────────────────────────────────────────────────────

  describe("clear", () => {
    it("removes all stored items", () => {
      merger.mergeItemArray([{ name: "Flu" }], "diagnosis");
      merger.mergeItemArray([{ description: "Therapy" }], "treatment");
      merger.clear();
      expect(merger.getItems("diagnosis")).toHaveLength(0);
      expect(merger.getItems("treatment")).toHaveLength(0);
    });

    it("re-initializes all type collections after clear", () => {
      merger.clear();
      const stats = merger.getStats();
      expect(Object.keys(stats)).toHaveLength(6);
    });

    it("allows adding items after clear", () => {
      merger.mergeItemArray([{ name: "Flu" }], "diagnosis");
      merger.clear();
      const result = merger.mergeItemArray([{ name: "Flu" }], "diagnosis");
      expect(result.items[0].isNew).toBe(true);
    });
  });

  // ── getStats ──────────────────────────────────────────────────────────────

  describe("getStats", () => {
    it("returns zero stats when empty", () => {
      const stats = merger.getStats();
      expect(stats.diagnosis.total).toBe(0);
      expect(stats.diagnosis.new).toBe(0);
      expect(stats.diagnosis.updated).toBe(0);
    });

    it("reflects added items in stats", () => {
      merger.mergeItemArray([{ name: "Flu" }, { name: "Diabetes" }], "diagnosis");
      const stats = merger.getStats();
      expect(stats.diagnosis.total).toBe(2);
    });

    it("calculates avgConfidence from item confidence fields", () => {
      merger.mergeItemArray(
        [{ name: "Flu", probability: 0.8 }, { name: "Diabetes", probability: 0.6 }],
        "diagnosis",
      );
      const stats = merger.getStats();
      expect(stats.diagnosis.avgConfidence).toBeCloseTo(0.7);
    });
  });

  // ── item type key extraction ──────────────────────────────────────────────

  describe("item type key extraction", () => {
    it("uses question field for clarifyingQuestions type", () => {
      merger.mergeItemArray([{ question: "Are you allergic?" }], "clarifyingQuestions");
      merger.mergeItemArray([{ question: "Are you allergic?" }], "clarifyingQuestions");
      expect(merger.getItems("clarifyingQuestions")).toHaveLength(1);
    });

    it("uses recommendation field for doctorRecommendations type", () => {
      merger.mergeItemArray([{ recommendation: "Take rest" }], "doctorRecommendations");
      merger.mergeItemArray([{ recommendation: "Take rest" }], "doctorRecommendations");
      expect(merger.getItems("doctorRecommendations")).toHaveLength(1);
    });

    it("uses name field for followUp type", () => {
      merger.mergeItemArray([{ name: "Follow up in 2 weeks" }], "followUp");
      merger.mergeItemArray([{ name: "Follow up in 2 weeks" }], "followUp");
      expect(merger.getItems("followUp")).toHaveLength(1);
    });
  });
});
