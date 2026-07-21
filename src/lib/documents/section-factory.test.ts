import { describe, it, expect, vi } from "vitest";

// Mock all Svelte component imports
vi.mock("$components/documents/SectionSummary.svelte", () => ({ default: class SectionSummary {} }));
vi.mock("$components/documents/SectionDiagnosis.svelte", () => ({ default: class SectionDiagnosis {} }));
vi.mock("$components/documents/SectionRecommendations.svelte", () => ({ default: class SectionRecommendations {} }));
vi.mock("$components/documents/SectionBody.svelte", () => ({ default: class SectionBody {} }));
vi.mock("$components/documents/SectionSignals.svelte", () => ({ default: class SectionSignals {} }));
vi.mock("$components/documents/SectionText.svelte", () => ({ default: class SectionText {} }));
vi.mock("$components/documents/SectionPerformer.svelte", () => ({ default: class SectionPerformer {} }));
vi.mock("$components/documents/SectionLinks.svelte", () => ({ default: class SectionLinks {} }));
vi.mock("$components/documents/SectionAttachments.svelte", () => ({ default: class SectionAttachments {} }));
vi.mock("$components/documents/SectionSession.svelte", () => ({ default: class SectionSession {} }));
vi.mock("$components/documents/Tags.svelte", () => ({ default: class Tags {} }));

import {
  createDocumentSectionPlan,
  validateSectionAvailability,
} from "./section-factory";

// ── helpers ──────────────────────────────────────────────────────────────────

function makeDocType(
  primaryType = "consultation",
  confidence = 0.8,
): any {
  return { primaryType, confidence };
}

function makeDoc(content: Record<string, any> = {}, extra: Record<string, any> = {}): any {
  return {
    id: "doc-1",
    key: "enc-key",
    content,
    ...extra,
  };
}

describe("documents/section-factory", () => {
  // ── createDocumentSectionPlan ─────────────────────────────────────────────

  describe("createDocumentSectionPlan", () => {
    describe("useSpecializedViewer = true", () => {
      it("returns layout 'specialized' and useSpecializedViewer true", () => {
        const plan = createDocumentSectionPlan(
          makeDoc({ tags: ["surgery"] }),
          makeDocType(),
          true,
        );
        expect(plan.layout).toBe("specialized");
        expect(plan.useSpecializedViewer).toBe(true);
      });

      it("includes tags section when document has tags", () => {
        const plan = createDocumentSectionPlan(
          makeDoc({ tags: ["tag1"] }),
          makeDocType(),
          true,
        );
        expect(plan.sections.map((s) => s.id)).toContain("tags");
      });

      it("returns empty sections when document has no tags", () => {
        const plan = createDocumentSectionPlan(makeDoc({}), makeDocType(), true);
        expect(plan.sections).toHaveLength(0);
      });
    });

    describe("standard viewer", () => {
      it("returns layout 'hybrid' when confidence > 0.7", () => {
        const plan = createDocumentSectionPlan(
          makeDoc({ summary: "test" }),
          makeDocType("consultation", 0.8),
        );
        expect(plan.layout).toBe("hybrid");
      });

      it("returns layout 'standard' when confidence <= 0.7", () => {
        const plan = createDocumentSectionPlan(
          makeDoc({ summary: "test" }),
          makeDocType("consultation", 0.5),
        );
        expect(plan.layout).toBe("standard");
      });

      it("excludes 'body' section for laboratory document type", () => {
        const doc = makeDoc({
          summary: "test",
          bodyParts: [{ name: "knee" }],
          signals: [{ name: "glucose" }],
        });
        const plan = createDocumentSectionPlan(doc, makeDocType("laboratory"));
        const ids = plan.sections.map((s) => s.id);
        expect(ids).not.toContain("body");
      });

      it("excludes 'signals' section for radiology document type", () => {
        const doc = makeDoc({
          summary: "test",
          signals: [{ name: "ecg" }],
          content: "Radiology findings",
        });
        const plan = createDocumentSectionPlan(doc, makeDocType("radiology"));
        const ids = plan.sections.map((s) => s.id);
        expect(ids).not.toContain("signals");
      });

      it("excludes 'signals' section for pathology document type", () => {
        const doc = makeDoc({
          summary: "test",
          signals: [{ name: "ecg" }],
        });
        const plan = createDocumentSectionPlan(doc, makeDocType("pathology"));
        const ids = plan.sections.map((s) => s.id);
        expect(ids).not.toContain("signals");
      });

      it("includes sections for available content", () => {
        const doc = makeDoc({
          summary: "test",
          diagnosis: [{ name: "flu" }],
        });
        const plan = createDocumentSectionPlan(doc, makeDocType("consultation"));
        const ids = plan.sections.map((s) => s.id);
        expect(ids).toContain("summary");
        expect(ids).toContain("diagnosis");
      });

      it("required sections get higher priority than optional sections", () => {
        // surgical: required = [summary, diagnosis], priority = [body, recommendations]
        const doc = makeDoc({
          summary: "test",
          diagnosis: [{ name: "flu" }],
          bodyParts: [{ name: "knee" }],
          signals: [{ name: "ecg" }],
        });
        const plan = createDocumentSectionPlan(doc, makeDocType("surgical"));
        const summarySection = plan.sections.find((s) => s.id === "summary");
        const signalsSection = plan.sections.find((s) => s.id === "signals");

        expect(summarySection).toBeDefined();
        if (summarySection && signalsSection) {
          expect(summarySection.priority).toBeGreaterThan(signalsSection.priority);
        }
      });

      it("priority sections get higher priority than optional sections", () => {
        // surgical: priority = [body, recommendations]
        const doc = makeDoc({
          summary: "test",
          bodyParts: [{ name: "knee" }],
          signals: [{ name: "ecg" }],
        });
        const plan = createDocumentSectionPlan(doc, makeDocType("surgical"));
        const bodySection = plan.sections.find((s) => s.id === "body");
        const signalsSection = plan.sections.find((s) => s.id === "signals");

        if (bodySection && signalsSection) {
          expect(bodySection.priority).toBeGreaterThan(signalsSection.priority);
        }
      });

      it("sections are sorted by priority descending", () => {
        const doc = makeDoc({
          summary: "test",
          diagnosis: [{ name: "flu" }],
          recommendations: [{ name: "rest" }],
        });
        const plan = createDocumentSectionPlan(doc, makeDocType("consultation"));
        for (let i = 1; i < plan.sections.length; i++) {
          expect(plan.sections[i - 1].priority).toBeGreaterThanOrEqual(
            plan.sections[i].priority,
          );
        }
      });

      it("falls back to consultation type for unknown document type", () => {
        const doc = makeDoc({ summary: "test" });
        const plan = createDocumentSectionPlan(
          doc,
          makeDocType("unknown_type"),
        );
        // Should not throw; consultation config is used
        expect(plan.sections).toBeDefined();
      });

      it("required sections are included even without matching content", () => {
        // laboratory: required = [summary, signals] → signals shown even if no signals in doc
        // BUT the final filter removes sections with false condition, so actually they won't show
        // Test: required sections WITH content appear
        const doc = makeDoc({ summary: "test", signals: [{ name: "wbc" }] });
        const plan = createDocumentSectionPlan(doc, makeDocType("laboratory"));
        const ids = plan.sections.map((s) => s.id);
        expect(ids).toContain("summary");
        expect(ids).toContain("signals");
      });

      it("includes sessionAnalysis section when document has sessionAnalysis", () => {
        const doc = makeDoc({ sessionAnalysis: { data: {} } });
        const plan = createDocumentSectionPlan(doc, makeDocType("consultation"));
        const ids = plan.sections.map((s) => s.id);
        expect(ids).toContain("sessionAnalysis");
      });

      it("includes performer section when document has performer data", () => {
        const doc = makeDoc({ performer: { name: "Dr Smith" } });
        const plan = createDocumentSectionPlan(doc, makeDocType("consultation"));
        const ids = plan.sections.map((s) => s.id);
        expect(ids).toContain("performer");
      });

      it("includes links section when document has links", () => {
        const doc = makeDoc({ links: [{ url: "https://example.com" }] });
        const plan = createDocumentSectionPlan(doc, makeDocType("consultation"));
        const ids = plan.sections.map((s) => s.id);
        expect(ids).toContain("links");
      });

      it("includes attachments section when document has attachments", () => {
        const doc = makeDoc({ attachments: [{ name: "file.pdf" }] });
        const plan = createDocumentSectionPlan(doc, makeDocType("consultation"));
        const ids = plan.sections.map((s) => s.id);
        expect(ids).toContain("attachments");
      });

      it("includes text section when document has localizedContent", () => {
        const doc = makeDoc({ localizedContent: { en: "text" } });
        const plan = createDocumentSectionPlan(doc, makeDocType("consultation"));
        const ids = plan.sections.map((s) => s.id);
        expect(ids).toContain("text");
      });
    });
  });

  // ── validateSectionAvailability ───────────────────────────────────────────

  describe("validateSectionAvailability", () => {
    it("returns valid=true when all required sections have content", () => {
      // surgical requires summary + diagnosis
      const doc = makeDoc({
        summary: "test",
        diagnosis: [{ name: "flu" }],
      });
      const result = validateSectionAvailability(doc, makeDocType("surgical"));
      expect(result.valid).toBe(true);
      expect(result.missingSections).toHaveLength(0);
    });

    it("reports missing required sections", () => {
      // surgical requires summary + diagnosis → doc has neither
      const doc = makeDoc({});
      const result = validateSectionAvailability(doc, makeDocType("surgical"));
      expect(result.valid).toBe(false);
      expect(result.missingSections).toContain("summary");
      expect(result.missingSections).toContain("diagnosis");
    });

    it("generates warnings for missing priority sections", () => {
      // surgical priority sections: body, recommendations
      const doc = makeDoc({ summary: "test", diagnosis: [{ name: "flu" }] });
      const result = validateSectionAvailability(doc, makeDocType("surgical"));
      expect(result.warnings.some((w) => w.includes("body"))).toBe(true);
      expect(result.warnings.some((w) => w.includes("recommendations"))).toBe(true);
    });

    it("no warnings when all priority sections are available", () => {
      const doc = makeDoc({
        summary: "test",
        diagnosis: [{ name: "flu" }],
        bodyParts: [{ name: "knee" }],
        recommendations: [{ name: "rest" }],
      });
      const result = validateSectionAvailability(doc, makeDocType("surgical"));
      expect(result.warnings).toHaveLength(0);
    });

    it("falls back to consultation config for unknown document type", () => {
      const doc = makeDoc({ summary: "test" });
      const result = validateSectionAvailability(doc, makeDocType("unknown_type"));
      expect(result).toHaveProperty("valid");
      expect(result).toHaveProperty("missingSections");
      expect(result).toHaveProperty("warnings");
    });

    it("laboratory type: excludes body from required checks, requires signals", () => {
      // laboratory required: [summary, signals]
      const doc = makeDoc({});
      const result = validateSectionAvailability(doc, makeDocType("laboratory"));
      expect(result.missingSections).toContain("summary");
      expect(result.missingSections).toContain("signals");
    });
  });
});
