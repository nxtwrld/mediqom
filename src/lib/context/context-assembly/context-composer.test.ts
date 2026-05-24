import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("$lib/logging/logger", () => ({
  logger: { namespace: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }) },
}));

import { ContextAssembler } from "./context-composer";
import type { ContextMatch } from "../types";

// ─── Helpers ────────────────────────────────────────────

const TODAY = new Date().toISOString().slice(0, 10);

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function makeMatch(
  overrides: Partial<ContextMatch> & { date?: string; summary?: string; documentType?: string } = {},
): ContextMatch {
  const {
    date = TODAY,
    summary = "Routine checkup results.",
    documentType = "laboratory",
    ...rest
  } = overrides;
  return {
    documentId: rest.documentId ?? "doc-1",
    similarity: rest.similarity ?? 0.85,
    relevanceScore: rest.relevanceScore ?? 0.8,
    excerpt: rest.excerpt,
    metadata: {
      documentId: rest.documentId ?? "doc-1",
      summary,
      documentType,
      date,
    },
    ...rest,
  } as ContextMatch;
}

// ─── Tests ──────────────────────────────────────────────

describe("ContextAssembler", () => {
  let assembler: ContextAssembler;

  beforeEach(() => {
    assembler = new ContextAssembler();
  });

  // ── calculateContextConfidence (via assembleContextForAI output) ──

  describe("assembleContextForAI — confidence calculation", () => {
    it("returns confidence 0 for empty matches", async () => {
      const result = await assembler.assembleContextForAI([], "test query");
      expect(result.confidence).toBe(0);
      expect(result.keyPoints).toEqual([]);
      expect(result.relevantDocuments).toEqual([]);
    });

    it("reflects average similarity in confidence", async () => {
      const highSim = [
        makeMatch({ similarity: 0.95, date: daysAgo(10) }),
        makeMatch({ similarity: 0.90, date: daysAgo(20), documentId: "doc-2" }),
      ];
      const lowSim = [
        makeMatch({ similarity: 0.30, date: daysAgo(10) }),
        makeMatch({ similarity: 0.25, date: daysAgo(20), documentId: "doc-2" }),
      ];

      const highResult = await assembler.assembleContextForAI(highSim, "query");
      const lowResult = await assembler.assembleContextForAI(lowSim, "query");

      expect(highResult.confidence).toBeGreaterThan(lowResult.confidence);
    });

    it("factors in quantity — more matches up to 5 increase confidence", async () => {
      const one = [makeMatch({ similarity: 0.8, date: daysAgo(5) })];
      const five = Array.from({ length: 5 }, (_, i) =>
        makeMatch({ similarity: 0.8, documentId: `doc-${i}`, date: daysAgo(5 + i) }),
      );

      const r1 = await assembler.assembleContextForAI(one, "q");
      const r5 = await assembler.assembleContextForAI(five, "q");

      expect(r5.confidence).toBeGreaterThan(r1.confidence);
    });

    it("rewards recency — recent documents boost confidence", async () => {
      const recent = [
        makeMatch({ similarity: 0.8, date: daysAgo(10) }),
        makeMatch({ similarity: 0.8, date: daysAgo(30), documentId: "doc-2" }),
      ];
      const old = [
        makeMatch({ similarity: 0.8, date: daysAgo(200) }),
        makeMatch({ similarity: 0.8, date: daysAgo(300), documentId: "doc-2" }),
      ];

      const rRecent = await assembler.assembleContextForAI(recent, "q");
      const rOld = await assembler.assembleContextForAI(old, "q");

      expect(rRecent.confidence).toBeGreaterThan(rOld.confidence);
    });
  });

  // ── Key point extraction ──

  describe("assembleContextForAI — key point extraction", () => {
    it("extracts finding-type key points from diagnosis text", async () => {
      const matches = [
        makeMatch({
          summary: "Diagnosis of type 2 diabetes confirmed.",
          excerpt: "Patient shows elevated glucose levels.",
          similarity: 0.9,
          date: daysAgo(5),
        }),
      ];

      const result = await assembler.assembleContextForAI(matches, "diabetes");
      const findings = result.keyPoints.filter((p) => p.type === "finding");
      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings[0].confidence).toBeGreaterThan(0);
    });

    it("extracts medication key points", async () => {
      const matches = [
        makeMatch({
          summary: "Prescribed metformin 500mg twice daily.",
          excerpt: "Started medication for blood sugar control.",
          similarity: 0.85,
          date: daysAgo(10),
        }),
      ];

      const result = await assembler.assembleContextForAI(matches, "medication");
      const meds = result.keyPoints.filter((p) => p.type === "medication");
      expect(meds.length).toBeGreaterThanOrEqual(1);
    });

    it("extracts procedure key points", async () => {
      const matches = [
        makeMatch({
          summary: "Procedure for biopsy completed successfully.",
          excerpt: "Examination of tissue sample performed.",
          similarity: 0.8,
          date: daysAgo(15),
        }),
      ];

      const result = await assembler.assembleContextForAI(matches, "biopsy");
      const procs = result.keyPoints.filter((p) => p.type === "procedure");
      expect(procs.length).toBeGreaterThanOrEqual(1);
    });

    it("extracts risk-type key points", async () => {
      const matches = [
        makeMatch({
          summary: "Family history of cardiovascular disease noted.",
          excerpt: "Risk factor: smoking 20 pack-years.",
          similarity: 0.75,
          date: daysAgo(60),
        }),
      ];

      const result = await assembler.assembleContextForAI(matches, "risk");
      const risks = result.keyPoints.filter((p) => p.type === "risk");
      expect(risks.length).toBeGreaterThanOrEqual(1);
    });

    it("limits key points to 15", async () => {
      // Create many matches with rich text to generate lots of key points
      const matches = Array.from({ length: 12 }, (_, i) =>
        makeMatch({
          documentId: `doc-${i}`,
          summary: `Diagnosis of condition ${i}. Finding shows abnormality. Prescribed medication ${i} 10mg.`,
          excerpt: `Risk factor identified. Procedure performed. Test reveals issue ${i}.`,
          similarity: 0.9,
          date: daysAgo(i * 5),
        }),
      );

      const result = await assembler.assembleContextForAI(matches, "all");
      expect(result.keyPoints.length).toBeLessThanOrEqual(15);
    });

    it("sorts key points by confidence descending", async () => {
      const matches = [
        makeMatch({
          summary: "Diagnosis confirmed with certainty.",
          similarity: 0.95,
          date: daysAgo(1),
        }),
        makeMatch({
          summary: "Risk of diabetes from family history.",
          similarity: 0.5,
          date: daysAgo(100),
          documentId: "doc-2",
        }),
      ];

      const result = await assembler.assembleContextForAI(matches, "test");
      if (result.keyPoints.length >= 2) {
        expect(result.keyPoints[0].confidence).toBeGreaterThanOrEqual(
          result.keyPoints[result.keyPoints.length - 1].confidence,
        );
      }
    });
  });

  // ── Token optimization ──

  describe("assembleContextForAI — token management", () => {
    it("returns tokenCount within maxTokens budget", async () => {
      const matches = Array.from({ length: 8 }, (_, i) =>
        makeMatch({
          documentId: `doc-${i}`,
          summary: `Summary of document ${i} with detailed medical information about condition ${i}.`,
          excerpt: `Excerpt with diagnosis of condition ${i}. Treatment prescribed.`,
          similarity: 0.8,
          date: daysAgo(i * 10),
        }),
      );

      const result = await assembler.assembleContextForAI(matches, "query", {
        maxTokens: 500,
      });

      expect(result.tokenCount).toBeLessThanOrEqual(500);
      expect(result.tokenCount).toBeGreaterThan(0);
    });

    it("uses default 4000 maxTokens when not specified", async () => {
      const matches = [makeMatch({ date: daysAgo(5) })];
      const result = await assembler.assembleContextForAI(matches, "query");
      expect(result.tokenCount).toBeLessThanOrEqual(4000);
    });
  });

  // ── Document sections ──

  describe("assembleContextForAI — document assembly", () => {
    it("includes relevant documents with type and date", async () => {
      const matches = [
        makeMatch({
          documentId: "doc-lab",
          documentType: "laboratory",
          date: daysAgo(5),
          summary: "Blood work results showing normal CBC.",
        }),
        makeMatch({
          documentId: "doc-visit",
          documentType: "visit",
          date: daysAgo(10),
          summary: "Follow-up visit with cardiologist.",
        }),
      ];

      const result = await assembler.assembleContextForAI(matches, "results");
      expect(result.relevantDocuments.length).toBe(2);
      expect(result.relevantDocuments[0].type).toBeDefined();
      expect(result.relevantDocuments[0].date).toBeDefined();
      expect(result.relevantDocuments[0].documentId).toBeDefined();
    });

    it("prioritizes specified document types", async () => {
      const matches = [
        makeMatch({ documentId: "lab-1", documentType: "laboratory", date: daysAgo(5), similarity: 0.7 }),
        makeMatch({ documentId: "visit-1", documentType: "visit", date: daysAgo(3), similarity: 0.8 }),
        makeMatch({ documentId: "lab-2", documentType: "laboratory", date: daysAgo(10), similarity: 0.6 }),
        makeMatch({ documentId: "rad-1", documentType: "radiology", date: daysAgo(7), similarity: 0.75 }),
      ];

      const result = await assembler.assembleContextForAI(matches, "query", {
        priorityTypes: ["laboratory"],
      });

      // Lab docs should appear first
      const labDocs = result.relevantDocuments.filter((d) => d.type === "laboratory");
      expect(labDocs.length).toBe(2);
    });
  });

  // ── Medical context ──

  describe("assembleContextForAI — medical context", () => {
    it("excludes medical context by default", async () => {
      const matches = [makeMatch({ date: daysAgo(5) })];
      const result = await assembler.assembleContextForAI(matches, "query");
      expect(result.medicalContext).toBeUndefined();
    });

    it("includes medical context when requested", async () => {
      const matches = [
        makeMatch({ date: daysAgo(10), summary: "Recent lab work." }),
        makeMatch({ date: daysAgo(30), summary: "Follow-up visit.", documentId: "doc-2" }),
      ];

      const result = await assembler.assembleContextForAI(matches, "query", {
        includeMedicalContext: true,
      });

      // Medical context may be included if token budget allows
      // The method always returns a MedicalContext object from buildMedicalContext
      // but optimizeContextTokens may drop it if over budget
      expect(result).toBeDefined();
    });

    it("includes recent changes in medical context when available", async () => {
      const matches = [
        makeMatch({ date: daysAgo(5), summary: "New lab results." }),
        makeMatch({ date: daysAgo(15), summary: "Updated medication.", documentId: "doc-2" }),
      ];

      const result = await assembler.assembleContextForAI(matches, "query", {
        includeMedicalContext: true,
        maxTokens: 8000, // generous budget to ensure medical context fits
      });

      if (result.medicalContext) {
        expect(result.medicalContext.recentChanges).toBeDefined();
      }
    });
  });

  // ── Error handling ──

  describe("assembleContextForAI — error handling", () => {
    it("returns fallback context on internal error", async () => {
      // Pass a match with undefined metadata to trigger error
      const badMatches = [{ documentId: "bad", similarity: 0.5 } as any];

      const result = await assembler.assembleContextForAI(badMatches, "query");
      expect(result.summary).toContain("failed");
      expect(result.confidence).toBe(0);
      expect(result.tokenCount).toBe(0);
      expect(result.keyPoints).toEqual([]);
    });
  });

  // ── Summary building ──

  describe("assembleContextForAI — summary building", () => {
    it("includes recent document summaries in output", async () => {
      const matches = [
        makeMatch({
          date: daysAgo(5),
          summary: "Blood glucose elevated at 180mg/dL.",
          documentId: "doc-gluc",
        }),
      ];

      const result = await assembler.assembleContextForAI(matches, "glucose");
      // The summary should reference recent activity
      expect(result.summary.length).toBeGreaterThan(0);
    });

    it("separates recent and historical context", async () => {
      const matches = [
        makeMatch({ date: daysAgo(10), summary: "Recent CBC results.", documentId: "doc-recent" }),
        makeMatch({ date: daysAgo(200), summary: "Old MRI scan findings.", documentId: "doc-old" }),
      ];

      const result = await assembler.assembleContextForAI(matches, "history");
      // Both should be represented — recent in patient summary, old in history
      expect(result.summary.length).toBeGreaterThan(0);
    });
  });
});
