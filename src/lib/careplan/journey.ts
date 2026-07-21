/**
 * Care Journey timeline math (Care Plan build row 10 / §Care Journey Timeline).
 *
 * The milestone-positioning math (`calculateMilestones`) and the goal-trend
 * math (`Trend`, `calculateGoals`, `calculateGoalProgress`) are ported from the
 * aouros `lib/focus/progress.ts` pure helpers and adapted to the clinical time
 * scale (weeks → months). The aouros store/derived layer is NOT ported — the
 * Mediqom builders below feed these from the Care Plan + document data instead.
 */
import type { CarePlanDocument, CarePlanGoal, FollowUpTask } from "./types";
import type { DocumentPreload } from "$lib/documents/types.d";

// ── Goal trend (ported) ──────────────────────────────────────────────────────

export enum Trend {
  Improving = "Improving",
  Declining = "Declining",
  Stable = "Stable",
  Unknown = "Unknown",
}

const TOLERANCE_PERCENTAGE = 5;

interface GoalLike {
  targetValue?: number;
  targetRange?: { min: number; max: number };
  historicalData?: { value: number }[];
  currentValue?: number;
}

/** Trend of a single goal from its recent values (ported from aouros). */
export function calculateGoalTrend(goal: GoalLike): Trend {
  if (goal.currentValue === undefined) return Trend.Unknown;

  const target = goal.targetRange
    ? ([goal.targetRange.min, goal.targetRange.max] as [number, number])
    : goal.targetValue;
  if (target === undefined) return Trend.Unknown;

  const historicalData = goal.historicalData ?? [];
  const isRange = Array.isArray(target);
  const rangeWidth = isRange ? target[1] - target[0] : 0;
  const tolerance = rangeWidth * (TOLERANCE_PERCENTAGE / 100);

  const withinTarget = isRange
    ? goal.currentValue >= target[0] && goal.currentValue <= target[1]
    : goal.currentValue === target;

  let trend = Trend.Stable;
  if (historicalData.length >= 2) {
    const last = historicalData[historicalData.length - 1].value;
    const prev = historicalData[historicalData.length - 2].value;
    const shift = last - prev;
    const aim = isRange ? target[1] : target;
    if (!isRange || (rangeWidth > 0 && Math.abs(shift) > tolerance)) {
      if (aim > last)
        trend =
          shift > 0 ? Trend.Improving : shift < 0 ? Trend.Declining : trend;
      else if (aim < last)
        trend =
          shift > 0 ? Trend.Declining : shift < 0 ? Trend.Improving : trend;
    }
  }

  return withinTarget ? Trend.Stable : trend;
}

/** Map a Trend to the PRD §Language System phrase key. */
export function trendPhraseKey(trend: Trend): string {
  switch (trend) {
    case Trend.Improving:
      return "careplan.trend.improving";
    case Trend.Declining:
      return "careplan.trend.declining";
    case Trend.Stable:
      return "careplan.trend.stable";
    default:
      return "careplan.trend.unknown";
  }
}

/** Compute a goal's trend from the linked signal's values. */
export function computeGoalTrend(
  goal: CarePlanGoal,
  signalValues: { date: string; value: number }[],
): Trend {
  if (!signalValues.length) return Trend.Unknown;
  const sorted = [...signalValues].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  return calculateGoalTrend({
    targetValue: goal.targetValue,
    targetRange: goal.targetRange,
    historicalData: sorted.map((v) => ({ value: v.value })),
    currentValue: sorted[sorted.length - 1].value,
  });
}

// ── Milestone positioning (ported, clinical scale) ───────────────────────────

export interface Milestone {
  title: string;
  group?: string;
  link?: string;
  startDate?: string;
  endDate?: string;
  achieved?: boolean;
  achievedDate?: string;
  progress?: number;
}

export interface MilestonePosition {
  title: string;
  group: string;
  link?: string;
  startOffsetRatio: number;
  actualDurationRatio: number;
  anticipatedDurationRatio: number;
  progress: number;
}

export interface MilestoneConfig {
  milestonePositions: MilestonePosition[][];
  currentDatePosition: number;
  totalDuration: number;
  currentDate: string;
  minStartDate: string;
  maxEndDate: string;
  overallProgress: number;
}

/** Position milestones on a shared timeline (ported from aouros progress.ts). */
export function calculateMilestones(
  milestones: Milestone[],
  now?: Date,
): MilestoneConfig {
  const currentDate = (now ?? new Date()).toISOString().split("T")[0];
  let minStartDate = currentDate;
  let maxEndDate = "1970-01-01";

  for (const m of milestones) {
    if (m.startDate && m.startDate < minStartDate) minStartDate = m.startDate;
    const endDate = m.endDate || m.achievedDate || currentDate;
    if (endDate > maxEndDate) maxEndDate = endDate;
  }

  const recalculated = milestones.map((m) => {
    const startDate = new Date(m.startDate || minStartDate);
    let actualEndDate = new Date(m.achievedDate || m.endDate || currentDate);
    let anticipatedEndDate = actualEndDate;

    if (!m.achieved && m.progress) {
      const durationToDate = actualEndDate.getTime() - startDate.getTime();
      const totalEstimated = durationToDate / (m.progress / 100);
      anticipatedEndDate = new Date(startDate.getTime() + totalEstimated);
      actualEndDate = new Date(
        startDate.getTime() + totalEstimated * (m.progress / 100),
      );
    }
    if (anticipatedEndDate.getTime() > new Date(maxEndDate).getTime()) {
      maxEndDate = anticipatedEndDate.toISOString().split("T")[0];
    }
    return {
      ...m,
      actualEndDate: actualEndDate.toISOString().split("T")[0],
      anticipatedEndDate: anticipatedEndDate.toISOString().split("T")[0],
    };
  });

  const totalDuration = Math.max(
    1,
    new Date(maxEndDate).getTime() - new Date(minStartDate).getTime(),
  );

  const positions: MilestonePosition[] = recalculated.map((m) => {
    const startOffset =
      new Date(m.startDate || minStartDate).getTime() -
      new Date(minStartDate).getTime();
    const actualDuration =
      new Date(m.actualEndDate).getTime() -
      new Date(m.startDate || minStartDate).getTime();
    const anticipatedDuration =
      new Date(m.anticipatedEndDate).getTime() -
      new Date(m.startDate || minStartDate).getTime();
    return {
      title: m.title,
      group: m.group || m.title,
      link: m.link,
      startOffsetRatio: startOffset / totalDuration,
      actualDurationRatio: actualDuration / totalDuration,
      anticipatedDurationRatio: anticipatedDuration / totalDuration,
      progress: m.progress ?? (m.achieved ? 100 : 0),
    };
  });

  const grouped: Record<string, MilestonePosition[]> = {};
  for (const p of positions) (grouped[p.group] ??= []).push(p);
  const milestonePositions = Object.values(grouped);

  const currentDatePosition =
    (new Date(currentDate).getTime() - new Date(minStartDate).getTime()) /
    totalDuration;

  return {
    milestonePositions,
    currentDatePosition,
    totalDuration,
    currentDate,
    minStartDate,
    maxEndDate,
    overallProgress: Math.round(currentDatePosition * 100),
  };
}

// ── Mediqom builders ─────────────────────────────────────────────────────────

export type JourneyEventType =
  | "import"
  | "session"
  | "task_done"
  | "task_upcoming"
  | "task_snoozed";

export interface JourneyEvent {
  type: JourneyEventType;
  date: string;
  label: string;
  refId?: string; // documentId or taskId
}

/** Build the Care Journey events from the plan and the profile documents. */
export function buildJourneyEvents(
  plan: Pick<CarePlanDocument, "items">,
  docs: DocumentPreload[],
): JourneyEvent[] {
  const events: JourneyEvent[] = [];

  for (const doc of docs) {
    const date =
      (doc.metadata?.date as string) || (doc.metadata as any)?.created_at;
    if (!date) continue;
    const isSession = doc.metadata?.originKind === "session";
    events.push({
      type: isSession ? "session" : "import",
      date: String(date).slice(0, 10),
      label: doc.metadata?.title || (isSession ? "Session" : "Document"),
      refId: doc.id,
    });
  }

  for (const item of plan.items) {
    for (const task of item.tasks) {
      const evt = taskToEvent(task);
      if (evt) events.push(evt);
    }
  }

  return events.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
}

function taskToEvent(task: FollowUpTask): JourneyEvent | null {
  if (task.status === "done" && task.completedAt) {
    return {
      type: "task_done",
      date: task.completedAt.slice(0, 10),
      label: task.text,
      refId: task.id,
    };
  }
  if (task.status === "snoozed" && task.snoozedUntil) {
    return {
      type: "task_snoozed",
      date: task.snoozedUntil.slice(0, 10),
      label: task.text,
      refId: task.id,
    };
  }
  if (task.status === "pending" && task.dueDate) {
    return {
      type: "task_upcoming",
      date: task.dueDate.slice(0, 10),
      label: task.text,
      refId: task.id,
    };
  }
  return null;
}

// ── Progress-by-periods ──────────────────────────────────────────────────────

export type Period = "today" | "week" | "month" | "year";

export interface PeriodProgress {
  period: Period;
  achieved: number;
  awaiting: number;
}

/** Bucket task completion vs. upcoming work into time windows for the capsule bars. */
export function progressByPeriods(
  plan: Pick<CarePlanDocument, "items">,
  now: Date = new Date(),
): PeriodProgress[] {
  const windows: Record<Period, number> = {
    today: 1,
    week: 7,
    month: 30,
    year: 365,
  };
  const tasks = plan.items.flatMap((i) => i.tasks);
  const nowMs = now.getTime();

  return (Object.keys(windows) as Period[]).map((period) => {
    const since = nowMs - windows[period] * 86_400_000;
    let achieved = 0;
    let awaiting = 0;
    for (const t of tasks) {
      if (t.status === "done" && t.completedAt) {
        if (new Date(t.completedAt).getTime() >= since) achieved += 1;
      } else if (t.status === "pending" && t.dueDate) {
        const due = new Date(t.dueDate).getTime();
        if (due >= since && due <= nowMs + windows[period] * 86_400_000)
          awaiting += 1;
      }
    }
    return { period, achieved, awaiting };
  });
}
