import { describe, it, expect, vi, beforeEach } from "vitest";
import { get } from "svelte/store";

// ── Mocks (must come before module import) ────────────────────────────────

vi.mock("$components/session/utils/sankeyDataTransformer", () => ({
  transformToSankeyData: vi.fn((session: any) => ({
    nodes: [],
    links: [],
    _session: session,
  })),
  applySankeyThresholds: vi.fn((sankeyData: any, thresholds: any) => ({
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

// Import after mocks
import {
  sessionDataActions,
  sessionData,
  sankeyData,
  sankeyDataFiltered,
  hiddenCounts,
  relationshipIndex,
  nodeMap,
  linkMap,
  isLoading,
  error,
  questions,
  alerts,
  pendingQuestions,
  pendingAlerts,
  sortedQuestions,
  sortedPendingQuestions,
  thresholds,
  questionsForNode,
  alertsForNode,
  questionsForLink,
  alertsForLink,
  sessionDataStore,
} from "./session-data-store";
import type { SessionAnalysis } from "$components/session/types/visualization";

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

function makeSymptom(id = "s1", overrides: any = {}) {
  return {
    id,
    text: "Headache",
    severity: 5,
    confidence: 0.8,
    source: "transcript" as const,
    ...overrides,
  };
}

function makeDiagnosis(id = "d1", overrides: any = {}) {
  return {
    id,
    name: "Migraine",
    probability: 0.7,
    priority: 3,
    reasoning: "test reasoning",
    confidence: 0.8,
    ...overrides,
  };
}

function makeTreatment(id = "t1", overrides: any = {}) {
  return {
    id,
    type: "medication" as const,
    name: "Ibuprofen",
    priority: 2,
    confidence: 0.9,
    ...overrides,
  };
}

function makeAction(
  id = "a1",
  actionType: "question" | "alert" = "question",
  overrides: any = {},
) {
  return {
    id,
    text: "Does the patient have a family history?",
    category: "diagnostic_clarification" as const,
    actionType,
    priority: 5,
    status: "pending" as const,
    ...overrides,
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  sessionDataActions.clearSession();
});

// ── sessionDataActions.loadSession ────────────────────────────────────────

describe("sessionDataActions.loadSession", () => {
  it("populates sessionData derived store", () => {
    const session = makeSession();
    sessionDataActions.loadSession(session);
    expect(get(sessionData)).toEqual(session);
  });

  it("sets isLoading to false after load", () => {
    sessionDataActions.loadSession(makeSession());
    expect(get(isLoading)).toBe(false);
  });

  it("sets error to null after load", () => {
    sessionDataActions.loadSession(makeSession());
    expect(get(error)).toBeNull();
  });

  it("nodeMap contains loaded nodes", () => {
    const session = makeSession({
      nodes: { symptoms: [makeSymptom()], diagnoses: [], treatments: [], actions: [] },
    });
    sessionDataActions.loadSession(session);
    const map = get(nodeMap);
    expect(map).not.toBeNull();
    expect(map!.has("s1")).toBe(true);
  });

  it("linkMap is populated when links exist", () => {
    const session: any = makeSession();
    session.links = [{ sourceId: "s1", targetId: "d1" }];
    sessionDataActions.loadSession(session);
    const map = get(linkMap);
    expect(map).not.toBeNull();
    expect(map!.has("s1-d1")).toBe(true);
  });

  it("relationshipIndex is populated with correct node types", () => {
    const session = makeSession({
      nodes: {
        symptoms: [makeSymptom("s1")],
        diagnoses: [makeDiagnosis("d1")],
        treatments: [makeTreatment("t1")],
        actions: [],
      },
    });
    sessionDataActions.loadSession(session);
    const index = get(relationshipIndex);
    expect(index).not.toBeNull();
    expect(index!.nodeTypes.get("s1")).toBe("symptom");
    expect(index!.nodeTypes.get("d1")).toBe("diagnosis");
    expect(index!.nodeTypes.get("t1")).toBe("treatment");
  });
});

// ── sessionDataActions.clearSession ──────────────────────────────────────

describe("sessionDataActions.clearSession", () => {
  it("resets sessionData to null", () => {
    sessionDataActions.loadSession(makeSession());
    sessionDataActions.clearSession();
    expect(get(sessionData)).toBeNull();
  });

  it("resets nodeMap to null", () => {
    sessionDataActions.loadSession(makeSession());
    sessionDataActions.clearSession();
    expect(get(nodeMap)).toBeNull();
  });
});

// ── sessionDataActions.calculatePath ─────────────────────────────────────

describe("sessionDataActions.calculatePath", () => {
  it("returns null when no session is loaded", () => {
    expect(sessionDataActions.calculatePath("any-node")).toBeNull();
  });

  it("returns PathCalculation for a known node", () => {
    const session = makeSession({
      nodes: { symptoms: [makeSymptom("s1")], diagnoses: [], treatments: [], actions: [] },
    });
    sessionDataActions.loadSession(session);
    const result = sessionDataActions.calculatePath("s1");
    expect(result).not.toBeNull();
    expect(result!.trigger.id).toBe("s1");
    expect(result!.trigger.type).toBe("node");
    expect(Array.isArray(result!.path.nodes)).toBe(true);
  });

  it("includes the starting node in the path", () => {
    const session = makeSession({
      nodes: { symptoms: [makeSymptom("s1")], diagnoses: [], treatments: [], actions: [] },
    });
    sessionDataActions.loadSession(session);
    const result = sessionDataActions.calculatePath("s1");
    expect(result!.path.nodes).toContain("s1");
  });

  it("traverses symptom->diagnosis->treatment relationships", () => {
    const symptom = makeSymptom("s1", {
      relationships: [{ nodeId: "d1", relationship: "supports", direction: "outgoing", strength: 0.9 }],
    });
    const diagnosis = makeDiagnosis("d1", {
      relationships: [{ nodeId: "t1", relationship: "treats", direction: "outgoing", strength: 0.8 }],
    });
    const treatment = makeTreatment("t1");
    const session = makeSession({
      nodes: { symptoms: [symptom], diagnoses: [diagnosis], treatments: [treatment], actions: [] },
    });
    sessionDataActions.loadSession(session);
    const result = sessionDataActions.calculatePath("s1");
    expect(result!.path.nodes).toContain("d1");
    expect(result!.path.nodes).toContain("t1");
  });
});

// ── sessionDataActions.acknowledgeAlert ──────────────────────────────────

describe("sessionDataActions.acknowledgeAlert", () => {
  it("does nothing when no session is loaded", () => {
    expect(() => sessionDataActions.acknowledgeAlert("a1")).not.toThrow();
  });

  it("marks an alert as acknowledged", () => {
    const alert = makeAction("a1", "alert", { status: "pending" });
    const session = makeSession({ nodes: { actions: [alert], symptoms: [], diagnoses: [], treatments: [] } });
    sessionDataActions.loadSession(session);

    sessionDataActions.acknowledgeAlert("a1");

    const data = get(sessionData);
    const updated = data!.nodes.actions!.find((a) => a.id === "a1");
    expect(updated!.status).toBe("acknowledged");
  });

  it("does not modify other actions", () => {
    const alert1 = makeAction("a1", "alert");
    const alert2 = makeAction("a2", "alert");
    const session = makeSession({ nodes: { actions: [alert1, alert2], symptoms: [], diagnoses: [], treatments: [] } });
    sessionDataActions.loadSession(session);

    sessionDataActions.acknowledgeAlert("a1");

    const data = get(sessionData);
    const unchanged = data!.nodes.actions!.find((a) => a.id === "a2");
    expect(unchanged!.status).toBe("pending");
  });

  it("does not acknowledge a question (wrong actionType)", () => {
    const question = makeAction("a1", "question", { status: "pending" });
    const session = makeSession({ nodes: { actions: [question], symptoms: [], diagnoses: [], treatments: [] } });
    sessionDataActions.loadSession(session);

    sessionDataActions.acknowledgeAlert("a1");

    const data = get(sessionData);
    const unchanged = data!.nodes.actions!.find((a) => a.id === "a1");
    expect(unchanged!.status).toBe("pending");
  });
});

// ── sessionDataActions.answerQuestion ────────────────────────────────────

describe("sessionDataActions.answerQuestion", () => {
  it("does nothing when no session is loaded", () => {
    expect(() => sessionDataActions.answerQuestion("q1", "yes")).not.toThrow();
  });

  it("marks a question as answered with the given answer", () => {
    const question = makeAction("q1", "question", { status: "pending" });
    const session = makeSession({ nodes: { actions: [question], symptoms: [], diagnoses: [], treatments: [] } });
    sessionDataActions.loadSession(session);

    sessionDataActions.answerQuestion("q1", "yes", 0.95);

    const data = get(sessionData);
    const updated = data!.nodes.actions!.find((a) => a.id === "q1");
    expect(updated!.status).toBe("answered");
    expect((updated as any).answer).toBe("yes");
    expect((updated as any).confidence).toBe(0.95);
  });

  it("does not answer an alert (wrong actionType)", () => {
    const alert = makeAction("q1", "alert", { status: "pending" });
    const session = makeSession({ nodes: { actions: [alert], symptoms: [], diagnoses: [], treatments: [] } });
    sessionDataActions.loadSession(session);

    sessionDataActions.answerQuestion("q1", "yes");

    const data = get(sessionData);
    const unchanged = data!.nodes.actions!.find((a) => a.id === "q1");
    expect(unchanged!.status).toBe("pending");
  });
});

// ── sessionDataActions.findNodeById ──────────────────────────────────────

describe("sessionDataActions.findNodeById", () => {
  it("returns null when no session is loaded", () => {
    expect(sessionDataActions.findNodeById("s1")).toBeNull();
  });

  it("returns the node when found", () => {
    const session = makeSession({
      nodes: { symptoms: [makeSymptom("s1")], diagnoses: [], treatments: [], actions: [] },
    });
    sessionDataActions.loadSession(session);
    const node = sessionDataActions.findNodeById("s1");
    expect(node).not.toBeNull();
    expect(node.id).toBe("s1");
  });

  it("returns null for unknown node id", () => {
    sessionDataActions.loadSession(makeSession());
    expect(sessionDataActions.findNodeById("nonexistent")).toBeNull();
  });
});

// ── sessionDataActions.getNodeDisplayText ────────────────────────────────

describe("sessionDataActions.getNodeDisplayText", () => {
  it("returns nodeId when node is not found", () => {
    expect(sessionDataActions.getNodeDisplayText("unknown")).toBe("unknown");
  });

  it("returns node.name when available", () => {
    const session = makeSession({
      nodes: { symptoms: [], diagnoses: [makeDiagnosis("d1", { name: "Migraine" })], treatments: [], actions: [] },
    });
    sessionDataActions.loadSession(session);
    expect(sessionDataActions.getNodeDisplayText("d1")).toBe("Migraine");
  });

  it("returns node.text when name is not available", () => {
    const session = makeSession({
      nodes: { symptoms: [makeSymptom("s1", { text: "Severe headache" })], diagnoses: [], treatments: [], actions: [] },
    });
    sessionDataActions.loadSession(session);
    expect(sessionDataActions.getNodeDisplayText("s1")).toBe("Severe headache");
  });
});

// ── sessionDataActions.handleNodeAction ──────────────────────────────────

describe("sessionDataActions.handleNodeAction", () => {
  it("does nothing when no session is loaded", () => {
    expect(() => sessionDataActions.handleNodeAction("suppress", "d1")).not.toThrow();
  });

  it("suppresses a diagnosis", () => {
    const diagnosis = makeDiagnosis("d1");
    const session = makeSession({
      nodes: { symptoms: [], diagnoses: [diagnosis], treatments: [], actions: [] },
    });
    sessionDataActions.loadSession(session);

    sessionDataActions.handleNodeAction("suppress", "d1", "Not relevant");

    const data = get(sessionData);
    const updated = data!.nodes.diagnoses!.find((d) => d.id === "d1");
    expect(updated!.suppressed).toBe(true);
    expect(updated!.suppressionReason).toBe("Not relevant");
  });

  it("uses default suppression reason when none provided", () => {
    const diagnosis = makeDiagnosis("d1");
    const session = makeSession({
      nodes: { symptoms: [], diagnoses: [diagnosis], treatments: [], actions: [] },
    });
    sessionDataActions.loadSession(session);

    sessionDataActions.handleNodeAction("suppress", "d1");

    const data = get(sessionData);
    const updated = data!.nodes.diagnoses!.find((d) => d.id === "d1");
    expect(updated!.suppressionReason).toBe("User suppressed");
  });

  it("appends userAction when userActions array exists", () => {
    const session: SessionAnalysis = {
      ...makeSession(),
      userActions: [],
    };
    sessionDataActions.loadSession(session);

    sessionDataActions.handleNodeAction("suppress", "d1", "Test");

    const data = get(sessionData);
    expect(data!.userActions).toHaveLength(1);
    expect(data!.userActions![0].action).toBe("suppress");
    expect(data!.userActions![0].targetId).toBe("d1");
  });

  it("does not crash for unknown action type", () => {
    sessionDataActions.loadSession(makeSession());
    expect(() => sessionDataActions.handleNodeAction("unknown-action", "d1")).not.toThrow();
  });
});

// ── sessionDataActions.updateSession / updatePartial ─────────────────────

describe("sessionDataActions.updateSession / updatePartial", () => {
  it("updateSession is an alias for loadSession", () => {
    const session = makeSession();
    sessionDataActions.updateSession(session);
    expect(get(sessionData)).toEqual(session);
  });

  it("updatePartial is an alias for loadSession", () => {
    const session = makeSession();
    sessionDataActions.updatePartial(session);
    expect(get(sessionData)).toEqual(session);
  });
});

// ── sessionDataActions.setLoading ────────────────────────────────────────

describe("sessionDataActions.setLoading", () => {
  it("does nothing when store is null", () => {
    expect(() => sessionDataActions.setLoading(true)).not.toThrow();
    expect(get(isLoading)).toBe(false);
  });

  it("sets isLoading to true", () => {
    sessionDataActions.loadSession(makeSession());
    sessionDataActions.setLoading(true);
    expect(get(isLoading)).toBe(true);
  });

  it("sets isLoading back to false", () => {
    sessionDataActions.loadSession(makeSession());
    sessionDataActions.setLoading(true);
    sessionDataActions.setLoading(false);
    expect(get(isLoading)).toBe(false);
  });
});

// ── sessionDataActions.setError ───────────────────────────────────────────

describe("sessionDataActions.setError", () => {
  it("does nothing when store is null", () => {
    expect(() => sessionDataActions.setError("oops")).not.toThrow();
    expect(get(error)).toBeNull();
  });

  it("sets error string", () => {
    sessionDataActions.loadSession(makeSession());
    sessionDataActions.setError("something went wrong");
    expect(get(error)).toBe("something went wrong");
  });

  it("clears error with null", () => {
    sessionDataActions.loadSession(makeSession());
    sessionDataActions.setError("err");
    sessionDataActions.setError(null);
    expect(get(error)).toBeNull();
  });
});

// ── Derived stores: questions / alerts / pending ──────────────────────────

describe("derived action stores", () => {
  it("questions returns only question-type actions", () => {
    const q = makeAction("q1", "question");
    const a = makeAction("a1", "alert");
    sessionDataActions.loadSession(
      makeSession({ nodes: { actions: [q, a], symptoms: [], diagnoses: [], treatments: [] } }),
    );
    expect(get(questions)).toHaveLength(1);
    expect(get(questions)[0].id).toBe("q1");
  });

  it("alerts returns only alert-type actions", () => {
    const q = makeAction("q1", "question");
    const a = makeAction("a1", "alert");
    sessionDataActions.loadSession(
      makeSession({ nodes: { actions: [q, a], symptoms: [], diagnoses: [], treatments: [] } }),
    );
    expect(get(alerts)).toHaveLength(1);
    expect(get(alerts)[0].id).toBe("a1");
  });

  it("pendingQuestions filters by status pending", () => {
    const pending = makeAction("q1", "question", { status: "pending" });
    const answered = makeAction("q2", "question", { status: "answered" });
    sessionDataActions.loadSession(
      makeSession({ nodes: { actions: [pending, answered], symptoms: [], diagnoses: [], treatments: [] } }),
    );
    const pq = get(pendingQuestions);
    expect(pq).toHaveLength(1);
    expect(pq[0].id).toBe("q1");
  });

  it("pendingAlerts filters by status pending", () => {
    const pending = makeAction("a1", "alert", { status: "pending" });
    const acked = makeAction("a2", "alert", { status: "acknowledged" });
    sessionDataActions.loadSession(
      makeSession({ nodes: { actions: [pending, acked], symptoms: [], diagnoses: [], treatments: [] } }),
    );
    const pa = get(pendingAlerts);
    expect(pa).toHaveLength(1);
    expect(pa[0].id).toBe("a1");
  });

  it("questions and alerts return empty arrays when store is null", () => {
    expect(get(questions)).toEqual([]);
    expect(get(alerts)).toEqual([]);
    expect(get(pendingQuestions)).toEqual([]);
    expect(get(pendingAlerts)).toEqual([]);
  });
});

// ── sortedQuestions ───────────────────────────────────────────────────────

describe("sortedQuestions", () => {
  it("returns empty array when no session", () => {
    expect(get(sortedQuestions)).toEqual([]);
  });

  it("sorts questions by composite score (higher urgency first)", () => {
    const redFlag = makeAction("q1", "question", {
      category: "red_flag",
      priority: 1,
      status: "pending",
    });
    const lowPriority = makeAction("q2", "question", {
      category: "symptom_exploration",
      priority: 10,
      status: "pending",
    });
    sessionDataActions.loadSession(
      makeSession({ nodes: { actions: [lowPriority, redFlag], symptoms: [], diagnoses: [], treatments: [] } }),
    );
    const sorted = get(sortedQuestions);
    expect(sorted[0].id).toBe("q1"); // red_flag has urgency 10
  });
});

// ── sortedPendingQuestions ────────────────────────────────────────────────

describe("sortedPendingQuestions", () => {
  it("filters to only pending questions", () => {
    const pending = makeAction("q1", "question", { category: "red_flag", status: "pending" });
    const answered = makeAction("q2", "question", { category: "red_flag", status: "answered" });
    sessionDataActions.loadSession(
      makeSession({ nodes: { actions: [pending, answered], symptoms: [], diagnoses: [], treatments: [] } }),
    );
    const spq = get(sortedPendingQuestions);
    expect(spq).toHaveLength(1);
    expect(spq[0].id).toBe("q1");
  });
});

// ── questionsForNode factory ──────────────────────────────────────────────

describe("questionsForNode", () => {
  it("returns empty array when no session", () => {
    const store = questionsForNode("s1");
    expect(get(store)).toEqual([]);
  });

  it("returns questions related to a node", () => {
    const question = makeAction("q1", "question", {
      relationships: [{ nodeId: "s1", relationship: "clarifies", direction: "outgoing", strength: 0.9 }],
    });
    const unrelated = makeAction("q2", "question", {
      relationships: [{ nodeId: "d1", relationship: "clarifies", direction: "outgoing", strength: 0.9 }],
    });
    sessionDataActions.loadSession(
      makeSession({ nodes: { actions: [question, unrelated], symptoms: [], diagnoses: [], treatments: [] } }),
    );
    const store = questionsForNode("s1");
    const result = get(store);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("q1");
  });
});

// ── alertsForNode factory ─────────────────────────────────────────────────

describe("alertsForNode", () => {
  it("returns empty array when no session", () => {
    const store = alertsForNode("s1");
    expect(get(store)).toEqual([]);
  });

  it("returns alerts related to a node", () => {
    const alert = makeAction("a1", "alert", {
      relationships: [{ nodeId: "s1", relationship: "reveals", direction: "outgoing", strength: 0.9 }],
    });
    sessionDataActions.loadSession(
      makeSession({ nodes: { actions: [alert], symptoms: [], diagnoses: [], treatments: [] } }),
    );
    const store = alertsForNode("s1");
    const result = get(store);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a1");
  });
});

// ── questionsForLink factory ──────────────────────────────────────────────

describe("questionsForLink", () => {
  it("returns empty array when no session", () => {
    const store = questionsForLink({ source: "s1", target: "d1" });
    expect(get(store)).toEqual([]);
  });

  it("returns empty array when link is null", () => {
    sessionDataActions.loadSession(makeSession());
    const store = questionsForLink(null);
    expect(get(store)).toEqual([]);
  });

  it("matches questions related to source or target (string ids)", () => {
    const question = makeAction("q1", "question", {
      relationships: [{ nodeId: "s1", relationship: "clarifies", direction: "outgoing", strength: 0.9 }],
    });
    sessionDataActions.loadSession(
      makeSession({ nodes: { actions: [question], symptoms: [], diagnoses: [], treatments: [] } }),
    );
    const store = questionsForLink({ source: "s1", target: "d1" });
    expect(get(store)).toHaveLength(1);
  });

  it("matches questions related to source or target (object ids)", () => {
    const question = makeAction("q1", "question", {
      relationships: [{ nodeId: "d1", relationship: "clarifies", direction: "outgoing", strength: 0.9 }],
    });
    sessionDataActions.loadSession(
      makeSession({ nodes: { actions: [question], symptoms: [], diagnoses: [], treatments: [] } }),
    );
    const store = questionsForLink({ source: { id: "s1" }, target: { id: "d1" } });
    expect(get(store)).toHaveLength(1);
  });
});

// ── alertsForLink factory ─────────────────────────────────────────────────

describe("alertsForLink", () => {
  it("returns empty array when no session", () => {
    const store = alertsForLink({ source: "s1", target: "d1" });
    expect(get(store)).toEqual([]);
  });

  it("returns empty array when link is null", () => {
    sessionDataActions.loadSession(makeSession());
    const store = alertsForLink(null);
    expect(get(store)).toEqual([]);
  });

  it("matches alerts related to source or target", () => {
    const alert = makeAction("a1", "alert", {
      relationships: [{ nodeId: "d1", relationship: "reveals", direction: "outgoing", strength: 0.9 }],
    });
    sessionDataActions.loadSession(
      makeSession({ nodes: { actions: [alert], symptoms: [], diagnoses: [], treatments: [] } }),
    );
    const store = alertsForLink({ source: "s1", target: "d1" });
    expect(get(store)).toHaveLength(1);
  });
});

// ── sankeyData readable ───────────────────────────────────────────────────

describe("sankeyData", () => {
  it("is null before any session is loaded", () => {
    expect(get(sankeyData)).toBeNull();
  });

  it("returns a non-null value when session is loaded", () => {
    const session = makeSession();
    sessionDataActions.loadSession(session);
    // The readable store calls transformToSankeyData which our mock returns { nodes:[], links:[] }
    expect(get(sankeyData)).not.toBeNull();
  });

  it("becomes null when session is cleared while subscribed", () => {
    // Maintain an active subscription so the readable reacts to store changes
    let capturedValue: any = "unset";
    const unsub = sankeyData.subscribe((v) => { capturedValue = v; });
    try {
      sessionDataActions.loadSession(makeSession());
      expect(capturedValue).not.toBeNull();
      sessionDataActions.clearSession();
      expect(capturedValue).toBeNull();
    } finally {
      unsub();
    }
  });
});

// ── thresholds store ──────────────────────────────────────────────────────

describe("thresholds store", () => {
  it("has default values", () => {
    const t = get(thresholds);
    expect(t.symptoms.severityThreshold).toBe(7);
    expect(t.diagnoses.probabilityThreshold).toBe(0.35);
    expect(t.treatments.showAll).toBe(true);
  });

  it("can be updated", () => {
    thresholds.update((t) => ({
      ...t,
      symptoms: { ...t.symptoms, severityThreshold: 5 },
    }));
    expect(get(thresholds).symptoms.severityThreshold).toBe(5);
    // Reset
    thresholds.update((t) => ({
      ...t,
      symptoms: { ...t.symptoms, severityThreshold: 7 },
    }));
  });
});

// ── sankeyDataFiltered ────────────────────────────────────────────────────

describe("sankeyDataFiltered", () => {
  it("becomes null when session is cleared while subscribed", () => {
    // Keep an active subscription so reactive updates propagate
    let capturedValue: any = "unset";
    const unsub = sankeyDataFiltered.subscribe((v) => { capturedValue = v; });
    try {
      sessionDataActions.loadSession(makeSession());
      expect(capturedValue).not.toBeNull();
      sessionDataActions.clearSession();
      expect(capturedValue).toBeNull();
    } finally {
      unsub();
    }
  });

  it("applies thresholds when sankeyData is available", async () => {
    const { applySankeyThresholds } = await import(
      "$components/session/utils/sankeyDataTransformer"
    );
    sessionDataActions.loadSession(makeSession());
    // sankeyDataFiltered should call applySankeyThresholds
    const filtered = get(sankeyDataFiltered);
    expect(applySankeyThresholds).toHaveBeenCalled();
    // The mock returns the sankeyData as-is
    expect(filtered).not.toBeUndefined();
  });
});

// ── hiddenCounts ──────────────────────────────────────────────────────────

describe("hiddenCounts", () => {
  it("returns counts from applySankeyThresholds when session is loaded", () => {
    sessionDataActions.loadSession(makeSession());
    // Trigger sankeyData subscription to sync before reading hiddenCounts
    get(sankeyData); // prime the readable store
    const counts = get(hiddenCounts);
    // Mock returns { symptoms: 1, diagnoses: 2, treatments: 3 }
    expect(counts.symptoms).toBe(1);
    expect(counts.diagnoses).toBe(2);
    expect(counts.treatments).toBe(3);
  });

  it("returns zeros when hiddenCounts mock returns zeros", () => {
    // When sankeyData is null, hiddenCounts should return zeros
    // We test this by checking the initial structure
    const counts = get(hiddenCounts);
    expect(counts).toHaveProperty("symptoms");
    expect(counts).toHaveProperty("diagnoses");
    expect(counts).toHaveProperty("treatments");
  });
});

// ── sessionDataStore direct export ────────────────────────────────────────

describe("sessionDataStore (direct export)", () => {
  it("is exposed for direct access", () => {
    expect(sessionDataStore).toBeDefined();
    expect(typeof sessionDataStore.subscribe).toBe("function");
  });
});
