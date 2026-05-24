import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("$lib/logging/logger", () => ({
  logger: {
    session: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  },
}));

vi.mock("./stores/session-data-store", () => ({
  sessionDataActions: {
    answerQuestion: vi.fn(),
    acknowledgeAlert: vi.fn(),
    handleNodeAction: vi.fn(),
    updateSession: vi.fn(),
    updatePartial: vi.fn(),
    loadSession: vi.fn(),
    clearSession: vi.fn(),
    setLoading: vi.fn(),
    setError: vi.fn(),
  },
}));

import {
  SessionAnalysisManager,
  createAnalysisManager,
} from "./analysis-manager";

// Helpers

function makeSessionData(overrides: Record<string, any> = {}): any {
  return {
    sessionId: "session-1",
    timestamp: new Date().toISOString(),
    analysisVersion: 1,
    nodes: {
      symptoms: [],
      diagnoses: [],
      treatments: [],
      actions: [],
    },
    userActions: [],
    ...overrides,
  };
}

function makeSymptom(id: string, severity = 3): any {
  return { id, name: "Headache", severity };
}

function makeDiagnosis(id: string, probability = 0.8): any {
  return { id, name: "Migraine", probability };
}

function makeTreatment(id: string, type = "medication"): any {
  return { id, name: "Ibuprofen", type };
}

function makeAction(id: string, actionType = "question"): any {
  return {
    id,
    label: "Do you have nausea?",
    actionType,
    status: "pending",
    relationships: [],
    impact: {},
  };
}

describe("session/analysis-manager — SessionAnalysisManager", () => {
  let manager: SessionAnalysisManager;

  beforeEach(() => {
    manager = new SessionAnalysisManager();
  });

  // ── getNodeType ───────────────────────────────────────────────────────────

  describe("getNodeType", () => {
    it("returns 'symptom' for nodes with severity field", () => {
      expect(manager.getNodeType({ severity: 3 })).toBe("symptom");
    });

    it("returns 'diagnosis' for nodes with probability field", () => {
      expect(manager.getNodeType({ probability: 0.8 })).toBe("diagnosis");
    });

    it("returns 'treatment' for nodes with recognised type value", () => {
      for (const t of ["medication", "procedure", "therapy", "lifestyle", "investigation", "immediate"]) {
        expect(manager.getNodeType({ type: t })).toBe("treatment");
      }
    });

    it("returns 'action' for nodes with actionType field", () => {
      expect(manager.getNodeType({ actionType: "question" })).toBe("action");
    });

    it("returns 'unknown' for unrecognised node shapes", () => {
      expect(manager.getNodeType({ label: "something" })).toBe("unknown");
    });
  });

  // ── findNodeById ──────────────────────────────────────────────────────────

  describe("findNodeById", () => {
    it("returns null when no session data is set", () => {
      expect(manager.findNodeById("any-id")).toBeNull();
    });

    it("finds a node by id across all node types", () => {
      const sessionData = makeSessionData({
        nodes: {
          symptoms: [makeSymptom("sym-1")],
          diagnoses: [makeDiagnosis("diag-1")],
          treatments: [makeTreatment("treat-1")],
          actions: [makeAction("act-1")],
        },
      });
      manager.setSessionData(sessionData);

      expect(manager.findNodeById("sym-1")).toMatchObject({ id: "sym-1" });
      expect(manager.findNodeById("diag-1")).toMatchObject({ id: "diag-1" });
      expect(manager.findNodeById("treat-1")).toMatchObject({ id: "treat-1" });
      expect(manager.findNodeById("act-1")).toMatchObject({ id: "act-1" });
    });

    it("returns null for an id that does not exist", () => {
      manager.setSessionData(makeSessionData());
      expect(manager.findNodeById("nonexistent")).toBeNull();
    });
  });

  // ── answerQuestion ────────────────────────────────────────────────────────

  describe("answerQuestion", () => {
    it("updates matching action status to answered", () => {
      const sessionData = makeSessionData({
        nodes: {
          symptoms: [],
          diagnoses: [],
          treatments: [],
          actions: [makeAction("q-1", "question")],
        },
      });
      manager.setSessionData(sessionData);

      manager.answerQuestion("q-1", "Yes");

      const action = manager.getSessionData()!.nodes.actions.find(
        (a: any) => a.id === "q-1",
      );
      expect(action.status).toBe("answered");
      expect(action.answer).toBe("Yes");
    });

    it("calls sessionDataActions.answerQuestion", async () => {
      const { sessionDataActions } = await import("./stores/session-data-store");
      vi.mocked(sessionDataActions.answerQuestion).mockClear();

      manager.setSessionData(makeSessionData());
      manager.answerQuestion("q-1", "No", 0.9);

      expect(sessionDataActions.answerQuestion).toHaveBeenCalledWith("q-1", "No", 0.9);
    });

    it("does not throw when nodes.actions is empty", () => {
      manager.setSessionData(makeSessionData());
      expect(() => manager.answerQuestion("q-missing", "Yes")).not.toThrow();
    });
  });

  // ── acknowledgeAlert ──────────────────────────────────────────────────────

  describe("acknowledgeAlert", () => {
    it("updates matching alert status to acknowledged", () => {
      const sessionData = makeSessionData({
        nodes: {
          symptoms: [],
          diagnoses: [],
          treatments: [],
          actions: [makeAction("alert-1", "alert")],
        },
      });
      manager.setSessionData(sessionData);

      manager.acknowledgeAlert("alert-1");

      const action = manager.getSessionData()!.nodes.actions.find(
        (a: any) => a.id === "alert-1",
      );
      expect(action.status).toBe("acknowledged");
    });

    it("calls sessionDataActions.acknowledgeAlert", async () => {
      const { sessionDataActions } = await import("./stores/session-data-store");
      vi.mocked(sessionDataActions.acknowledgeAlert).mockClear();

      manager.setSessionData(makeSessionData());
      manager.acknowledgeAlert("alert-1");

      expect(sessionDataActions.acknowledgeAlert).toHaveBeenCalledWith("alert-1");
    });
  });

  // ── static validateSessionData ────────────────────────────────────────────

  describe("SessionAnalysisManager.validateSessionData", () => {
    it("returns isValid=false with error when data is null/undefined", () => {
      const result = SessionAnalysisManager.validateSessionData(null as any);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("returns isValid=false when sessionId is missing", () => {
      const data = makeSessionData({ sessionId: undefined });
      const result = SessionAnalysisManager.validateSessionData(data);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Session ID is missing");
    });

    it("returns isValid=false when nodes is missing", () => {
      const data = makeSessionData({ nodes: undefined });
      const result = SessionAnalysisManager.validateSessionData(data);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Nodes data is missing");
    });

    it("returns isValid=true for valid session data", () => {
      const result = SessionAnalysisManager.validateSessionData(makeSessionData());
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("reports orphaned relationship references", () => {
      const data = makeSessionData({
        nodes: {
          symptoms: [],
          diagnoses: [],
          treatments: [],
          actions: [
            {
              id: "act-1",
              actionType: "question",
              relationships: [{ nodeId: "nonexistent-node", strength: 1 }],
            },
          ],
        },
      });
      const result = SessionAnalysisManager.validateSessionData(data);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e: string) => e.includes("nonexistent-node"))).toBe(true);
    });
  });

  // ── static getActionsAffectingDiagnosis ───────────────────────────────────

  describe("SessionAnalysisManager.getActionsAffectingDiagnosis", () => {
    it("returns empty arrays when nodes.actions is absent", () => {
      const result = SessionAnalysisManager.getActionsAffectingDiagnosis(
        { nodes: {} } as any,
        "diag-1",
      );
      expect(result.supportingActions).toEqual([]);
      expect(result.contradictingActions).toEqual([]);
    });

    it("classifies actions with positive impact as supporting", () => {
      const sessionData = makeSessionData({
        nodes: {
          symptoms: [],
          diagnoses: [makeDiagnosis("diag-1")],
          treatments: [],
          actions: [
            {
              id: "act-yes",
              actionType: "question",
              impact: { diagnoses: { "diag-1": 0.5 } },
              relationships: [],
            },
            {
              id: "act-no",
              actionType: "question",
              impact: { diagnoses: { "diag-1": -0.3 } },
              relationships: [],
            },
          ],
        },
      });

      const result = SessionAnalysisManager.getActionsAffectingDiagnosis(sessionData, "diag-1");

      expect(result.supportingActions.map((a: any) => a.id)).toContain("act-yes");
      expect(result.contradictingActions.map((a: any) => a.id)).toContain("act-no");
    });

    it("excludes actions with no impact on the diagnosis", () => {
      const sessionData = makeSessionData({
        nodes: {
          symptoms: [],
          diagnoses: [],
          treatments: [],
          actions: [
            {
              id: "unrelated",
              actionType: "question",
              impact: { diagnoses: {} },
              relationships: [],
            },
          ],
        },
      });

      const result = SessionAnalysisManager.getActionsAffectingDiagnosis(sessionData, "diag-1");

      expect(result.supportingActions).toHaveLength(0);
      expect(result.contradictingActions).toHaveLength(0);
    });
  });

  // ── createAnalysisManager factory ─────────────────────────────────────────

  describe("createAnalysisManager", () => {
    it("returns a manager with the provided session data", () => {
      const data = makeSessionData();
      const m = createAnalysisManager(data);
      expect(m.getSessionData()).toBe(data);
    });
  });
});
