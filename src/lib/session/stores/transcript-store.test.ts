import { describe, it, expect, vi, beforeEach } from "vitest";
import { get } from "svelte/store";

vi.mock("$lib/logging/logger", () => ({
  logger: {
    transcript: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  },
}));

// TranscriptItem type is imported only for types from unified-session-store.
// We provide a minimal mock so the module can resolve the import.
vi.mock("./unified-session-store", () => ({}));

import {
  transcriptStore,
  transcriptActions,
  transcriptItems,
  transcriptSegments,
} from "./transcript-store";

function makeItem(overrides: Record<string, any> = {}) {
  return {
    id: `item-${Math.random().toString(36).slice(2)}`,
    text: "Patient has headache",
    confidence: 0.9,
    timestamp: Date.now(),
    is_final: true,
    speaker: "patient",
    ...overrides,
  };
}

describe("session/stores/transcript-store", () => {
  beforeEach(() => {
    // Reset store between tests (preserves sessionId, resets everything else)
    transcriptActions.clearTranscripts();
    transcriptStore.update((s) => ({ ...s, sessionId: null }));
  });

  // ── formatSRTTime ─────────────────────────────────────────────────────────

  describe("formatSRTTime", () => {
    it("formats zero timestamp as 00:00:00,000", () => {
      expect(transcriptActions.formatSRTTime(0)).toBe("00:00:00,000");
    });

    it("formats 1 hour + 1 min + 1 sec + 500 ms correctly", () => {
      // 1h + 1m + 1s + 0.5s = 3661500ms
      expect(transcriptActions.formatSRTTime(3661500)).toBe("01:01:01,500");
    });

    it("formats a timestamp with only milliseconds", () => {
      expect(transcriptActions.formatSRTTime(750)).toBe("00:00:00,750");
    });

    it("pads single-digit values with leading zeros", () => {
      // 5 seconds = 5000ms
      expect(transcriptActions.formatSRTTime(5000)).toBe("00:00:05,000");
    });
  });

  // ── addTranscriptItem ─────────────────────────────────────────────────────

  describe("addTranscriptItem", () => {
    it("appends item to store items array", () => {
      const item = makeItem();
      transcriptActions.addTranscriptItem(item as any);

      expect(get(transcriptItems)).toHaveLength(1);
      expect(get(transcriptItems)[0].id).toBe(item.id);
    });

    it("adds multiple items in order", () => {
      const a = makeItem({ text: "First" });
      const b = makeItem({ text: "Second" });

      transcriptActions.addTranscriptItem(a as any);
      transcriptActions.addTranscriptItem(b as any);

      const items = get(transcriptItems);
      expect(items).toHaveLength(2);
      expect(items[0].text).toBe("First");
      expect(items[1].text).toBe("Second");
    });

    it("sets streamBuffer to item text for non-final items", () => {
      transcriptActions.addTranscriptItem(makeItem({ is_final: false, text: "partial..." }) as any);
      expect(get(transcriptStore).streamBuffer).toBe("partial...");
    });

    it("updates lastSegmentTime to item timestamp", () => {
      const ts = 12345678;
      transcriptActions.addTranscriptItem(makeItem({ timestamp: ts }) as any);
      expect(get(transcriptStore).lastSegmentTime).toBe(ts);
    });
  });

  // ── groupItemsIntoSegments ────────────────────────────────────────────────

  describe("groupItemsIntoSegments", () => {
    it("returns empty array for empty input", () => {
      expect(transcriptActions.groupItemsIntoSegments([])).toEqual([]);
    });

    it("creates one segment for items from the same speaker with small gaps", () => {
      const now = Date.now();
      const items = [
        makeItem({ speaker: "doctor", timestamp: now }),
        makeItem({ speaker: "doctor", timestamp: now + 1000 }),
      ];

      const segments = transcriptActions.groupItemsIntoSegments(items as any);
      expect(segments).toHaveLength(1);
      expect(segments[0].speaker).toBe("doctor");
    });

    it("creates separate segments for different speakers", () => {
      const now = Date.now();
      const items = [
        makeItem({ speaker: "doctor", timestamp: now }),
        makeItem({ speaker: "patient", timestamp: now + 100 }),
      ];

      const segments = transcriptActions.groupItemsIntoSegments(items as any);
      expect(segments).toHaveLength(2);
      expect(segments[0].speaker).toBe("doctor");
      expect(segments[1].speaker).toBe("patient");
    });

    it("splits same-speaker items separated by more than 5 seconds", () => {
      const now = Date.now();
      const items = [
        makeItem({ speaker: "doctor", timestamp: now }),
        makeItem({ speaker: "doctor", timestamp: now + 6000 }), // 6s gap
      ];

      const segments = transcriptActions.groupItemsIntoSegments(items as any);
      expect(segments).toHaveLength(2);
    });

    it("combines text from all items in a segment", () => {
      const now = Date.now();
      const items = [
        makeItem({ text: "Hello", speaker: "doctor", timestamp: now }),
        makeItem({ text: "patient", speaker: "doctor", timestamp: now + 100 }),
      ];

      const [segment] = transcriptActions.groupItemsIntoSegments(items as any);
      expect(segment.text).toContain("Hello");
      expect(segment.text).toContain("patient");
    });
  });

  // ── extractKeyTerms ───────────────────────────────────────────────────────

  describe("extractKeyTerms", () => {
    it("returns empty array for text with no medical terms", () => {
      expect(transcriptActions.extractKeyTerms("the cat sat on a mat")).toEqual([]);
    });

    it("detects medical terms in text", () => {
      const terms = transcriptActions.extractKeyTerms("patient has a headache and fever");
      const termNames = terms.map((t) => t.term);
      expect(termNames).toContain("headache");
      expect(termNames).toContain("fever");
    });

    it("counts frequency correctly", () => {
      const terms = transcriptActions.extractKeyTerms("pain pain pain");
      const pain = terms.find((t) => t.term === "pain");
      expect(pain?.frequency).toBe(3);
    });

    it("sorts by importance descending", () => {
      const terms = transcriptActions.extractKeyTerms(
        "headache headache pain fever fever fever",
      );
      if (terms.length >= 2) {
        expect(terms[0].importance).toBeGreaterThanOrEqual(terms[1].importance);
      }
    });
  });

  // ── categorizeKeyTerm ─────────────────────────────────────────────────────

  describe("categorizeKeyTerm", () => {
    it("categorises symptom terms correctly", () => {
      expect(transcriptActions.categorizeKeyTerm("headache")).toBe("symptom");
      expect(transcriptActions.categorizeKeyTerm("pain")).toBe("symptom");
    });

    it("categorises treatment terms correctly", () => {
      expect(transcriptActions.categorizeKeyTerm("medication")).toBe("treatment");
      expect(transcriptActions.categorizeKeyTerm("prescription")).toBe("treatment");
    });

    it("categorises medical terms correctly", () => {
      expect(transcriptActions.categorizeKeyTerm("diagnosis")).toBe("medical");
    });

    it("returns general for unknown terms", () => {
      expect(transcriptActions.categorizeKeyTerm("doctor")).toBe("general");
      expect(transcriptActions.categorizeKeyTerm("appointment")).toBe("general");
    });
  });

  // ── searchTranscripts ─────────────────────────────────────────────────────

  describe("searchTranscripts", () => {
    beforeEach(() => {
      // Populate the store with real segments via addTranscriptItem + processQueuedItems
      const now = Date.now();
      transcriptActions.addTranscriptItem(
        makeItem({ text: "I have a headache", speaker: "patient", timestamp: now }) as any,
      );
      // After adding a final item, processQueuedItems runs and creates segments
    });

    it("empty query clears searchQuery and filteredSegments", () => {
      transcriptActions.searchTranscripts("head");
      transcriptActions.searchTranscripts("");

      const state = get(transcriptStore);
      expect(state.searchQuery).toBe("");
      expect(state.filteredSegments).toEqual([]);
    });

    it("sets filteredSegments to matching segments", () => {
      transcriptActions.searchTranscripts("headache");

      const state = get(transcriptStore);
      expect(state.searchQuery).toBe("headache");
      // segments containing "headache" should be returned
      expect(state.filteredSegments.some((s) => s.text.includes("headache"))).toBe(true);
    });

    it("is case-insensitive", () => {
      transcriptActions.searchTranscripts("HEADACHE");
      const state = get(transcriptStore);
      expect(state.filteredSegments.some((s) => s.text.toLowerCase().includes("headache"))).toBe(
        true,
      );
    });
  });

  // ── filterBySpeaker ───────────────────────────────────────────────────────

  describe("filterBySpeaker", () => {
    beforeEach(() => {
      const now = Date.now();
      transcriptActions.addTranscriptItem(
        makeItem({ text: "Hello", speaker: "doctor", timestamp: now }) as any,
      );
      transcriptActions.addTranscriptItem(
        makeItem({ text: "Hello back", speaker: "patient", timestamp: now + 100 }) as any,
      );
    });

    it("sets selectedSpeaker and filters segments", () => {
      transcriptActions.filterBySpeaker("doctor");

      const state = get(transcriptStore);
      expect(state.selectedSpeaker).toBe("doctor");
      expect(state.filteredSegments.every((s) => s.speaker === "doctor")).toBe(true);
    });

    it("clears filteredSegments when speakerId is null", () => {
      transcriptActions.filterBySpeaker("doctor");
      transcriptActions.filterBySpeaker(null);

      const state = get(transcriptStore);
      expect(state.selectedSpeaker).toBeNull();
      expect(state.filteredSegments).toEqual([]);
    });
  });

  // ── setSessionId ──────────────────────────────────────────────────────────

  describe("setSessionId", () => {
    it("updates the sessionId in the store", () => {
      transcriptActions.setSessionId("my-session");
      expect(get(transcriptStore).sessionId).toBe("my-session");
    });
  });

  // ── exportTranscripts ─────────────────────────────────────────────────────

  describe("exportTranscripts (format routing)", () => {
    it("returns empty string for unknown format", () => {
      expect(transcriptActions.exportTranscripts("pdf" as any)).toBe("");
    });

    it("returns JSON string for json format", () => {
      const output = transcriptActions.exportTranscripts("json");
      expect(() => JSON.parse(output)).not.toThrow();
    });
  });
});
