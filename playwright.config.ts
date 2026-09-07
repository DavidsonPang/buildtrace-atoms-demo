import { defineConfig, devices } from "@playwright/test";

const loopbackNoProxy = [
  "127.0.0.1",
  "localhost",
  process.env.NO_PROXY,
  process.env.no_proxy,
]
  .filter(Boolean)
  .join(",");

process.env.NO_PROXY = loopbackNoProxy;
process.env.no_proxy = loopbackNoProxy;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  webServer: process.env.BUILDTRACE_SKIP_WEBSERVER
    ? undefined
    : {
        command:
          "MODEL_PROVIDER=fake LIVE_GENERATION_ENABLED=false npm run dev -- --hostname 127.0.0.1",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: !process.env.CI,
      },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
