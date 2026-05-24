import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { get } from "svelte/store";

// ── Mocks (must come before module import) ────────────────────────────────

vi.mock("$components/session/utils/sankeyDataTransformer", () => ({
  transformToSankeyData: vi.fn((session: any) => ({
    nodes: [],
    links: [],
    _session: session,
  })),
  applySankeyThresholds: vi.fn((sankeyData: any, _thresholds: any) => ({
    sankeyData: sankeyData,
    hiddenCounts: { symptoms: 1, diagnoses: 2, treatments: 3 },
  })),
}));

vi.mock("$lib/session/constants", () => ({
  QUESTION_SCORING: {
    URGENCY_SCORES: {
      red_flag: 10,
      risk_assessment: 8,
      drug_interaction: 7,
      contraindication: 7,
      allergy: 7,
      warning: 6,
      diagnostic_clarification: 6,
      symptom_exploration: 4,
      treatment_selection: 3,
    },
    WEIGHTS: { URGENCY: 0.4, RELEVANCE: 0.4, PRIORITY: 0.2 },
    SCALING: { PROBABILITY_MULTIPLIER: 10, PRIORITY_INVERSION: 11 },
  },
}));

vi.mock("$lib/logging/logger", () => ({
  logger: {
    session: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  },
}));

vi.mock("./utils/session-data-utils", () => ({
  buildRelationshipIndex: vi.fn().mockReturnValue({
    forward: new Map(),
    reverse: new Map(),
    nodeTypes: new Map([
      ["s1", "symptom"],
      ["d1", "diagnosis"],
      ["t1", "treatment"],
    ]),
  }),
  buildNodeAndLinkMaps: vi.fn().mockReturnValue({
    nodeMap: new Map([
      ["s1", { id: "s1", text: "Headache", severity: 5 }],
      ["d1", { id: "d1", name: "Migraine", probability: 0.7 }],
    ]),
    linkMap: new Map([["s1-d1", { sourceId: "s1", targetId: "d1" }]]),
  }),
  calculatePathFromNode: vi.fn().mockReturnValue({
    trigger: { type: "node", id: "s1", item: null },
    path: { nodes: ["s1"], links: [] },
  }),
  calculateCompositeScore: vi.fn().mockReturnValue(0.5),
}));

// ── Import after mocks ────────────────────────────────────────────────────

import { createSessionDataStoreInstance } from "./session-data-store-instance";
import type { SessionAnalysis } from "$components/session/types/visualization";
import {
  buildNodeAndLinkMaps,
  calculateCompositeScore,
} from "./utils/session-data-utils";

// ── Helpers ───────────────────────────────────────────────────────────────

function makeSession(overrides: Partial<SessionAnalysis> = {}): SessionAnalysis {
  return {
    sessionId: "session-1",
    timestamp: "2024-01-01T00:00:00Z",
    analysisVersion: 1,
    nodes: {
      symptoms: [],
      diagnoses: [],
      treatments: [],
      actions: [],
    },
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("createSessionDataStoreInstance", () => {
  let instance: ReturnType<typeof createSessionDataStoreInstance>;

  beforeEach(() => {
    vi.clearAllMocks();
    instance = createSessionDataStoreInstance("test-instance");
  });

  afterEach(() => {
    instance.cleanup();
  });

  // ── Factory basics ──────────────────────────────────────────────────────

  it("creates instance with given ID", () => {
    expect(instance.id).toBe("test-instance");
  });

  it("creates instance with generated ID when none provided", () => {
    const auto = createSessionDataStoreInstance();
    expect(auto.id).toMatch(/^session_data_/);
    auto.cleanup();
  });

  it("returns object with expected shape", () => {
    expect(typeof instance.actions.loadSession).toBe("function");
    expect(typeof instance.actions.clearSession).toBe("function");
    expect(typeof instance.actions.setLoading).toBe("function");
    expect(typeof instance.actions.setError).toBe("function");
    expect(typeof instance.actions.calculatePath).toBe("function");
    expect(typeof instance.actions.findNodeById).toBe("function");
    expect(typeof instance.cleanup).toBe("function");
  });

  // ── Initial state ───────────────────────────────────────────────────────

  it("sessionData is null initially", () => {
    expect(get(instance.sessionData)).toBeNull();
  });

  it("isLoading is false initially", () => {
    expect(get(instance.isLoading)).toBe(false);
  });

  it("error is null initially", () => {
    expect(get(instance.error)).toBeNull();
  });

  it("thresholds have default values", () => {
    const t = get(instance.thresholds);
    expect(t.symptoms.severityThreshold).toBe(7);
    expect(t.diagnoses.probabilityThreshold).toBe(0.35);
    expect(t.treatments.showAll).toBe(true);
  });

  // ── actions.loadSession ─────────────────────────────────────────────────

  describe("actions.loadSession", () => {
    it("sets sessionData derived store", () => {
      const session = makeSession();
      instance.actions.loadSession(session);
      expect(get(instance.sessionData)).toEqual(session);
    });

    it("sets isLoading to false after load", () => {
      instance.actions.loadSession(makeSession());
      expect(get(instance.isLoading)).toBe(false);
    });

    it("sets error to null after load", () => {
      instance.actions.loadSession(makeSession());
      expect(get(instance.error)).toBeNull();
    });

    it("populates nodeMap after load", () => {
      instance.actions.loadSession(makeSession());
      const map = get(instance.nodeMap);
      expect(map).not.toBeNull();
      expect(map!.has("s1")).toBe(true);
    });

    it("populates linkMap after load", () => {
      instance.actions.loadSession(makeSession());
      const map = get(instance.linkMap);
      expect(map).not.toBeNull();
    });

    it("populates relationshipIndex after load", () => {
      instance.actions.loadSession(makeSession());
      const index = get(instance.relationshipIndex);
      expect(index).not.toBeNull();
      expect(index!.nodeTypes.get("s1")).toBe("symptom");
    });
  });

  // ── actions.clearSession ────────────────────────────────────────────────

  describe("actions.clearSession", () => {
    it("resets sessionData to null", () => {
      instance.actions.loadSession(makeSession());
      instance.actions.clearSession();
      expect(get(instance.sessionData)).toBeNull();
    });

    it("resets nodeMap to null", () => {
      instance.actions.loadSession(makeSession());
      instance.actions.clearSession();
      expect(get(instance.nodeMap)).toBeNull();
    });

    it("resets relationshipIndex to null", () => {
      instance.actions.loadSession(makeSession());
      instance.actions.clearSession();
      expect(get(instance.relationshipIndex)).toBeNull();
    });
  });

  // ── actions.setLoading ──────────────────────────────────────────────────

  describe("actions.setLoading", () => {
    it("does nothing when store is null", () => {
      expect(() => instance.actions.setLoading(true)).not.toThrow();
      expect(get(instance.isLoading)).toBe(false);
    });

    it("sets isLoading to true", () => {
      instance.actions.loadSession(makeSession());
      instance.actions.setLoading(true);
      expect(get(instance.isLoading)).toBe(true);
    });

    it("sets isLoading back to false", () => {
      instance.actions.loadSession(makeSession());
      instance.actions.setLoading(true);
      instance.actions.setLoading(false);
      expect(get(instance.isLoading)).toBe(false);
    });
  });

  // ── actions.setError ────────────────────────────────────────────────────

  describe("actions.setError", () => {
    it("does nothing when store is null", () => {
      expect(() => instance.actions.setError("oops")).not.toThrow();
      expect(get(instance.error)).toBeNull();
    });

    it("sets error string", () => {
      instance.actions.loadSession(makeSession());
      instance.actions.setError("something went wrong");
      expect(get(instance.error)).toBe("something went wrong");
    });

    it("clears error with null", () => {
      instance.actions.loadSession(makeSession());
      instance.actions.setError("err");
      instance.actions.setError(null);
      expect(get(instance.error)).toBeNull();
    });
  });

  // ── actions.calculatePath ───────────────────────────────────────────────

  describe("actions.calculatePath", () => {
    it("returns null when no data is loaded", () => {
      expect(instance.actions.calculatePath("any-node")).toBeNull();
    });

    it("returns PathCalculation when session is loaded", () => {
      instance.actions.loadSession(makeSession());
      const result = instance.actions.calculatePath("s1");
      expect(result).not.toBeNull();
      expect(result!.trigger.id).toBe("s1");
      expect(result!.trigger.type).toBe("node");
      expect(Array.isArray(result!.path.nodes)).toBe(true);
    });
  });

  // ── actions.findNodeById (getNode alias) ────────────────────────────────

  describe("actions.findNodeById", () => {
    it("returns null when no data is loaded", () => {
      expect(instance.actions.findNodeById("s1")).toBeNull();
    });

    it("returns node when found", () => {
      instance.actions.loadSession(makeSession());
      const node = instance.actions.findNodeById("s1");
      expect(node).not.toBeNull();
      expect(node.id).toBe("s1");
    });

    it("returns null for unknown node id", () => {
      instance.actions.loadSession(makeSession());
      expect(instance.actions.findNodeById("nonexistent")).toBeNull();
    });
  });

  // ── sessionData derived ─────────────────────────────────────────────────

  describe("sessionData derived store", () => {
    it("returns null when cleared", () => {
      instance.actions.loadSession(makeSession());
      instance.actions.clearSession();
      expect(get(instance.sessionData)).toBeNull();
    });

    it("reflects loaded session", () => {
      const session = makeSession({ sessionId: "xyz" });
      instance.actions.loadSession(session);
      expect(get(instance.sessionData)!.sessionId).toBe("xyz");
    });
  });

  // ── sankeyData readable ─────────────────────────────────────────────────

  describe("sankeyData readable", () => {
    it("is null before session is loaded", () => {
      expect(get(instance.sankeyData)).toBeNull();
    });

    it("becomes non-null when session is loaded (via subscribe)", () => {
      let captured: any = "unset";
      const unsub = instance.sankeyData.subscribe((v) => {
        captured = v;
      });
      try {
        instance.actions.loadSession(makeSession());
        expect(captured).not.toBeNull();
      } finally {
        unsub();
      }
    });

    it("becomes null again when session is cleared while subscribed", () => {
      let captured: any = "unset";
      const unsub = instance.sankeyData.subscribe((v) => {
        captured = v;
      });
      try {
        instance.actions.loadSession(makeSession());
        expect(captured).not.toBeNull();
        instance.actions.clearSession();
        expect(captured).toBeNull();
      } finally {
        unsub();
      }
    });
  });

  // ── hiddenCounts derived ────────────────────────────────────────────────

  describe("hiddenCounts derived store", () => {
    it("returns zero counts when no session is loaded", () => {
      const counts = get(instance.hiddenCounts);
      expect(counts.symptoms).toBe(0);
      expect(counts.diagnoses).toBe(0);
      expect(counts.treatments).toBe(0);
    });

    it("returns mock values when session is loaded", () => {
      // Keep active subscription so sankeyData readable reacts
      let _sd: any;
      const unsub = instance.sankeyData.subscribe((v) => {
        _sd = v;
      });
      try {
        instance.actions.loadSession(makeSession());
        const counts = get(instance.hiddenCounts);
        expect(counts.symptoms).toBe(1);
        expect(counts.diagnoses).toBe(2);
        expect(counts.treatments).toBe(3);
      } finally {
        unsub();
      }
    });
  });

  // ── sankeyDataFiltered derived ──────────────────────────────────────────

  describe("sankeyDataFiltered derived store", () => {
    it("is null when no session is loaded", () => {
      expect(get(instance.sankeyDataFiltered)).toBeNull();
    });

    it("is not null when session is loaded (via subscription)", () => {
      let captured: any = "unset";
      const unsubSankey = instance.sankeyData.subscribe(() => {});
      const unsubFiltered = instance.sankeyDataFiltered.subscribe((v) => {
        captured = v;
      });
      try {
        instance.actions.loadSession(makeSession());
        expect(captured).not.toBeNull();
      } finally {
        unsubSankey();
        unsubFiltered();
      }
    });
  });

  // ── Cleanup ─────────────────────────────────────────────────────────────

  describe("cleanup", () => {
    it("can be called without error", () => {
      expect(() => instance.cleanup()).not.toThrow();
    });

    it("resets store to null after cleanup", () => {
      instance.actions.loadSession(makeSession());
      instance.cleanup();
      expect(get(instance.sessionData)).toBeNull();
    });

    it("resets thresholds to defaults after cleanup", () => {
      instance.thresholds.update((t) => ({
        ...t,
        symptoms: { ...t.symptoms, severityThreshold: 3 },
      }));
      instance.cleanup();
      const t = get(instance.thresholds);
      expect(t.symptoms.severityThreshold).toBe(7);
    });
  });

  // ── Instance isolation ──────────────────────────────────────────────────

  it("two instances are isolated from each other", () => {
    const other = createSessionDataStoreInstance("other-instance");
    try {
      instance.actions.loadSession(makeSession({ sessionId: "instance-a" }));
      expect(get(instance.sessionData)!.sessionId).toBe("instance-a");
      expect(get(other.sessionData)).toBeNull();
    } finally {
      other.cleanup();
    }
  });

  // ── actions.acknowledgeAlert ────────────────────────────────────────────

  describe("actions.acknowledgeAlert", () => {
    it("does nothing when store is null", () => {
      expect(() => instance.actions.acknowledgeAlert("alert-1")).not.toThrow();
    });

    it("does nothing when sessionData.nodes.actions is missing", () => {
      const session = makeSession({ nodes: { symptoms: [], diagnoses: [], treatments: [], actions: undefined as any } });
      instance.actions.loadSession(session);
      expect(() => instance.actions.acknowledgeAlert("alert-1")).not.toThrow();
    });

    it("marks matching alert action as acknowledged", () => {
      const session = makeSession({
        nodes: {
          symptoms: [],
          diagnoses: [],
          treatments: [],
          actions: [
            { id: "alert-1", actionType: "alert", status: "pending", relationships: [] } as any,
            { id: "q-1", actionType: "question", status: "pending", relationships: [] } as any,
          ],
        },
      });
      instance.actions.loadSession(session);
      instance.actions.acknowledgeAlert("alert-1");

      const data = get(instance.sessionData);
      const alert = data!.nodes.actions!.find((a: any) => a.id === "alert-1");
      expect(alert!.status).toBe("acknowledged");
    });

    it("does not change non-matching actions", () => {
      const session = makeSession({
        nodes: {
          symptoms: [],
          diagnoses: [],
          treatments: [],
          actions: [
            { id: "alert-2", actionType: "alert", status: "pending", relationships: [] } as any,
          ],
        },
      });
      instance.actions.loadSession(session);
      instance.actions.acknowledgeAlert("alert-1");

      const data = get(instance.sessionData);
      const alert = data!.nodes.actions!.find((a: any) => a.id === "alert-2");
      expect(alert!.status).toBe("pending");
    });

    it("does not acknowledge a question action even if id matches", () => {
      const session = makeSession({
        nodes: {
          symptoms: [],
          diagnoses: [],
          treatments: [],
          actions: [
            { id: "alert-1", actionType: "question", status: "pending", relationships: [] } as any,
          ],
        },
      });
      instance.actions.loadSession(session);
      instance.actions.acknowledgeAlert("alert-1");

      const data = get(instance.sessionData);
      const action = data!.nodes.actions!.find((a: any) => a.id === "alert-1");
      expect(action!.status).toBe("pending");
    });
  });

  // ── actions.answerQuestion ──────────────────────────────────────────────

  describe("actions.answerQuestion", () => {
    it("does nothing when store is null", () => {
      expect(() => instance.actions.answerQuestion("q-1", "yes")).not.toThrow();
    });

    it("does nothing when sessionData.nodes.actions is missing", () => {
      const session = makeSession({ nodes: { symptoms: [], diagnoses: [], treatments: [], actions: undefined as any } });
      instance.actions.loadSession(session);
      expect(() => instance.actions.answerQuestion("q-1", "yes")).not.toThrow();
    });

    it("marks matching question action as answered with answer and confidence", () => {
      const session = makeSession({
        nodes: {
          symptoms: [],
          diagnoses: [],
          treatments: [],
          actions: [
            { id: "q-1", actionType: "question", status: "pending", relationships: [] } as any,
          ],
        },
      });
      instance.actions.loadSession(session);
      instance.actions.answerQuestion("q-1", "yes", 0.9);

      const data = get(instance.sessionData);
      const question = data!.nodes.actions!.find((a: any) => a.id === "q-1");
      expect(question!.status).toBe("answered");
      expect((question as any).answer).toBe("yes");
      expect((question as any).confidence).toBe(0.9);
    });

    it("does not answer a non-question action even if id matches", () => {
      const session = makeSession({
        nodes: {
          symptoms: [],
          diagnoses: [],
          treatments: [],
          actions: [
            { id: "q-1", actionType: "alert", status: "pending", relationships: [] } as any,
          ],
        },
      });
      instance.actions.loadSession(session);
      instance.actions.answerQuestion("q-1", "yes");

      const data = get(instance.sessionData);
      const action = data!.nodes.actions!.find((a: any) => a.id === "q-1");
      expect(action!.status).toBe("pending");
    });
  });

  // ── actions.getNodeDisplayText ──────────────────────────────────────────

  describe("actions.getNodeDisplayText", () => {
    it("returns nodeId when node is not found", () => {
      expect(instance.actions.getNodeDisplayText("nonexistent")).toBe("nonexistent");
    });

    it("returns node.name when node has name", () => {
      instance.actions.loadSession(makeSession());
      // nodeMap has d1 with name "Migraine"
      expect(instance.actions.getNodeDisplayText("d1")).toBe("Migraine");
    });

    it("returns node.text when node has text but no name", () => {
      instance.actions.loadSession(makeSession());
      // nodeMap has s1 with text "Headache" (no name)
      expect(instance.actions.getNodeDisplayText("s1")).toBe("Headache");
    });

    it("returns nodeId when node has neither name nor text", () => {
      vi.mocked(buildNodeAndLinkMaps).mockReturnValueOnce({
        nodeMap: new Map([["bare-1", { id: "bare-1" }]]),
        linkMap: new Map(),
      });
      instance.actions.loadSession(makeSession());
      expect(instance.actions.getNodeDisplayText("bare-1")).toBe("bare-1");
    });
  });

  // ── actions.handleNodeAction ────────────────────────────────────────────

  describe("actions.handleNodeAction", () => {
    it("does nothing when store is null", () => {
      expect(() => instance.actions.handleNodeAction("suppress", "d1")).not.toThrow();
    });

    it("suppresses a diagnosis node", () => {
      const session = makeSession({
        nodes: {
          symptoms: [],
          diagnoses: [{ id: "d1", name: "Migraine", probability: 0.7, suppressed: false } as any],
          treatments: [],
          actions: [],
        },
        userActions: [],
      });
      instance.actions.loadSession(session);
      instance.actions.handleNodeAction("suppress", "d1", "Not relevant");

      const data = get(instance.sessionData);
      const diag = data!.nodes.diagnoses!.find((d: any) => d.id === "d1");
      expect(diag!.suppressed).toBe(true);
      expect((diag as any).suppressionReason).toBe("Not relevant");
    });

    it("uses default suppression reason when none provided", () => {
      const session = makeSession({
        nodes: {
          symptoms: [],
          diagnoses: [{ id: "d1", name: "Migraine", probability: 0.7 } as any],
          treatments: [],
          actions: [],
        },
        userActions: [],
      });
      instance.actions.loadSession(session);
      instance.actions.handleNodeAction("suppress", "d1");

      const data = get(instance.sessionData);
      const diag = data!.nodes.diagnoses!.find((d: any) => d.id === "d1");
      expect((diag as any).suppressionReason).toBe("User suppressed");
    });

    it("appends to userActions when userActions is present", () => {
      const session = makeSession({
        nodes: { symptoms: [], diagnoses: [], treatments: [], actions: [] },
        userActions: [],
      });
      instance.actions.loadSession(session);
      instance.actions.handleNodeAction("flag", "s1", "important");

      const data = get(instance.sessionData);
      expect(data!.userActions).toHaveLength(1);
      expect(data!.userActions![0].action).toBe("flag");
      expect(data!.userActions![0].targetId).toBe("s1");
      expect(data!.userActions![0].reason).toBe("important");
    });

    it("does not append userActions when userActions is undefined", () => {
      const session = makeSession({
        nodes: { symptoms: [], diagnoses: [], treatments: [], actions: [] },
        // no userActions field
      });
      instance.actions.loadSession(session);
      // Should not throw
      expect(() => instance.actions.handleNodeAction("flag", "s1")).not.toThrow();
    });

    it("does not suppress non-matching diagnosis", () => {
      const session = makeSession({
        nodes: {
          symptoms: [],
          diagnoses: [
            { id: "d2", name: "Other", probability: 0.3, suppressed: false } as any,
          ],
          treatments: [],
          actions: [],
        },
        userActions: [],
      });
      instance.actions.loadSession(session);
      instance.actions.handleNodeAction("suppress", "d1");

      const data = get(instance.sessionData);
      const diag = data!.nodes.diagnoses!.find((d: any) => d.id === "d2");
      expect(diag!.suppressed).toBe(false);
    });
  });

  // ── actions.updateSession / updatePartial ───────────────────────────────

  describe("actions.updateSession and updatePartial", () => {
    it("updateSession loads the session", () => {
      const session = makeSession({ sessionId: "updated" });
      instance.actions.updateSession(session);
      expect(get(instance.sessionData)!.sessionId).toBe("updated");
    });

    it("updatePartial loads the session", () => {
      const session = makeSession({ sessionId: "partial-updated" });
      instance.actions.updatePartial(session);
      expect(get(instance.sessionData)!.sessionId).toBe("partial-updated");
    });
  });

  // ── actions.getCurrentSessionData ──────────────────────────────────────

  describe("actions.getCurrentSessionData", () => {
    it("returns null when no session is loaded", () => {
      expect(instance.actions.getCurrentSessionData()).toBeNull();
    });

    it("returns current session data when loaded", () => {
      const session = makeSession({ sessionId: "current-test" });
      instance.actions.loadSession(session);
      const result = instance.actions.getCurrentSessionData();
      expect(result).not.toBeNull();
      expect(result!.sessionId).toBe("current-test");
    });
  });

  // ── questionsForNode factory ────────────────────────────────────────────

  describe("questionsForNode", () => {
    it("returns empty array when no session is loaded", () => {
      const store = instance.questionsForNode("s1");
      expect(get(store)).toEqual([]);
    });

    it("returns empty array when no actions exist", () => {
      instance.actions.loadSession(makeSession());
      const store = instance.questionsForNode("s1");
      expect(get(store)).toEqual([]);
    });

    it("returns questions related to the given nodeId", () => {
      const session = makeSession({
        nodes: {
          symptoms: [],
          diagnoses: [],
          treatments: [],
          actions: [
            {
              id: "q-1",
              actionType: "question",
              status: "pending",
              relationships: [{ nodeId: "s1", type: "related" }],
            } as any,
            {
              id: "q-2",
              actionType: "question",
              status: "pending",
              relationships: [{ nodeId: "d1", type: "related" }],
            } as any,
            {
              id: "a-1",
              actionType: "alert",
              status: "pending",
              relationships: [{ nodeId: "s1", type: "related" }],
            } as any,
          ],
        },
      });
      instance.actions.loadSession(session);
      const store = instance.questionsForNode("s1");
      const result = get(store);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("q-1");
    });
  });

  // ── alertsForNode factory ───────────────────────────────────────────────

  describe("alertsForNode", () => {
    it("returns empty array when no session is loaded", () => {
      const store = instance.alertsForNode("s1");
      expect(get(store)).toEqual([]);
    });

    it("returns alerts related to the given nodeId", () => {
      const session = makeSession({
        nodes: {
          symptoms: [],
          diagnoses: [],
          treatments: [],
          actions: [
            {
              id: "a-1",
              actionType: "alert",
              status: "pending",
              relationships: [{ nodeId: "s1", type: "related" }],
            } as any,
            {
              id: "q-1",
              actionType: "question",
              status: "pending",
              relationships: [{ nodeId: "s1", type: "related" }],
            } as any,
          ],
        },
      });
      instance.actions.loadSession(session);
      const store = instance.alertsForNode("s1");
      const result = get(store);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("a-1");
    });
  });

  // ── questionsForLink factory ────────────────────────────────────────────

  describe("questionsForLink", () => {
    it("returns empty array when no session is loaded", () => {
      const store = instance.questionsForLink({ source: "s1", target: "d1" });
      expect(get(store)).toEqual([]);
    });

    it("returns empty array when link is null/undefined", () => {
      instance.actions.loadSession(makeSession());
      const store = instance.questionsForLink(null);
      expect(get(store)).toEqual([]);
    });

    it("returns questions related to link source or target (string ids)", () => {
      const session = makeSession({
        nodes: {
          symptoms: [],
          diagnoses: [],
          treatments: [],
          actions: [
            {
              id: "q-1",
              actionType: "question",
              status: "pending",
              relationships: [{ nodeId: "s1", type: "related" }],
            } as any,
            {
              id: "q-2",
              actionType: "question",
              status: "pending",
              relationships: [{ nodeId: "d1", type: "related" }],
            } as any,
            {
              id: "q-3",
              actionType: "question",
              status: "pending",
              relationships: [{ nodeId: "t1", type: "related" }],
            } as any,
          ],
        },
      });
      instance.actions.loadSession(session);
      const store = instance.questionsForLink({ source: "s1", target: "d1" });
      const result = get(store);
      expect(result).toHaveLength(2);
      expect(result.map((q: any) => q.id)).toContain("q-1");
      expect(result.map((q: any) => q.id)).toContain("q-2");
    });

    it("handles link with object source and target (extracts .id)", () => {
      const session = makeSession({
        nodes: {
          symptoms: [],
          diagnoses: [],
          treatments: [],
          actions: [
            {
              id: "q-1",
              actionType: "question",
              status: "pending",
              relationships: [{ nodeId: "s1", type: "related" }],
            } as any,
          ],
        },
      });
      instance.actions.loadSession(session);
      const store = instance.questionsForLink({ source: { id: "s1" }, target: { id: "d1" } });
      const result = get(store);
      expect(result).toHaveLength(1);
    });
  });

  // ── alertsForLink factory ───────────────────────────────────────────────

  describe("alertsForLink", () => {
    it("returns empty array when no session is loaded", () => {
      const store = instance.alertsForLink({ source: "s1", target: "d1" });
      expect(get(store)).toEqual([]);
    });

    it("returns empty array when link is null", () => {
      instance.actions.loadSession(makeSession());
      const store = instance.alertsForLink(null);
      expect(get(store)).toEqual([]);
    });

    it("returns alerts related to link source or target", () => {
      const session = makeSession({
        nodes: {
          symptoms: [],
          diagnoses: [],
          treatments: [],
          actions: [
            {
              id: "a-1",
              actionType: "alert",
              status: "pending",
              relationships: [{ nodeId: "s1", type: "related" }],
            } as any,
            {
              id: "q-1",
              actionType: "question",
              status: "pending",
              relationships: [{ nodeId: "s1", type: "related" }],
            } as any,
          ],
        },
      });
      instance.actions.loadSession(session);
      const store = instance.alertsForLink({ source: "s1", target: "d1" });
      const result = get(store);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("a-1");
    });

    it("handles link with object source and target", () => {
      const session = makeSession({
        nodes: {
          symptoms: [],
          diagnoses: [],
          treatments: [],
          actions: [
            {
              id: "a-1",
              actionType: "alert",
              status: "pending",
              relationships: [{ nodeId: "d1", type: "related" }],
            } as any,
          ],
        },
      });
      instance.actions.loadSession(session);
      const store = instance.alertsForLink({ source: { id: "s1" }, target: { id: "d1" } });
      const result = get(store);
      expect(result).toHaveLength(1);
    });
  });

  // ── sortedQuestions derived ─────────────────────────────────────────────

  describe("sortedQuestions derived store", () => {
    it("is empty when no session loaded", () => {
      expect(get(instance.sortedQuestions)).toEqual([]);
    });

    it("returns sorted questions by composite score", () => {
      vi.mocked(calculateCompositeScore)
        .mockReturnValueOnce(0.9)  // q-high
        .mockReturnValueOnce(0.1); // q-low

      const session = makeSession({
        nodes: {
          symptoms: [],
          diagnoses: [],
          treatments: [],
          actions: [
            { id: "q-low", actionType: "question", status: "pending", relationships: [] } as any,
            { id: "q-high", actionType: "question", status: "pending", relationships: [] } as any,
          ],
        },
      });
      instance.actions.loadSession(session);
      const sorted = get(instance.sortedQuestions);
      expect(sorted).toHaveLength(2);
      expect(sorted[0].id).toBe("q-high");
      expect(sorted[1].id).toBe("q-low");
    });
  });

  // ── sortedPendingQuestions derived ─────────────────────────────────────

  describe("sortedPendingQuestions derived store", () => {
    it("is empty when no session loaded", () => {
      expect(get(instance.sortedPendingQuestions)).toEqual([]);
    });

    it("only includes pending questions", () => {
      const session = makeSession({
        nodes: {
          symptoms: [],
          diagnoses: [],
          treatments: [],
          actions: [
            { id: "q-pending", actionType: "question", status: "pending", relationships: [] } as any,
            { id: "q-answered", actionType: "question", status: "answered", relationships: [] } as any,
          ],
        },
      });
      instance.actions.loadSession(session);
      const result = get(instance.sortedPendingQuestions);
      expect(result.every((q: any) => q.status === "pending")).toBe(true);
    });
  });

  // ── pendingQuestions / pendingAlerts derived ────────────────────────────

  describe("pendingQuestions derived store", () => {
    it("returns empty when no session loaded", () => {
      expect(get(instance.pendingQuestions)).toEqual([]);
    });

    it("returns only pending questions", () => {
      const session = makeSession({
        nodes: {
          symptoms: [],
          diagnoses: [],
          treatments: [],
          actions: [
            { id: "q-1", actionType: "question", status: "pending", relationships: [] } as any,
            { id: "q-2", actionType: "question", status: "answered", relationships: [] } as any,
            { id: "a-1", actionType: "alert", status: "pending", relationships: [] } as any,
          ],
        },
      });
      instance.actions.loadSession(session);
      const result = get(instance.pendingQuestions);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("q-1");
    });
  });

  describe("pendingAlerts derived store", () => {
    it("returns empty when no session loaded", () => {
      expect(get(instance.pendingAlerts)).toEqual([]);
    });

    it("returns only pending alerts", () => {
      const session = makeSession({
        nodes: {
          symptoms: [],
          diagnoses: [],
          treatments: [],
          actions: [
            { id: "a-1", actionType: "alert", status: "pending", relationships: [] } as any,
            { id: "a-2", actionType: "alert", status: "acknowledged", relationships: [] } as any,
            { id: "q-1", actionType: "question", status: "pending", relationships: [] } as any,
          ],
        },
      });
      instance.actions.loadSession(session);
      const result = get(instance.pendingAlerts);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("a-1");
    });
  });
});
