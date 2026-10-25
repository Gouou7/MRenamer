import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:1420",
    viewport: { width: 1440, height: 940 },
    locale: "zh-CN",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://127.0.0.1:1420",
    reuseExistingServer: !process.env.CI,
  },
  reporter: "list",
});
