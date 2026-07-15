import { chromium, type FullConfig } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const AUTH_DIR = path.join(__dirname, "..", ".auth");
const STATE_FILE = path.join(AUTH_DIR, "state.json");
const SKIP_MARKER = path.join(AUTH_DIR, "skip");

export default async function globalSetup(config: FullConfig) {
  const email = process.env.TEST_USER_EMAIL;
  const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Ensure .auth directory exists
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }

  // Clean up previous skip marker
  if (fs.existsSync(SKIP_MARKER)) {
    fs.unlinkSync(SKIP_MARKER);
  }

  if (!email || !supabaseUrl || !serviceRoleKey) {
    console.warn(
      "\n⚠️  TEST_USER_EMAIL, PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY not set.\n" +
        "   Authenticated E2E tests will be skipped.\n" +
        "   Set these env vars to run tests against a real (pre-existing) Supabase user.\n",
    );
    fs.writeFileSync(SKIP_MARKER, "missing credentials");
    return;
  }

  const baseURL = config.projects[0]?.use?.baseURL ?? "http://localhost:4173";

  // The app's real login flow is passwordless magic-link (OTP) — there is no
  // password field to fill. Instead, mint a magic-link token server-side via
  // the Supabase admin API (no email is actually sent) and drive the app's
  // own /auth/confirm endpoint with it, which is the exact same code path a
  // real magic-link click would hit.
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    const tokenHash = data?.properties?.hashed_token;
    if (error || !tokenHash) {
      throw error ?? new Error("generateLink returned no hashed_token");
    }

    await page.goto(
      `${baseURL}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink`,
    );

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
