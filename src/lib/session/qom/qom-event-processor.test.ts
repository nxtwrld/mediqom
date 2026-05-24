import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the store actions so event processing doesn't touch real stores
vi.mock("$lib/session/stores/qom-execution-store", () => ({
  qomActions: {
    processEvent: vi.fn(),
    updateNodeState: vi.fn(),
    addParallelExpert: vi.fn(),
    addNodes: vi.fn(),
  },
}));

// Mock the transformer
vi.mock("./qom-transformer", () => ({
  transformQOMState: vi.fn(() => ({ nodes: [], links: [] })),
}));

import { QOMEventProcessor, isValidQOMEvent } from "./qom-event-processor";

// ─── isValidQOMEvent ────────────────────────────────────

describe("isValidQOMEvent", () => {
  it("rejects null", () => {
    expect(isValidQOMEvent(null)).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isValidQOMEvent(undefined)).toBe(false);
  });

  it("rejects non-object", () => {
    expect(isValidQOMEvent("string")).toBe(false);
    expect(isValidQOMEvent(42)).toBe(false);
  });

  it("rejects object without type", () => {
    expect(isValidQOMEvent({})).toBe(false);
  });

  it("rejects unknown event type", () => {
    expect(isValidQOMEvent({ type: "unknown_event" })).toBe(false);
  });

  it.each([
    "qom_initialized",
    "node_started",
    "node_progress",
    "node_completed",
    "node_failed",
    "expert_triggered",
    "relationship_added",
    "model_switched",
    "qom_completed",
  ])("accepts valid event type '%s'", (type) => {
    expect(isValidQOMEvent({ type })).toBe(true);
  });
});

// ─── QOMEventProcessor ─────────────────────────────────

describe("QOMEventProcessor", () => {
  let processor: QOMEventProcessor;

  beforeEach(() => {
    vi.useFakeTimers();
    processor = new QOMEventProcessor();
  });

  afterEach(() => {
    processor.clearQueue();
    vi.useRealTimers();
  });

  it("starts with empty queue", () => {
    const status = processor.getQueueStatus();
    expect(status.queueLength).toBe(0);
    expect(status.processingQueue).toBe(false);
    expect(status.hasPendingBatch).toBe(false);
  });

  it("queues events and sets pending batch", () => {
    processor.processEvent({ type: "node_started", nodeId: "n1", nodeName: "Test", timestamp: Date.now() } as any);
    const status = processor.getQueueStatus();
    expect(status.queueLength).toBe(1);
    expect(status.hasPendingBatch).toBe(true);
  });

  it("processes batch after delay", async () => {
    const { qomActions } = await import("$lib/session/stores/qom-execution-store");

    processor.processEvent({
      type: "node_started",
      nodeId: "n1",
      nodeName: "Test",
      timestamp: Date.now(),
      provider: "openai",
      model: "gpt-4",
    } as any);

    // Before batch delay
    expect((qomActions.updateNodeState as any).mock.calls.length).toBe(0);

    // After batch delay (100ms)
    vi.advanceTimersByTime(100);

    expect((qomActions.updateNodeState as any).mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("clears queue on clearQueue()", () => {
    processor.processEvent({ type: "node_started", nodeId: "n1" } as any);
    processor.processEvent({ type: "node_completed", nodeId: "n1" } as any);

    processor.clearQueue();
    const status = processor.getQueueStatus();
    expect(status.queueLength).toBe(0);
    expect(status.hasPendingBatch).toBe(false);
    expect(status.processingQueue).toBe(false);
  });

  it("batches multiple events before processing", () => {
    processor.processEvent({ type: "node_started", nodeId: "n1", nodeName: "A", timestamp: 1 } as any);
    processor.processEvent({ type: "node_progress", nodeId: "n1", progress: 50 } as any);
    processor.processEvent({ type: "node_completed", nodeId: "n1", duration: 100 } as any);

    // All three should be queued
    expect(processor.getQueueStatus().queueLength).toBe(3);

    // Process the batch
    vi.advanceTimersByTime(100);

    // Queue should be empty after processing
    expect(processor.getQueueStatus().queueLength).toBe(0);
  });

  it("groups expert_triggered events by parent", async () => {
    const { qomActions } = await import("$lib/session/stores/qom-execution-store");
    vi.clearAllMocks();

    // Two experts from the same parent
    processor.processEvent({
      type: "expert_triggered",
      expertId: "e1",
      expertName: "Cardiology",
      parentId: "p1",
      triggerConditions: [],
    } as any);

    processor.processEvent({
      type: "expert_triggered",
      expertId: "e2",
      expertName: "Neurology",
      parentId: "p1",
      triggerConditions: [],
    } as any);

    vi.advanceTimersByTime(100);

    // Should use batch method (addNodes) for multiple experts from same parent
    expect((qomActions.addNodes as any).mock.calls.length).toBe(1);
  });

  it("uses individual processing for single expert per parent", async () => {
    const { qomActions } = await import("$lib/session/stores/qom-execution-store");
    vi.clearAllMocks();

    processor.processEvent({
      type: "expert_triggered",
      expertId: "e1",
      expertName: "Cardiology",
      parentId: "p1",
      triggerConditions: [],
    } as any);

    vi.advanceTimersByTime(100);

    // Should use individual method (addParallelExpert)
    expect((qomActions.addParallelExpert as any).mock.calls.length).toBe(1);
  });
});
