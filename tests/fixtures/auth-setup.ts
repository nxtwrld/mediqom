import { chromium, type FullConfig } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const AUTH_DIR = path.join(__dirname, "..", ".auth");
const STATE_FILE = path.join(AUTH_DIR, "state.json");
const SKIP_MARKER = path.join(AUTH_DIR, "skip");

export default async function globalSetup(config: FullConfig) {
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;

  // Ensure .auth directory exists
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }

  // Clean up previous skip marker
  if (fs.existsSync(SKIP_MARKER)) {
    fs.unlinkSync(SKIP_MARKER);
  }

  if (!email || !password) {
    console.warn(
      "\n⚠️  TEST_USER_EMAIL and TEST_USER_PASSWORD not set.\n" +
        "   Import E2E tests will be skipped.\n" +
        "   Set these env vars to run tests against a real Supabase user.\n",
    );
    fs.writeFileSync(SKIP_MARKER, "missing credentials");
    return;
  }

  const baseURL =
    config.projects[0]?.use?.baseURL ?? "http://localhost:4173";

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to auth page
    await page.goto(`${baseURL}/auth`);

    // Fill in login form — adjust selectors to match your Supabase auth UI
    await page.waitForSelector('input[type="email"], input[name="email"]', {
      timeout: 15000,
    });
    await page.fill('input[type="email"], input[name="email"]', email);
    await page.fill('input[type="password"], input[name="password"]', password);

    // Submit the form
    await page.click('button[type="submit"]');

    // Wait for redirect to /med (authenticated area)
    await page.waitForURL("**/med/**", { timeout: 30000 });

    // Save auth state
    await context.storageState({ path: STATE_FILE });
    console.log("✅ Auth state saved to", STATE_FILE);
  } catch (err) {
    console.error("❌ Auth setup failed:", err);
    fs.writeFileSync(SKIP_MARKER, "auth failed");
  } finally {
    await browser.close();
  }
}
