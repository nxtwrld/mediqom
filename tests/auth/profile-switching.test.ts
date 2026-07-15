import { test, expect } from "@playwright/test";
import { shouldSkip } from "../fixtures/skip";

// Desktop and mobile implement profile navigation as two entirely different
// component trees (NavBar.svelte vs UI.svelte + NavPanelProfiles.svelte), so
// each is exercised through its own real UI path here rather than assuming
// one covers the other. The desktop "Profiles" list link is gated behind a
// non-individual subscription tier we don't control on the shared test
// account, so this sticks to the affordance that's always present: the
// current-profile navigation in each layout.

test.describe("Auth - Profile switching", () => {
  test.beforeEach(() => {
    const skipReason = shouldSkip();
    if (skipReason) {
      test.skip(true, `Skipped: ${skipReason}`);
    }
  });

  test("desktop: profile-name link in NavBar returns to the profile home", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "desktop-only nav layout");

    await page.goto("/med");
    await page.waitForURL(/\/med\/p\/[^/]+/, { timeout: 15000 });
    const profileUrl = new URL(page.url());
    const profileId = profileUrl.pathname.split("/med/p/")[1].split("/")[0];

    const docsLink = page.locator(`a[href="/med/p/${profileId}/documents"]`);
    await expect(docsLink).toBeVisible();
    await docsLink.click();
    await page.waitForURL(`**/med/p/${profileId}/documents`);

    const profileNameLink = page.locator(".profile-name");
    await expect(profileNameLink).toBeVisible();
    await profileNameLink.click();
    await page.waitForURL(`**/med/p/${profileId}`);
    expect(new URL(page.url()).pathname).toBe(`/med/p/${profileId}`);
  });

  test("mobile: avatar opens the profile panel and selecting a profile navigates", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "mobile-only nav layout");

    await page.goto("/med");
    await page.waitForURL(/\/med\/p\/[^/]+/, { timeout: 15000 });
    const profileUrl = new URL(page.url());
    const profileId = profileUrl.pathname.split("/med/p/")[1].split("/")[0];
    const profileName = await page.locator(".navbar-name").textContent();

    const avatarButton = page.locator("button.nav-avatar");
    await expect(avatarButton).toBeVisible();
    await avatarButton.click();

    const panelItem = page.locator(".panel-profiles .panel-profile-item");
    await expect(panelItem.first()).toBeVisible();
    if (profileName) {
      await expect(
        panelItem.filter({ hasText: profileName }).first(),
      ).toBeVisible();
    }

    await panelItem.first().click();
    await page.waitForURL(`**/med/p/${profileId}`);
    expect(new URL(page.url()).pathname).toBe(`/med/p/${profileId}`);
  });
});
