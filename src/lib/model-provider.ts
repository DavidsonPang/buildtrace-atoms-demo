import type {
  GeneratedApp,
  ProductAgentOutput,
  TechnicalPlan,
} from "@/src/lib/contracts";
import {
  createGeneratedApp,
  createProductArtifacts,
  createTechnicalPlan,
} from "@/src/lib/fake-provider";

export type ProviderId = "fake" | "deepseek";

export interface ModelProvider {
  readonly id: ProviderId;
  readonly label: string;
  generateProduct(
    prompt: string,
    signal: AbortSignal,
  ): Promise<ProductAgentOutput>;
  generateTechnicalPlan(
    prompt: string,
    product: ProductAgentOutput,
    signal: AbortSignal,
  ): Promise<TechnicalPlan>;
  generateApp(
    prompt: string,
    product: ProductAgentOutput,
    technicalPlan: TechnicalPlan,
    signal: AbortSignal,
  ): Promise<GeneratedApp>;
}

export type ProviderErrorCode =
  | "provider_authentication"
  | "provider_rate_limited"
  | "provider_timeout"
  | "provider_unavailable"
  | "provider_rejected"
  | "provider_invalid_output"
  | "provider_configuration";

export class ModelProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ModelProviderError";
  }
}

export class FakeModelProvider implements ModelProvider {
  readonly id = "fake" as const;
  readonly label = "Fake Provider · 确定性演示";

  async generateProduct(prompt: string, signal: AbortSignal) {
    throwIfAborted(signal);
    const product = createProductArtifacts(prompt);
    const revision = extractRevisionInstruction(prompt);
    if (!revision) return product;

    const requirementId = `R${Math.min(
      8,
      product.productBrief.functionalRequirements.length + 1,
    )}`;
    return {
      ...product,
      productBrief: {
        ...product.productBrief,
        functionalRequirements: [
          ...product.productBrief.functionalRequirements.slice(0, 7),
          `${requirementId}：${revision.slice(0, 220)}`,
        ],
        acceptanceCriteria: [
          ...product.productBrief.acceptanceCriteria.slice(0, 7),
          `A${Math.min(
            8,
            product.productBrief.acceptanceCriteria.length + 1,
          )}：页面能明确体现本轮修改要求。`,
        ],
      },
    };
  }

  async generateTechnicalPlan(
    prompt: string,
    product: ProductAgentOutput,
    signal: AbortSignal,
  ) {
    throwIfAborted(signal);
    const plan = createTechnicalPlan(prompt);
    return {
      ...plan,
      behaviors: [
        ...plan.behaviors,
        `实现 Product Brief 修订中的 ${product.productBrief.functionalRequirements.length} 项功能要求。`,
      ],
    };
  }

  async generateApp(
    prompt: string,
    product: ProductAgentOutput,
    _technicalPlan: TechnicalPlan,
    signal: AbortSignal,
  ) {
    throwIfAborted(signal);
    const app = createGeneratedApp(prompt);
    const latestRequirement =
      product.productBrief.functionalRequirements.at(-1) ?? "核心需求";
    const revision = extractRevisionInstruction(prompt);
    const revisionNote = revision
      ? `<p id="revision-request" style="margin:8px 0 0"><strong>本轮修改：</strong>${escapeHtml(revision.slice(0, 300))}</p>`
      : "";
    const note = `<aside id="brief-revision" style="max-width:920px;margin:-42px auto 32px;padding:0 22px;color:#657168;font:12px/1.5 Inter,ui-sans-serif,system-ui,sans-serif">本版本依据 ${escapeHtml(latestRequirement)} 构建${revisionNote}</aside>`;
    return {
      ...app,
      summary: `${app.summary} 已同步 ${product.productBrief.functionalRequirements.length} 项 Product Brief 要求。`,
      html: app.html.replace("</body>", `${note}</body>`),
    };
  }
}

function extractRevisionInstruction(prompt: string) {
  const marker = "本轮修改要求：";
  const start = prompt.indexOf(marker);
  if (start < 0) return "";
  return prompt
    .slice(start + marker.length)
    .split("\n\n")[0]
    .trim();
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );
}
