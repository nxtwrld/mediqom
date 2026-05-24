/**
 * Care Plan goal normaliser.
 *
 * Treatment goals are extracted as structured objects
 * (see src/lib/configurations/core.treatmentGoal.ts). Documents imported
 * before that schema landed stored goals as plain strings. Readers
 * (SectionTreatmentPlan.svelte, the Care Plan merge function) must accept
 * both shapes; this helper wraps legacy strings into `{ goal: <string> }`
 * so callers can treat the result uniformly.
 */
export interface TreatmentGoal {
  goal: string;
  category?:
    | "curative"
    | "palliative"
    | "symptomatic"
    | "preventive"
    | "rehabilitative";
  timeline?: string;
  measurableOutcome?: string;
  monitoringSignal?: string;
  targetValue?: number;
  targetRange?: { min: number; max: number };
  // Care Plan layer concerns — not extracted from documents:
  description?: string;
  priority?: string;
  status?: string;
  achievabilityScore?: number;
}

export function normalizeTreatmentGoal(input: unknown): TreatmentGoal | null {
  if (input == null) return null;
  if (typeof input === "string") {
    const text = input.trim();
    return text.length === 0 ? null : { goal: text };
  }
  if (typeof input === "object" && "goal" in input) {
    const goal = (input as { goal: unknown }).goal;
    if (typeof goal === "string" && goal.trim().length > 0) {
      return input as TreatmentGoal;
    }
  }
  return null;
}

export function normalizeTreatmentGoals(input: unknown): TreatmentGoal[] {
  if (!Array.isArray(input)) return [];
  const out: TreatmentGoal[] = [];
  for (const item of input) {
    const g = normalizeTreatmentGoal(item);
    if (g) out.push(g);
  }
  return out;
}
