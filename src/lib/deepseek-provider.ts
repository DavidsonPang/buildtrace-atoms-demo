import { z } from "zod";

import {
  GeneratedAppSchema,
  ProductAgentOutputSchema,
  TechnicalPlanSchema,
  type ProductAgentOutput,
  type TechnicalPlan,
} from "@/src/lib/contracts";
import {
  ModelProviderError,
  type ModelProvider,
} from "@/src/lib/model-provider";

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-flash";
const DEFAULT_TIMEOUT_MS = 45_000;

type Fetcher = typeof fetch;

type Usage = {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
  output_tokens_details?: { reasoning_tokens?: number };
};

type ResponsesPayload = {
  id?: string;
  status?: string;
  error?: { message?: string; code?: string } | null;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  usage?: Usage;
};

export type DeepSeekUsageObserver = (usage: Usage) => void;

export type DeepSeekProviderOptions = {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  engineeringTimeoutMs?: number;
  fetcher?: Fetcher;
  onUsage?: DeepSeekUsageObserver;
};

export class DeepSeekProvider implements ModelProvider {
  readonly id = "deepseek" as const;
  readonly label: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly engineeringTimeoutMs: number;
  private readonly fetcher: Fetcher;
  private readonly onUsage?: DeepSeekUsageObserver;

  constructor(options: DeepSeekProviderOptions) {
    if (!options.apiKey.trim()) {
      throw new ModelProviderError(
        "provider_configuration",
        "服务器尚未配置 DeepSeek API Key。",
        false,
      );
    }
    this.apiKey = options.apiKey;
    this.model = options.model ?? DEFAULT_MODEL;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.engineeringTimeoutMs = options.engineeringTimeoutMs ?? 75_000;
    this.fetcher = options.fetcher ?? fetch;
    this.onUsage = options.onUsage;
    this.label = `DeepSeek · ${this.model}`;
  }

  generateProduct(prompt: string, signal: AbortSignal) {
    return this.generateStructured(
      "product_artifact",
      ProductAgentOutputSchema,
      [
        "你是产品 Agent。把用户的商业微型产品想法收敛为可验证的产品简报。",
        "所有内容使用简体中文。不要虚构外部调研事实；不确定内容写入 assumptions 或 risks。",
        "如果输入包含现有产品简报和本轮修改要求，应保留未被否定的能力，把修改要求合并为完整的新 Product Brief，而不是只描述差异。",
        "功能需求必须使用 R1、R2… 前缀，验收标准必须使用 A1、A2… 前缀。",
        "范围必须适合一个自包含、无后端、无外部资源的单页交互应用。",
        "只返回符合给定 JSON Schema 的 JSON。",
      ].join("\n"),
      `用户想法：\n${prompt}`,
      8_000,
      signal,
    );
  }

  generateTechnicalPlan(
    prompt: string,
    product: ProductAgentOutput,
    signal: AbortSignal,
  ) {
    return this.generateStructured(
      "technical_plan",
      TechnicalPlanSchema,
      [
        "你是架构 Agent。根据用户想法和已经确认的产品产物，设计最小但完整的前端实现方案。",
        "所有内容使用简体中文。只规划浏览器内状态、组件、交互行为和确定性验证。",
        "禁止远程 API、外部资源、第三方依赖、登录、支付和后端服务。",
        "只返回符合给定 JSON Schema 的 JSON。",
      ].join("\n"),
      `用户想法：\n${prompt}\n\n产品产物：\n${JSON.stringify(product)}`,
      8_000,
      signal,
    );
  }

  generateApp(
    prompt: string,
    product: ProductAgentOutput,
    technicalPlan: TechnicalPlan,
    signal: AbortSignal,
  ) {
    return this.generateStructured(
      "generated_app",
      GeneratedAppSchema,
      [
        "你是工程 Agent。生成一个完成度高、可以直接运行的商业微型产品。",
        "html 字段必须是完整的自包含 HTML 文档，内联 CSS 和 JavaScript，并使用简体中文界面。",
        "必须包含至少一个真实可操作的 input、select、textarea 或 button，输入变化需要产生可见结果。",
        "禁止 iframe、frame、object、embed、base、link、远程 URL、外部字体、网络请求和表单提交。",
        "禁止 onclick 等内联事件属性；JavaScript 必须通过 addEventListener 绑定事件。",
        "禁止 Markdown 代码围栏。implementedRequirementIds 必须引用产品简报中的 R 编号。",
        "只返回符合给定 JSON Schema 的 JSON。",
      ].join("\n"),
      [
        `用户想法：\n${prompt}`,
        `产品产物：\n${JSON.stringify(product)}`,
        `技术方案：\n${JSON.stringify(technicalPlan)}`,
      ].join("\n\n"),
      24_000,
      signal,
      this.engineeringTimeoutMs,
    );
  }

  private async generateStructured<T>(
    schemaName: string,
    schema: z.ZodType<T>,
    instructions: string,
    input: string,
    maxOutputTokens: number,
    signal: AbortSignal,
    timeoutMs = this.timeoutMs,
    allowRepair = true,
  ): Promise<T> {
    const controller = new AbortController();
    const onAbort = () => controller.abort(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    const timeout = setTimeout(
      () => controller.abort(new DOMException("Timed out", "TimeoutError")),
      timeoutMs,
    );

    try {
      const response = await this.fetcher(`${this.baseUrl}/responses`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          instructions,
          input,
          reasoning: { effort: "low" },
          max_output_tokens: maxOutputTokens,
          text: {
            format: {
              type: "json_schema",
              name: schemaName,
              schema: withoutSchemaDialect(z.toJSONSchema(schema)),
            },
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) throw await providerHttpError(response);

      const payload = (await response.json()) as ResponsesPayload;
      if (payload.usage) this.onUsage?.(payload.usage);
      if (payload.status && payload.status !== "completed") {
        throw new ModelProviderError(
          "provider_rejected",
          payload.status === "incomplete"
            ? "模型输出达到阶段长度限制，已停止当前阶段。"
            : "DeepSeek 未能完成当前阶段。",
          payload.status === "incomplete",
        );
      }

      const outputText = extractOutputText(payload);
      if (!outputText) {
        if (allowRepair) {
          return this.generateStructured(
            schemaName,
            schema,
            `${instructions}\n这是一次结构化修复：上一次返回为空。必须只返回完整 JSON。`,
            input,
            maxOutputTokens,
            signal,
            timeoutMs,
            false,
          );
        }
        throw new ModelProviderError(
          "provider_invalid_output",
          "DeepSeek 返回了空的结构化产物。",
          true,
        );
      }

      const decoded = parseJsonCandidate(outputText);
      if (!decoded.ok) {
        if (allowRepair) {
          return this.generateStructured(
            schemaName,
            schema,
            `${instructions}\n这是一次结构化修复：上一次输出不是有效 JSON。必须只返回完整 JSON，不要解释或使用 Markdown 代码围栏。`,
            input,
            maxOutputTokens,
            signal,
            timeoutMs,
            false,
          );
        }
        throw new ModelProviderError(
          "provider_invalid_output",
          "DeepSeek 返回的产物不是有效 JSON。",
          true,
        );
      }

      const parsed = schema.safeParse(decoded.value);
      if (!parsed.success) {
        if (allowRepair) {
          return this.generateStructured(
            schemaName,
            schema,
            `${instructions}\n这是一次结构化修复：上一次 JSON 未通过 Schema。逐项检查必填字段、数组数量、字符串长度和数据类型，只返回修复后的完整 JSON。`,
            input,
            maxOutputTokens,
            signal,
            timeoutMs,
            false,
          );
        }
        throw new ModelProviderError(
          "provider_invalid_output",
          "DeepSeek 返回的产物未通过运行时 Schema 校验。",
          true,
        );
      }
      return parsed.data;
    } catch (error) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      if (error instanceof ModelProviderError) throw error;
      if (controller.signal.aborted) {
        throw new ModelProviderError(
          "provider_timeout",
          `DeepSeek 阶段调用超过 ${Math.round(timeoutMs / 1_000)} 秒。`,
          true,
        );
      }
      throw new ModelProviderError(
        "provider_unavailable",
        "无法连接 DeepSeek，请稍后重试当前阶段。",
        true,
      );
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
    }
  }
}

function withoutSchemaDialect(schema: Record<string, unknown>) {
  const copy = { ...schema };
  delete copy.$schema;
  return copy;
}

function extractOutputText(payload: ResponsesPayload) {
  const fragments: string[] = [];
  for (const item of payload.output ?? []) {
    if (item.type !== "message") continue;
    for (const part of item.content ?? []) {
      if (part.type === "output_text" && typeof part.text === "string") {
        fragments.push(part.text);
      }
    }
  }
  return fragments.join("");
}

function parseJsonCandidate(
  raw: string,
): { ok: true; value: unknown } | { ok: false } {
  const trimmed = raw.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  const firstBrace = unfenced.indexOf("{");
  const lastBrace = unfenced.lastIndexOf("}");
  const candidates = [
    trimmed,
    unfenced,
    firstBrace >= 0 && lastBrace > firstBrace
      ? unfenced.slice(firstBrace, lastBrace + 1)
      : "",
  ];

  for (const candidate of new Set(candidates)) {
    if (!candidate) continue;
    try {
      return { ok: true, value: JSON.parse(candidate) };
    } catch {
      // Try the next bounded normalization before spending a repair call.
    }
  }
  return { ok: false };
}

async function providerHttpError(response: Response) {
  if (response.status === 401 || response.status === 403) {
    return new ModelProviderError(
      "provider_authentication",
      "DeepSeek API Key 无效或没有模型权限。",
      false,
    );
  }
  if (response.status === 429) {
    return new ModelProviderError(
      "provider_rate_limited",
      "DeepSeek 当前触发限流，请稍后重试。",
      true,
    );
  }
  if (response.status >= 500) {
    return new ModelProviderError(
      "provider_unavailable",
      "DeepSeek 服务暂时不可用，请稍后重试。",
      true,
    );
  }
  return new ModelProviderError(
    "provider_rejected",
    `DeepSeek 拒绝了当前请求（HTTP ${response.status}）。`,
    response.status === 408,
  );
}
