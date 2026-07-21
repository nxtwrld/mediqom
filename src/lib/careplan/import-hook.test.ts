import { describe, it, expect, vi, beforeEach } from "vitest";

const getFullPlan = vi.fn();
const saveCarePlan = vi.fn();

vi.mock("./store", () => ({
  getFullPlan: (...a: any[]) => getFullPlan(...a),
  saveCarePlan: (...a: any[]) => saveCarePlan(...a),
}));
vi.mock("$lib/logging/logger", () => {
  const noopLog = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return {
    logger: { documents: noopLog, api: noopLog },
    log: { analysis: noopLog, documents: noopLog, session: noopLog },
  };
});
vi.mock("$data/signal-catalog", () => ({
  getSignal: () => undefined,
  getCatalog: () => ({}),
}));

import { mergeDocumentIntoCarePlan } from "./import-hook";

describe("mergeDocumentIntoCarePlan", () => {
  beforeEach(() => {
    getFullPlan
      .mockReset()
      .mockResolvedValue({
        items: [],
        historicalItems: [],
        updatedAt: "2026-01-01",
      });
    saveCarePlan.mockReset().mockResolvedValue(undefined);
  });

  it("returns null and saves nothing when nothing is extractable", async () => {
    const delta = await mergeDocumentIntoCarePlan(
      { title: "x" },
      "p1",
      "doc1",
      "2026-03-01",
      false,
    );
    expect(delta).toBeNull();
    expect(saveCarePlan).not.toHaveBeenCalled();
  });

  it("merges a diagnosis and saves the new plan", async () => {
    const content = { diagnosis: [{ code: "E11", description: "Diabetes" }] };
    const delta = await mergeDocumentIntoCarePlan(
      content,
      "p1",
      "doc1",
      "2026-03-01",
      false,
    );
    expect(delta?.newItems).toHaveLength(1);
    expect(saveCarePlan).toHaveBeenCalledOnce();
  });

  it("never throws — a merge failure returns null", async () => {
    saveCarePlan.mockRejectedValueOnce(new Error("boom"));
    const content = { diagnosis: [{ code: "E11", description: "Diabetes" }] };
    const delta = await mergeDocumentIntoCarePlan(
      content,
      "p1",
      "doc1",
      "2026-03-01",
      false,
    );
    expect(delta).toBeNull();
  });
});

describe("recommendations node registration", () => {
  it("registers recommendations-processing as a context-aware Care Plan source", async () => {
    const { NODE_CONFIGURATIONS } =
      await import("$lib/langgraph/factories/universal-node-factory");
    const node = NODE_CONFIGURATIONS["recommendations-processing"];
    expect(node).toBeTruthy();
    expect(node.schemaPath).toBe("$lib/configurations/core.recommendations");
    expect(node.triggers).toContain("hasRecommendations");
    expect(node.consumesCarePlanContext).toBe(true);
    expect(node.outputMapping?.reportField).toBe("recommendationsDetailed");
    // diagnosis node must also consume context
    expect(
      NODE_CONFIGURATIONS["diagnosis-processing"].consumesCarePlanContext,
    ).toBe(true);
  });
});
