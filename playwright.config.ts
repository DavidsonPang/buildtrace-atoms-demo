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
  // 这些流程共享本机 API 限流桶，串行执行才能模拟单个用户的真实节奏。
  fullyParallel: false,
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
          "MODEL_PROVIDER=fake LIVE_GENERATION_ENABLED=false NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY= npm run dev",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: !process.env.CI,
      },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
