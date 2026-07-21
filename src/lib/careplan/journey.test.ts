import { describe, it, expect } from "vitest";
import {
  Trend,
  calculateGoalTrend,
  computeGoalTrend,
  calculateMilestones,
  buildJourneyEvents,
  progressByPeriods,
} from "./journey";
import type { CarePlanGoal, CarePlanItem, FollowUpTask } from "./types";

describe("calculateGoalTrend", () => {
  it("is Unknown without a current value", () => {
    expect(calculateGoalTrend({ targetValue: 100 })).toBe(Trend.Unknown);
  });
  it("detects improvement toward a numeric target", () => {
    expect(
      calculateGoalTrend({
        targetValue: 100,
        currentValue: 90,
        historicalData: [{ value: 80 }, { value: 90 }],
      }),
    ).toBe(Trend.Improving);
  });
  it("is Stable within a target range", () => {
    expect(
      calculateGoalTrend({
        targetRange: { min: 6, max: 7 },
        currentValue: 6.5,
        historicalData: [{ value: 6.4 }, { value: 6.5 }],
      }),
    ).toBe(Trend.Stable);
  });
});

describe("computeGoalTrend", () => {
  it("sorts values and computes the trend", () => {
    const goal = { targetValue: 100 } as CarePlanGoal;
    const trend = computeGoalTrend(goal, [
      { date: "2026-02-01", value: 80 },
      { date: "2026-03-01", value: 90 },
    ]);
    expect(trend).toBe(Trend.Improving);
  });
});

describe("calculateMilestones", () => {
  it("positions milestones on a shared timeline with a current marker", () => {
    const cfg = calculateMilestones(
      [
        {
          title: "Lab",
          startDate: "2026-01-01",
          endDate: "2026-01-01",
          achieved: true,
        },
        { title: "Appt", startDate: "2026-04-01", endDate: "2026-04-01" },
      ],
      new Date("2026-02-15"),
    );
    expect(cfg.minStartDate).toBe("2026-01-01");
    expect(cfg.milestonePositions.length).toBe(2);
    expect(cfg.currentDatePosition).toBeGreaterThan(0);
    expect(cfg.currentDatePosition).toBeLessThan(1);
  });
});

function item(tasks: FollowUpTask[]): CarePlanItem {
  return {
    id: "i1",
    diagnosisDescription: "x",
    conditionType: "chronic",
    certaintyCycleInDays: 180,
    firstSeenDate: "2026-01-01",
    lastSeenInDocumentDate: "2026-01-01",
    confirmingDocuments: [],
    contradictingDocuments: [],
    status: "active",
    diagnosis: { description: "x" },
    tasks,
    goals: [],
    medicationIds: [],
    monitoringSignals: [],
    bodyParts: [],
  };
}
function task(over: Partial<FollowUpTask>): FollowUpTask {
  return {
    id: "t",
    text: "do",
    category: "follow_up",
    priority: "routine",
    sourceDocumentDate: "2026-01-01",
    certaintyCycleInDays: 90,
    status: "pending",
    diagnosisItemId: "i1",
    ...over,
  };
}

describe("buildJourneyEvents", () => {
  it("emits import/session/task events sorted by date", () => {
    const docs = [
      {
        id: "d1",
        metadata: {
          title: "GP note",
          date: "2026-02-01",
          originKind: "import",
        },
      },
      {
        id: "d2",
        metadata: {
          title: "Consult",
          date: "2026-03-01",
          originKind: "session",
        },
      },
    ] as any;
    const plan = {
      items: [
        item([task({ id: "t1", status: "done", completedAt: "2026-02-15" })]),
      ],
    };
    const events = buildJourneyEvents(plan, docs);
    expect(events.map((e) => e.type)).toEqual([
      "import",
      "task_done",
      "session",
    ]);
  });
});

describe("progressByPeriods", () => {
  it("counts achieved vs awaiting per window", () => {
    const now = new Date("2026-03-01T00:00:00Z");
    const plan = {
      items: [
        item([
          task({ id: "a", status: "done", completedAt: "2026-02-28" }),
          task({ id: "b", status: "pending", dueDate: "2026-03-03" }),
        ]),
      ],
    };
    const bars = progressByPeriods(plan, now);
    const week = bars.find((b) => b.period === "week")!;
    expect(week.achieved).toBe(1);
    expect(week.awaiting).toBe(1);
  });
});
