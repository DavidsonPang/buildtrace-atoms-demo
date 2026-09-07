import { DeepSeekProvider } from "@/src/lib/deepseek-provider";
import { recordDeepSeekUsage } from "@/src/lib/live-budget";
import {
  FakeModelProvider,
  ModelProviderError,
  type ModelProvider,
} from "@/src/lib/model-provider";

export function createConfiguredProvider(): ModelProvider {
  const provider = (process.env.MODEL_PROVIDER ?? "fake").toLowerCase();
  if (provider === "fake") return new FakeModelProvider();

  if (provider !== "deepseek") {
    throw new ModelProviderError(
      "provider_configuration",
      `不支持的 MODEL_PROVIDER：${provider}。`,
      false,
    );
  }
  if (process.env.LIVE_GENERATION_ENABLED !== "true") {
    throw new ModelProviderError(
      "provider_configuration",
      "真实生成当前处于关闭状态。",
      false,
    );
  }

  return new DeepSeekProvider({
    apiKey: process.env.DEEPSEEK_API_KEY ?? "",
    model: process.env.MODEL_NAME ?? "deepseek-v4-flash",
    baseUrl: process.env.DEEPSEEK_BASE_URL,
    timeoutMs: timeoutFromEnvironment(),
    engineeringTimeoutMs: environmentTimeout(
      process.env.MODEL_ENGINEERING_TIMEOUT_MS,
      75_000,
    ),
    onUsage: recordDeepSeekUsage,
  });
}

function timeoutFromEnvironment() {
  return environmentTimeout(process.env.MODEL_REQUEST_TIMEOUT_MS, 45_000);
}

function environmentTimeout(raw: string | undefined, fallback: number) {
  const value = Number(raw);
  return Number.isInteger(value) && value >= 5_000 && value <= 120_000
    ? value
    : fallback;
}
