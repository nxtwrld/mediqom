import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("$lib/logging/logger", () => ({
  logger: {
    session: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    analysis: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  },
}));

vi.mock("$lib/context/integration/session-context", () => ({
  sessionContextService: {
    initializeSessionContext: vi.fn().mockResolvedValue({
      documentCount: 0,
      confidence: 0,
      availableTools: ["searchDocuments"],
      contextSummary: "No context",
      tokenUsage: 0,
    }),
    updateSessionContext: vi.fn().mockResolvedValue({
      documentCount: 0,
      confidence: 0,
      availableTools: [],
      contextSummary: "No context",
      tokenUsage: 0,
    }),
    clearSessionContext: vi.fn(),
    getContextForAnalysis: vi.fn().mockResolvedValue({
      medicalHistory: [],
      relevantDocuments: [],
      contextSummary: "empty",
    }),
  },
}));

import {
  generateSessionId,
  createSession,
  getSession,
  updateSession,
  addTranscript,
  updateAnalysis,
  deleteSession,
  getSSEUpdatesSince,
  cleanupInactiveSessions,
  getSessionStats,
} from "./manager";

const BASE_DATA = {
  userId: "user-1",
  language: "en",
  models: ["gpt-4"],
  startTime: new Date().toISOString(),
  status: "active" as const,
};

function makeTranscript(overrides: Record<string, any> = {}) {
  return {
    id: `t-${Math.random().toString(36).slice(2)}`,
    text: "Patient reports headache",
    confidence: 0.95,
    timestamp: Date.now(),
    is_final: true,
    speaker: "patient",
    ...overrides,
  };
}

// Each test uses a unique session id to avoid cross-test pollution
let sessionCounter = 0;
function nextId() {
  return `test-session-${++sessionCounter}`;
}

describe("session/manager", () => {
  let sessionId: string;

  beforeEach(() => {
    sessionId = nextId();
  });

  afterEach(() => {
    // Clean up so the in-memory Map doesn't leak between tests
    deleteSession(sessionId);
  });

  // ── generateSessionId ────────────────────────────────────────────────────

  describe("generateSessionId", () => {
    it("returns a non-empty string", () => {
      const id = generateSessionId();
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    });

    it("returns a different value each call", () => {
      expect(generateSessionId()).not.toBe(generateSessionId());
    });
  });

  // ── createSession / getSession ────────────────────────────────────────────

  describe("createSession / getSession", () => {
    it("stores session data and returns it via getSession", async () => {
      await createSession(sessionId, BASE_DATA);

      const session = getSession(sessionId);
      expect(session).toBeDefined();
      expect(session!.userId).toBe("user-1");
      expect(session!.language).toBe("en");
    });

    it("initialises default arrays when not provided", async () => {
      await createSession(sessionId, BASE_DATA);
      const session = getSession(sessionId)!;

      expect(session.transcripts).toEqual([]);
      expect(session.realtimeUpdates).toEqual([]);
      expect(session.conversationHistory).toEqual([]);
    });

    it("returns undefined for an unknown session id", () => {
      expect(getSession("no-such-session")).toBeUndefined();
    });

    it("initialises context when profileId is provided", async () => {
      const { sessionContextService } = await import(
        "$lib/context/integration/session-context"
      );

      await createSession(sessionId, { ...BASE_DATA, profileId: "profile-1" });

      expect(sessionContextService.initializeSessionContext).toHaveBeenCalledWith(
        sessionId,
        expect.objectContaining({ profileId: "profile-1" }),
        expect.objectContaining({ profileId: "profile-1" }),
      );
    });

    it("does not call initializeSessionContext when profileId is absent", async () => {
      const { sessionContextService } = await import(
        "$lib/context/integration/session-context"
      );
      vi.mocked(sessionContextService.initializeSessionContext).mockClear();

      await createSession(sessionId, BASE_DATA);

      expect(sessionContextService.initializeSessionContext).not.toHaveBeenCalled();
    });
  });

  // ── updateSession ─────────────────────────────────────────────────────────

  describe("updateSession", () => {
    it("merges updates into existing session", async () => {
      await createSession(sessionId, BASE_DATA);
      updateSession(sessionId, { status: "paused" });

      expect(getSession(sessionId)!.status).toBe("paused");
    });

    it("does not throw when session does not exist", () => {
      expect(() => updateSession("nonexistent", { status: "paused" })).not.toThrow();
    });
  });

  // ── addTranscript ─────────────────────────────────────────────────────────

  describe("addTranscript", () => {
    it("appends transcript to session", async () => {
      await createSession(sessionId, BASE_DATA);
      const transcript = makeTranscript();

      await addTranscript(sessionId, transcript);

      const session = getSession(sessionId)!;
      expect(session.transcripts).toHaveLength(1);
      expect(session.transcripts![0].id).toBe(transcript.id);
    });

    it("adds a conversation message for each transcript", async () => {
      await createSession(sessionId, BASE_DATA);
      await addTranscript(sessionId, makeTranscript({ text: "Hello doctor" }));

      const session = getSession(sessionId)!;
      expect(session.conversationHistory).toHaveLength(1);
      expect(session.conversationHistory[0].content).toBe("Hello doctor");
      expect(session.conversationHistory[0].role).toBe("user");
    });

    it("creates a realtimeUpdates SSE entry", async () => {
      await createSession(sessionId, BASE_DATA);
      await addTranscript(sessionId, makeTranscript());

      expect(getSession(sessionId)!.realtimeUpdates).toHaveLength(1);
      expect(getSession(sessionId)!.realtimeUpdates[0].type).toBe("partial_transcript");
    });

    it("does not throw when session does not exist", async () => {
      await expect(addTranscript("missing", makeTranscript())).resolves.toBeUndefined();
    });
  });

  // ── updateAnalysis ────────────────────────────────────────────────────────

  describe("updateAnalysis", () => {
    it("stores diagnosis entries in analysisState", async () => {
      await createSession(sessionId, BASE_DATA);
      updateAnalysis(sessionId, {
        diagnosis: [{ name: "Type 2 Diabetes", probability: 0.8 }],
      });

      const stats = getSessionStats(sessionId)!;
      expect(stats.analysisState.currentDiagnosis).toHaveLength(1);
      expect(stats.analysisState.currentDiagnosis[0].name).toBe("Type 2 Diabetes");
    });

    it("merges duplicate diagnosis entries by name (last write wins)", async () => {
      await createSession(sessionId, BASE_DATA);
      updateAnalysis(sessionId, {
        diagnosis: [{ name: "Flu", probability: 0.5 }],
      });
      updateAnalysis(sessionId, {
        diagnosis: [{ name: "Flu", probability: 0.9 }],
      });

      const stats = getSessionStats(sessionId)!;
      expect(stats.analysisState.currentDiagnosis).toHaveLength(1);
      expect(stats.analysisState.currentDiagnosis[0].probability).toBe(0.9);
    });

    it("adds new entries that do not match existing ones", async () => {
      await createSession(sessionId, BASE_DATA);
      // Include description so the merge predicate (name OR description) can distinguish them
      updateAnalysis(sessionId, { diagnosis: [{ name: "Flu", description: "Influenza" }] });
      updateAnalysis(sessionId, { diagnosis: [{ name: "Cold", description: "Common cold" }] });

      expect(getSessionStats(sessionId)!.analysisState.currentDiagnosis).toHaveLength(2);
    });

    it("stores medication, treatment, and followUp entries", async () => {
      await createSession(sessionId, BASE_DATA);
      updateAnalysis(sessionId, {
        medication: [{ name: "Metformin" }],
        treatment: [{ name: "Diet" }],
        followUp: [{ name: "Check-up" }],
      });

      const state = getSessionStats(sessionId)!.analysisState;
      expect(state.currentMedication).toHaveLength(1);
      expect(state.currentTreatment).toHaveLength(1);
      expect(state.currentFollowUp).toHaveLength(1);
    });

    it("emits an SSE update event", async () => {
      await createSession(sessionId, BASE_DATA);
      updateAnalysis(sessionId, { diagnosis: [{ name: "X" }] });

      const updates = getSSEUpdatesSince(sessionId, 0);
      const analysisUpdate = updates.find((u) => u.type === "analysis_update");
      expect(analysisUpdate).toBeDefined();
    });

    it("does nothing when session does not exist", () => {
      expect(() => updateAnalysis("ghost", { diagnosis: [] })).not.toThrow();
    });
  });

  // ── deleteSession ─────────────────────────────────────────────────────────

  describe("deleteSession", () => {
    it("removes the session from the store", async () => {
      await createSession(sessionId, BASE_DATA);
      deleteSession(sessionId);

      expect(getSession(sessionId)).toBeUndefined();
    });

    it("clears the session context cache", async () => {
      const { sessionContextService } = await import(
        "$lib/context/integration/session-context"
      );
      vi.mocked(sessionContextService.clearSessionContext).mockClear();

      await createSession(sessionId, BASE_DATA);
      deleteSession(sessionId);

      expect(sessionContextService.clearSessionContext).toHaveBeenCalledWith(sessionId);
    });
  });

  // ── getSSEUpdatesSince ────────────────────────────────────────────────────

  describe("getSSEUpdatesSince", () => {
    it("returns empty array for unknown session", () => {
      expect(getSSEUpdatesSince("unknown", 0)).toEqual([]);
    });

    it("filters updates by timestamp", async () => {
      await createSession(sessionId, BASE_DATA);
      const before = Date.now();
      await addTranscript(sessionId, makeTranscript());
      const after = Date.now();

      const sinceBeforeAdd = getSSEUpdatesSince(sessionId, before - 1);
      const sinceAfterAdd = getSSEUpdatesSince(sessionId, after + 1);

      expect(sinceBeforeAdd.length).toBeGreaterThan(0);
      expect(sinceAfterAdd).toHaveLength(0);
    });
  });

  // ── cleanupInactiveSessions ───────────────────────────────────────────────

  describe("cleanupInactiveSessions", () => {
    it("removes sessions older than the given hour threshold", async () => {
      const oldId = nextId();
      // Create a session with a very old startTime
      await createSession(oldId, {
        ...BASE_DATA,
        startTime: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), // 25 hours ago
      });

      cleanupInactiveSessions(24);

      expect(getSession(oldId)).toBeUndefined();
    });

    it("keeps sessions within the threshold", async () => {
      await createSession(sessionId, BASE_DATA); // startTime = now

      cleanupInactiveSessions(24);

      expect(getSession(sessionId)).toBeDefined();
    });
  });

  // ── getSessionStats ───────────────────────────────────────────────────────

  describe("getSessionStats", () => {
    it("returns null for unknown session", () => {
      expect(getSessionStats("unknown")).toBeNull();
    });

    it("returns correct transcript and message counts", async () => {
      await createSession(sessionId, BASE_DATA);
      await addTranscript(sessionId, makeTranscript());

      const stats = getSessionStats(sessionId)!;
      expect(stats.transcriptCount).toBe(1);
      expect(stats.messageCount).toBe(1);
      expect(stats.userId).toBe("user-1");
    });

    it("reports contextAvailable based on analysisState", async () => {
      await createSession(sessionId, BASE_DATA);
      const stats = getSessionStats(sessionId)!;
      expect(typeof stats.contextAvailable).toBe("boolean");
    });
  });
});
