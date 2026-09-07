import { ModelProviderError } from "@/src/lib/model-provider";

type Usage = {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
};

const sessions = new Map<string, number>();
const acceptedRuns = new Set<string>();
let totalRuns = 0;
let estimatedSpendCny = 0;
let reservedSpendCny = 0;

const HIGH_PEAK_INPUT_MISS_CNY_PER_MILLION = 3;
const HIGH_PEAK_INPUT_HIT_CNY_PER_MILLION = 0.1;
const HIGH_PEAK_OUTPUT_CNY_PER_MILLION = 9;
const RESERVED_CNY_PER_RUN = 0.65;

export function authorizeLiveRun(input: {
  sessionId: string;
  idempotencyKey: string;
}) {
  if (acceptedRuns.has(input.idempotencyKey)) return;

  const maxTotalRuns = positiveInteger(
    process.env.LIVE_MAX_RUNS_PER_PROCESS,
    15,
  );
  const maxSessionRuns = positiveInteger(
    process.env.LIVE_MAX_RUNS_PER_SESSION,
    3,
  );
  const budgetCny = positiveNumber(process.env.LIVE_BUDGET_CNY, 10);
  const sessionRuns = sessions.get(input.sessionId) ?? 0;

  if (totalRuns >= maxTotalRuns) {
    throw new ModelProviderError(
      "provider_configuration",
      "本地真实生成次数已达到保护上限。",
      false,
    );
  }
  if (sessionRuns >= maxSessionRuns) {
    throw new ModelProviderError(
      "provider_configuration",
      `当前浏览器会话已达到 ${maxSessionRuns} 次真实生成上限。`,
      false,
    );
  }
  if (
    Math.max(estimatedSpendCny, reservedSpendCny) + RESERVED_CNY_PER_RUN >
    budgetCny
  ) {
    throw new ModelProviderError(
      "provider_configuration",
      `应用侧费用估算已接近 ¥${budgetCny} 上限。`,
      false,
    );
  }

  acceptedRuns.add(input.idempotencyKey);
  sessions.set(input.sessionId, sessionRuns + 1);
  totalRuns += 1;
  reservedSpendCny += RESERVED_CNY_PER_RUN;
}

export function recordDeepSeekUsage(usage: Usage) {
  const inputTokens = Math.max(0, usage.input_tokens ?? 0);
  const cachedTokens = Math.min(
    inputTokens,
    Math.max(0, usage.input_tokens_details?.cached_tokens ?? 0),
  );
  const uncachedTokens = inputTokens - cachedTokens;
  const outputTokens = Math.max(0, usage.output_tokens ?? 0);

  estimatedSpendCny +=
    (uncachedTokens * HIGH_PEAK_INPUT_MISS_CNY_PER_MILLION +
      cachedTokens * HIGH_PEAK_INPUT_HIT_CNY_PER_MILLION +
      outputTokens * HIGH_PEAK_OUTPUT_CNY_PER_MILLION) /
    1_000_000;
}

export function getLiveBudgetSnapshot() {
  return { totalRuns, estimatedSpendCny, reservedSpendCny };
}

function positiveInteger(raw: string | undefined, fallback: number) {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function positiveNumber(raw: string | undefined, fallback: number) {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function resetLiveBudgetForTests() {
  if (process.env.NODE_ENV !== "test") return;
  sessions.clear();
  acceptedRuns.clear();
  totalRuns = 0;
  estimatedSpendCny = 0;
  reservedSpendCny = 0;
}
