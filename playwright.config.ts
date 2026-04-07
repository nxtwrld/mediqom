import type { PlaywrightTestConfig } from "@playwright/test";

const config: PlaywrightTestConfig = {
  globalSetup: "./tests/fixtures/auth-setup.ts",
  webServer: {
    command: "npm run build && npm run preview",
    port: 4173,
  },
  testDir: "tests",
  testMatch: /(.+\.)?(test|spec)\.[jt]s/,
  timeout: 60000,
  use: {
    baseURL: "http://localhost:4173",
    storageState: "tests/.auth/state.json",
  },
};

export default config;
