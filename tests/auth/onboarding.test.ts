import { test, expect } from "@playwright/test";
import { shouldSkip } from "../fixtures/skip";

// The real onboarding wizard (`/account`) does a lot of client-side crypto
// (WebCrypto key generation/wrapping) on final submit before it ever calls
// POST /v1/account/onboarding — that machinery already has its own unit
// tests (see CRYPTOGRAPHY.md). This spec sticks to what's proportionate for
// a UI regression suite: does the wizard render and step correctly.

test.describe("Auth - Onboarding wizard", () => {
  test.beforeEach(async ({ page }) => {
    const skipReason = shouldSkip();
    if (skipReason) {
      test.skip(true, `Skipped: ${skipReason}`);
    }

    // Force the wizard to render instead of the real /account load
    // redirecting to /med — that redirect only fires once fullName,
    // private_keys and publicKey are all present on the profile.
    await page.route("**/v1/med/user", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            fullName: null,
            private_keys: null,
            publicKey: null,
          }),
        });
      } else {
        await route.continue();
      }
    });
  });

  test("step 1 gates Next on required fields, then advances and preserves state on Back", async ({
    page,
  }) => {
    await page.goto("/account");

    const fullName = page.locator("#fullName");
    const birthDate = page.locator("#birthDate");
    const nextButton = page.locator(".form-actions button.-primary");

    await expect(fullName).toBeVisible();
    await expect(nextButton).toBeDisabled();

    await fullName.fill("Test Patient");
    await expect(nextButton).toBeDisabled();

    await birthDate.fill("1990-05-15");
    await expect(nextButton).toBeEnabled();

    await nextButton.click();

    // Step advanced — the bio step's fields are gone, hash moved to #1.
    await expect(page.locator("#fullName")).toHaveCount(0);
    await expect(page).toHaveURL(/#1$/);

    const backButton = page.locator(".form-actions button:not(.-primary)");
    await expect(backButton).toBeVisible();
    await backButton.click();

    // Back on step 0 — the previously entered values are preserved.
    await expect(page).toHaveURL(/#0$/);
    await expect(page.locator("#fullName")).toHaveValue("Test Patient");
    await expect(page.locator("#birthDate")).toHaveValue("1990-05-15");
  });
});
