import { test, expect } from "@playwright/test";
import { shouldSkip } from "../fixtures/skip";

// The real login flow is passwordless magic-link (OTP): `/auth` posts to a
// SvelteKit form action (`use:enhance`) that calls Supabase `signInWithOtp`.
// That fetch uses SvelteKit's internal action-result wire format, which is
// impractical to fake reliably in a route mock, and driving it for real would
// send a live email to the test inbox on every run. So this spec covers what
// can be verified deterministically: the form renders correctly for an
// anonymous visitor, and the real server-side auth guard (hooks.server.ts)
// redirects an already-authenticated visitor away from /auth.

test.describe("Auth - Login form", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("renders the magic-link login form for an anonymous visitor", async ({
    page,
  }) => {
    await page.goto("/auth");

    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();

    // Passwordless flow — there must be no password field to fill.
    await expect(
      page.locator('input[type="password"], input[name="password"]'),
    ).toHaveCount(0);
  });
});

test.describe("Auth - Already authenticated", () => {
  test.beforeEach(() => {
    const skipReason = shouldSkip();
    if (skipReason) {
      test.skip(true, `Skipped: ${skipReason}`);
    }
  });

  test("visiting /auth while logged in redirects to /med", async ({ page }) => {
    await page.goto("/auth");
    await page.waitForURL("**/med/**", { timeout: 15000 });
    expect(page.url()).toContain("/med");
  });
});
