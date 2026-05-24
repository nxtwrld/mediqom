import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockProcessEvent } = vi.hoisted(() => ({
  mockProcessEvent: vi.fn(),
}));

vi.mock("./qom-event-processor", () => ({
  qomEventProcessor: { processEvent: mockProcessEvent },
}));

vi.mock("$lib/logging/logger", () => ({
  logger: { namespace: vi.fn().mockReturnValue({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

import {
  createRealisticMedicalQOMEvents,
  simulateRealisticMedicalQOM,
  SAMPLE_BASED_EXPERT_GENERATION,
} from "./qom-simulation";

describe("session/qom/qom-simulation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── createRealisticMedicalQOMEvents ───────────────────────────────────────

  describe("createRealisticMedicalQOMEvents", () => {
    it("returns an array of timed event steps", () => {
      const steps = createRealisticMedicalQOMEvents("session-1");
      expect(Array.isArray(steps)).toBe(true);
      expect(steps.length).toBeGreaterThan(0);
    });

    it("first step is qom_initialized event", () => {
      const steps = createRealisticMedicalQOMEvents("session-1");
      const firstEvent = Array.isArray(steps[0].events)
        ? steps[0].events[0]
        : steps[0].events;
      expect((firstEvent as any).type).toBe("qom_initialized");
    });

    it("each step has events and delayAfter fields", () => {
      const steps = createRealisticMedicalQOMEvents("test-session");
      for (const step of steps) {
        expect(step).toHaveProperty("events");
        expect(step).toHaveProperty("delayAfter");
        expect(typeof step.delayAfter).toBe("number");
      }
    });

    it("generates events that include node_started types", () => {
      const steps = createRealisticMedicalQOMEvents("session-2");
      const allEvents = steps.flatMap((s) =>
        Array.isArray(s.events) ? s.events : [s.events],
      ) as any[];
      const nodeStartedTypes = allEvents.filter((e) => e.type === "node_started");
      expect(nodeStartedTypes.length).toBeGreaterThan(0);
    });

    it("uses the provided sessionId in session_input completion output", () => {
      const sessionId = "my-unique-session";
      const steps = createRealisticMedicalQOMEvents(sessionId);
      const allEvents = steps.flatMap((s) =>
        Array.isArray(s.events) ? s.events : [s.events],
      ) as any[];
      const nodeCompletedWithSession = allEvents.find(
        (e) => e.type === "node_completed" && e.output?.sessionMetadata?.sessionId === sessionId,
      );
      expect(nodeCompletedWithSession).toBeDefined();
    });

    it("generates a reasonable number of steps (>10)", () => {
      const steps = createRealisticMedicalQOMEvents("session-3");
      expect(steps.length).toBeGreaterThan(10);
    });
  });

  // ── simulateRealisticMedicalQOM ───────────────────────────────────────────

  describe("simulateRealisticMedicalQOM", () => {
    beforeEach(() => {
      global.window = { setTimeout: vi.fn().mockImplementation((fn, ms) => {
        return setTimeout(fn, ms); // Delegate to vi fake timers
      }) } as any;
    });

    it("calls qomEventProcessor.processEvent for the first step", () => {
      simulateRealisticMedicalQOM("session-1");
      expect(mockProcessEvent).toHaveBeenCalled();
    });

    it("returns a cleanup function", () => {
      const cleanup = simulateRealisticMedicalQOM("session-1");
      expect(typeof cleanup).toBe("function");
    });

    it("cleanup function can be called without error", () => {
      const cleanup = simulateRealisticMedicalQOM("session-1");
      expect(() => cleanup()).not.toThrow();
    });

    it("processes subsequent steps after timer fires", () => {
      simulateRealisticMedicalQOM("session-2");
      const callsBefore = mockProcessEvent.mock.calls.length;

      vi.advanceTimersByTime(10000);

      expect(mockProcessEvent.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  // ── SAMPLE_BASED_EXPERT_GENERATION ────────────────────────────────────────

  describe("SAMPLE_BASED_EXPERT_GENERATION", () => {
    it("is exported and contains expert definitions", () => {
      expect(SAMPLE_BASED_EXPERT_GENERATION).toBeDefined();
      expect(typeof SAMPLE_BASED_EXPERT_GENERATION).toBe("object");
    });

    it("contains at least one expert type", () => {
      const keys = Object.keys(SAMPLE_BASED_EXPERT_GENERATION);
      expect(keys.length).toBeGreaterThan(0);
    });
  });
});
