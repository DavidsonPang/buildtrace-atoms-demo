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
    return createProductArtifacts(prompt);
  }

  async generateTechnicalPlan(
    prompt: string,
    _product: ProductAgentOutput,
    signal: AbortSignal,
  ) {
    throwIfAborted(signal);
    return createTechnicalPlan(prompt);
  }

  async generateApp(
    prompt: string,
    _product: ProductAgentOutput,
    _technicalPlan: TechnicalPlan,
    signal: AbortSignal,
  ) {
    throwIfAborted(signal);
    return createGeneratedApp(prompt);
  }
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
}
