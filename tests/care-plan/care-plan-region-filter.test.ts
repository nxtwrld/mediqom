import {
  test,
  expect,
  createMockCarePlanItem,
} from "../fixtures/careplan-fixtures";

// Clicking the 3D anatomy mesh directly is fragile to hit-test reliably in
// Playwright (Three.js canvas), so this drives the same `?region=` URL the
// click handler produces and asserts the resulting filter — the same
// coverage without flaky canvas interaction.
test.describe("Care Plan - region filter", () => {
  test("?region= filters the active-items list to matching body parts", async ({
    carePlanPage,
  }) => {
    const page = carePlanPage.page;
    await page.goto("/med");
    await page.waitForURL(/\/med\/p\/[^/]+/, { timeout: 15000 });
    const profileId = new URL(page.url()).pathname
      .split("/med/p/")[1]
      .split("/")[0];

    const kneeItem = createMockCarePlanItem({
      diagnosisDescription: "Right knee osteoarthritis",
      bodyParts: [{ identification: "R_knee", sources: [] }],
    });
    const unrelatedItem = createMockCarePlanItem({
      diagnosisDescription: "Seasonal allergies",
      bodyParts: [],
    });

    await carePlanPage.seed([kneeItem, unrelatedItem]);
    await carePlanPage.goto(
      `/med/p/${profileId}/care-plan?region=${encodeURIComponent("R_knee")}`,
    );

    await expect(page.locator(".active-items .careplan-item")).toHaveCount(1);
    await expect(page.getByText("Right knee osteoarthritis")).toBeVisible();
    await expect(page.getByText("Seasonal allergies")).toHaveCount(0);
  });
});
