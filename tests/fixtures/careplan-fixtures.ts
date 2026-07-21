import { test as base, expect, type Page } from "@playwright/test";
import { shouldSkip } from "./skip";
import type { CarePlanItem, FollowUpTask } from "../../src/lib/careplan/types";

let taskCounter = 0;

/** Create a mock FollowUpTask. Pass sourceDocumentId/sourceQuote,
 * sourceMessageId, or neither to exercise the three provenance paths. */
export function createMockTask(
  overrides: Partial<FollowUpTask> = {},
): FollowUpTask {
  taskCounter += 1;
  const now = new Date().toISOString();
  return {
    id: `test-task-${taskCounter}`,
    text: "Schedule a follow-up blood test",
    category: "follow_up",
    priority: "routine",
    sourceDocumentDate: now,
    certaintyCycleInDays: 90,
    status: "pending",
    diagnosisItemId: "test-item-1",
    ...overrides,
  };
}

let itemCounter = 0;

/** Create a mock CarePlanItem with sensible defaults. */
export function createMockCarePlanItem(
  overrides: Partial<CarePlanItem> = {},
): CarePlanItem {
  itemCounter += 1;
  const now = new Date().toISOString();
  return {
    id: `test-item-${itemCounter}`,
    diagnosisDescription: "Type 2 Diabetes",
    conditionType: "chronic",
    certaintyCycleInDays: 90,
    firstSeenDate: now,
    lastSeenInDocumentDate: now,
    confirmingDocuments: [],
    contradictingDocuments: [],
    status: "active",
    diagnosis: { description: "Type 2 Diabetes", type: "confirmed" },
    tasks: [],
    goals: [],
    medicationIds: [],
    monitoringSignals: [],
    bodyParts: [],
    ...overrides,
  };
}

/** Helper class for seeding Care Plan items and navigating without a full
 * reload. Uses the guarded window.__testHooks surface (see
 * src/lib/testing/test-hooks.ts) — the Care Plan is a client-side-encrypted
 * singleton document with no simple REST endpoint to mock. */
class CarePlanPage {
  constructor(public page: Page) {}

  async seed(items: CarePlanItem[], historicalItems: CarePlanItem[] = []) {
    await this.page.evaluate(
      ({ items, historicalItems }) => {
        return (window as any).__testHooks.seedCarePlan(items, historicalItems);
      },
      { items, historicalItems },
    );
  }

  /** Client-side navigate via SvelteKit's own `goto` so the seeded in-memory
   * store survives (a real page.goto() would reload and reset it). */
  async goto(path: string) {
    await this.page.evaluate((path) => {
      (window as any).__testHooks.goto(path);
    }, path);
  }
}

export const test = base.extend<{ carePlanPage: CarePlanPage }>({
  carePlanPage: async ({ page }, use, testInfo) => {
    const skipReason = shouldSkip();
    if (skipReason) {
      testInfo.skip(true, `Skipped: ${skipReason}`);
      return;
    }

    await use(new CarePlanPage(page));
  },
});

export { expect } from "@playwright/test";
