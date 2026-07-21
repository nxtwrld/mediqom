import { devices, type PlaywrightTestConfig } from "@playwright/test";

// Import specs predate mobile coverage and assume the desktop layout, so the
// mobile project only replays the newer journeys (auth, documents/chat,
// care-plan) that were built with both viewports in mind.
const MOBILE_TEST_IGNORE = ["**/import/**"];

const config: PlaywrightTestConfig = {
  globalSetup: "./tests/fixtures/auth-setup.ts",
  webServer: {
    command: "npm run build && npm run preview",
    port: 4173,
    // Default webServer timeout (60s) only covers starting an already-built
    // server — this command builds from scratch first, which alone can take
    // 60s+ on a cold CI runner. Give it enough headroom for build + preview start.
    timeout: 180000,
    // Enables window.__testHooks (see src/lib/testing/test-hooks.ts) only
    // for this test-preview build — process.env takes priority over the
    // "false" default in .env files, but real builds never set this.
    env: { PUBLIC_ENABLE_TEST_HOOKS: "true" },
  },
  testDir: "tests",
  testMatch: /(.+\.)?(test|spec)\.[jt]s/,
  timeout: 60000,
  use: {
    baseURL: "http://localhost:4173",
    storageState: "tests/.auth/state.json",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"] },
      testIgnore: MOBILE_TEST_IGNORE,
    },
  ],
};

export default config;
