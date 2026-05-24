import { describe, it, expect, beforeEach } from "vitest";
import {
  feedbackStore,
  generateFeedbackAnalytics,
  getFeedbackForAI,
  type FeedbackData,
} from "./feedback";

function makeFeedback(overrides: Partial<FeedbackData> = {}): FeedbackData {
  return {
    itemType: "diagnosis",
    itemContent: { description: "Test diagnosis" },
    feedback: "approved",
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("ai/feedback", () => {
  beforeEach(() => {
    feedbackStore.clear();
  });

  describe("generateFeedbackAnalytics", () => {
    it("returns empty analytics when no feedback", () => {
      const analytics = generateFeedbackAnalytics();
      expect(analytics.totalFeedback).toBe(0);
      expect(analytics.byFeedback.approved).toBe(0);
      expect(analytics.byFeedback.rejected).toBe(0);
      expect(analytics.byFeedback.neutral).toBe(0);
    });

    it("counts feedback by type", () => {
      feedbackStore.set("diagnosis", [
        makeFeedback({ feedback: "approved" }),
        makeFeedback({ feedback: "rejected" }),
      ]);
      feedbackStore.set("treatment", [
        makeFeedback({ itemType: "treatment", feedback: "approved" }),
      ]);

      const analytics = generateFeedbackAnalytics();
      expect(analytics.totalFeedback).toBe(3);
      expect(analytics.byType.diagnosis.total).toBe(2);
      expect(analytics.byType.diagnosis.approved).toBe(1);
      expect(analytics.byType.diagnosis.rejected).toBe(1);
      expect(analytics.byType.treatment.total).toBe(1);
    });

    it("counts by feedback type across all categories", () => {
      feedbackStore.set("diagnosis", [
        makeFeedback({ feedback: "approved" }),
        makeFeedback({ feedback: "approved" }),
        makeFeedback({ feedback: "neutral" }),
      ]);

      const analytics = generateFeedbackAnalytics();
      expect(analytics.byFeedback.approved).toBe(2);
      expect(analytics.byFeedback.neutral).toBe(1);
      expect(analytics.byFeedback.rejected).toBe(0);
    });

    it("calculates approval rates", () => {
      feedbackStore.set("diagnosis", [
        makeFeedback({ feedback: "approved" }),
        makeFeedback({ feedback: "approved" }),
        makeFeedback({ feedback: "rejected" }),
        makeFeedback({ feedback: "neutral" }),
      ]);

      const analytics = generateFeedbackAnalytics();
      // 2 approved out of 4 = 50%
      expect(analytics.approvalRates.diagnosis).toBe(50);
    });

    it("returns 0 approval rate for empty category", () => {
      feedbackStore.set("diagnosis", []);
      const analytics = generateFeedbackAnalytics();
      expect(analytics.approvalRates.diagnosis).toBe(0);
    });
  });

  describe("getFeedbackForAI", () => {
    it("returns per-type feedback when type exists", () => {
      feedbackStore.set("diagnosis", [
        makeFeedback({
          feedback: "approved",
          itemContent: { description: "Good diagnosis" },
        }),
        makeFeedback({
          feedback: "rejected",
          itemContent: { description: "Bad diagnosis" },
        }),
      ]);

      const result = getFeedbackForAI("diagnosis");
      expect(result).toContain("diagnosis");
      expect(result).toContain("Approved suggestions: 1");
      expect(result).toContain("Rejected suggestions: 1");
      expect(result).toContain("Good diagnosis");
      expect(result).toContain("Bad diagnosis");
    });

    it("returns overall analytics when no type specified", () => {
      feedbackStore.set("diagnosis", [
        makeFeedback({ feedback: "approved" }),
      ]);

      const result = getFeedbackForAI();
      expect(result).toContain("Overall doctor feedback patterns");
      expect(result).toContain("Total feedback entries: 1");
    });

    it("returns overall analytics for unknown type", () => {
      const result = getFeedbackForAI("nonexistent");
      expect(result).toContain("Overall doctor feedback patterns");
    });

    it("returns overall analytics when type has no approved or rejected", () => {
      feedbackStore.set("diagnosis", [
        makeFeedback({ feedback: "neutral" }),
      ]);

      const result = getFeedbackForAI("diagnosis");
      // No approved or rejected, falls through to overall
      expect(result).toContain("Overall doctor feedback patterns");
    });

    it("shows recent patterns (last 3)", () => {
      feedbackStore.set("treatment", [
        makeFeedback({
          feedback: "approved",
          itemContent: { description: "Treatment A" },
        }),
        makeFeedback({
          feedback: "approved",
          itemContent: { description: "Treatment B" },
        }),
        makeFeedback({
          feedback: "approved",
          itemContent: { description: "Treatment C" },
        }),
        makeFeedback({
          feedback: "approved",
          itemContent: { description: "Treatment D" },
        }),
      ]);

      const result = getFeedbackForAI("treatment");
      // Should show last 3 approved
      expect(result).toContain("Treatment B");
      expect(result).toContain("Treatment C");
      expect(result).toContain("Treatment D");
    });

    it("uses fallback content fields when description is missing", () => {
      feedbackStore.set("diagnosis", [
        makeFeedback({
          feedback: "approved",
          itemContent: { diagnosis: "Type 2 Diabetes" },
        }),
      ]);

      const result = getFeedbackForAI("diagnosis");
      expect(result).toContain("Type 2 Diabetes");
    });
  });
});
