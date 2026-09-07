import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  authorizeLiveRun,
  getLiveBudgetSnapshot,
  recordDeepSeekUsage,
  resetLiveBudgetForTests,
} from "@/src/lib/live-budget";

describe("live budget", () => {
  beforeEach(() => {
    process.env.LIVE_MAX_RUNS_PER_SESSION = "1";
    process.env.LIVE_MAX_RUNS_PER_PROCESS = "2";
    process.env.LIVE_BUDGET_CNY = "10";
    resetLiveBudgetForTests();
  });

  afterEach(() => {
    delete process.env.LIVE_MAX_RUNS_PER_SESSION;
    delete process.env.LIVE_MAX_RUNS_PER_PROCESS;
    delete process.env.LIVE_BUDGET_CNY;
    resetLiveBudgetForTests();
  });

  it("同一幂等键不会重复计数，并限制会话运行次数", () => {
    const input = {
      sessionId: "session-a",
      idempotencyKey: "run-key-00000001",
    };
    authorizeLiveRun(input);
    authorizeLiveRun(input);

    expect(getLiveBudgetSnapshot().totalRuns).toBe(1);
    expect(getLiveBudgetSnapshot().reservedSpendCny).toBe(0.65);
    expect(() =>
      authorizeLiveRun({
        sessionId: "session-a",
        idempotencyKey: "run-key-00000002",
      }),
    ).toThrow("当前浏览器会话已达到 1 次真实生成上限。");
  });

  it("按人民币高峰价格保守累计用量", () => {
    recordDeepSeekUsage({
      input_tokens: 1_000_000,
      input_tokens_details: { cached_tokens: 200_000 },
      output_tokens: 1_000_000,
    });

    expect(getLiveBudgetSnapshot().estimatedSpendCny).toBeCloseTo(11.42, 5);
  });
});
