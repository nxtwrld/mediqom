import {
  test,
  expect,
  createMockCarePlanItem,
  createMockTask,
} from "../fixtures/careplan-fixtures";

test.describe("Care Plan - overview", () => {
  test("renders seeded items with badges, journey timeline, and progress capsules", async ({
    carePlanPage,
  }) => {
    const page = carePlanPage.page;
    await page.goto("/med");
    await page.waitForURL(/\/med\/p\/[^/]+/, { timeout: 15000 });
    const profileId = new URL(page.url()).pathname
      .split("/med/p/")[1]
      .split("/")[0];

    const chronicItem = createMockCarePlanItem({
      diagnosisDescription: "Type 2 Diabetes",
      conditionType: "chronic",
      tasks: [
        createMockTask({
          diagnosisItemId: "chronic-item",
          dueDate: new Date(Date.now() + 5 * 86_400_000).toISOString(),
        }),
      ],
    });
    chronicItem.id = "chronic-item";
    const acuteItem = createMockCarePlanItem({
      diagnosisDescription: "Ankle sprain",
      conditionType: "acute",
    });
    acuteItem.id = "acute-item";

    await carePlanPage.seed([chronicItem, acuteItem]);
    await carePlanPage.goto(`/med/p/${profileId}/care-plan`);

    await expect(page.locator(".active-items .careplan-item")).toHaveCount(2);
    await expect(
      page.locator(".careplan-item .type-badge.-chronic"),
    ).toBeVisible();
    await expect(
      page.locator(".careplan-item .type-badge.-acute"),
    ).toBeVisible();
    await expect(page.getByText("Type 2 Diabetes")).toBeVisible();
    await expect(page.getByText("Ankle sprain")).toBeVisible();

    await expect(page.locator(".journey")).toBeVisible();
    await expect(page.locator(".progress-periods .capsule")).toHaveCount(4);
    await expect(
      page.locator(".progress-periods .capsule-count").first(),
    ).toHaveText(/\d+\/\d+/);
  });

  test("shows the first-time empty state when there are no items", async ({
    carePlanPage,
  }) => {
    const page = carePlanPage.page;
    await page.goto("/med");
    await page.waitForURL(/\/med\/p\/[^/]+/, { timeout: 15000 });
    const profileId = new URL(page.url()).pathname
      .split("/med/p/")[1]
      .split("/")[0];

    await carePlanPage.seed([]);
    await carePlanPage.goto(`/med/p/${profileId}/care-plan`);

    await expect(page.locator(".careplan-potential.-first")).toBeVisible();
    await expect(
      page.locator(".careplan-potential.-first button.-primary"),
    ).toBeVisible();
    await expect(page.locator(".active-items")).toHaveCount(0);
  });
});
