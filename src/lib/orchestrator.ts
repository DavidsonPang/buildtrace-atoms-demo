import {
  STAGE_META,
  type RunEvent,
  type RunRequest,
  type StageId,
} from "@/src/lib/contracts";
import {
  ModelProviderError,
  type ModelProvider,
} from "@/src/lib/model-provider";
import {
  SandboxValidationError,
  validateAndInstrument,
} from "@/src/lib/html-sandbox";

const STEP_DELAY_MS = process.env.NODE_ENV === "test" ? 0 : 380;

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

export async function* runPipeline(
  request: RunRequest,
  signal: AbortSignal,
  provider: ModelProvider,
): AsyncGenerator<RunEvent> {
  let sequence = 0;
  const runStartedAt = Date.now();
  let currentStage: StageId = "product";

  const event = <T extends RunEvent>(
    value: Omit<T, "protocolVersion" | "runId" | "sequence" | "timestamp">,
  ): T =>
    ({
      protocolVersion: 1,
      runId: request.runId,
      sequence: sequence++,
      timestamp: new Date().toISOString(),
      ...value,
    }) as T;

  const startStage = (stage: StageId) =>
    event<Extract<RunEvent, { type: "stage.started" }>>({
      type: "stage.started",
      stage,
      payload: {
        label: STAGE_META[stage].label,
        agent: STAGE_META[stage].agent,
      },
    });

  const completeStage = (stage: StageId, startedAt: number) =>
    event<Extract<RunEvent, { type: "stage.completed" }>>({
      type: "stage.completed",
      stage,
      payload: { durationMs: Date.now() - startedAt },
    });

  try {
    yield event<Extract<RunEvent, { type: "run.accepted" }>>({
      type: "run.accepted",
      payload: { providerLabel: provider.label, mode: request.mode },
    });

    let startedAt = Date.now();
    currentStage = "product";
    yield startStage("product");
    yield event<Extract<RunEvent, { type: "stage.progress" }>>({
      type: "stage.progress",
      stage: "product",
      payload: { message: "正在识别核心用户、问题与关键假设…" },
    });
    if (provider.id === "fake") await wait(STEP_DELAY_MS, signal);
    const product = await provider.generateProduct(request.prompt, signal);
    yield event<Extract<RunEvent, { type: "artifact.completed" }>>({
      type: "artifact.completed",
      stage: "product",
      payload: { kind: "product", artifact: product },
    });
    yield completeStage("product", startedAt);

    startedAt = Date.now();
    currentStage = "architecture";
    yield startStage("architecture");
    yield event<Extract<RunEvent, { type: "stage.progress" }>>({
      type: "stage.progress",
      stage: "architecture",
      payload: { message: "正在收敛交互模型、数据和组件边界…" },
    });
    if (provider.id === "fake") await wait(STEP_DELAY_MS, signal);
    const technicalPlan = await provider.generateTechnicalPlan(
      request.prompt,
      product,
      signal,
    );
    yield event<Extract<RunEvent, { type: "artifact.completed" }>>({
      type: "artifact.completed",
      stage: "architecture",
      payload: { kind: "technical-plan", artifact: technicalPlan },
    });
    yield completeStage("architecture", startedAt);

    startedAt = Date.now();
    currentStage = "engineering";
    yield startStage("engineering");
    yield event<Extract<RunEvent, { type: "stage.progress" }>>({
      type: "stage.progress",
      stage: "engineering",
      payload: { message: "正在生成自包含的交互式微型产品…" },
    });
    if (provider.id === "fake") await wait(STEP_DELAY_MS, signal);
    const app = await provider.generateApp(
      request.prompt,
      product,
      technicalPlan,
      signal,
    );
    yield event<Extract<RunEvent, { type: "artifact.completed" }>>({
      type: "artifact.completed",
      stage: "engineering",
      payload: { kind: "generated-app", artifact: app },
    });
    yield completeStage("engineering", startedAt);

    startedAt = Date.now();
    currentStage = "validation";
    yield startStage("validation");
    yield event<Extract<RunEvent, { type: "stage.progress" }>>({
      type: "stage.progress",
      stage: "validation",
      payload: { message: "正在检查结构、安全策略与交互目标…" },
    });
    await wait(STEP_DELAY_MS / 2, signal);
    const validation = validateAndInstrument(app);
    yield event<Extract<RunEvent, { type: "validation.completed" }>>({
      type: "validation.completed",
      stage: "validation",
      payload: {
        ...validation,
        title: app.title,
        summary: app.summary,
      },
    });
    yield completeStage("validation", startedAt);

    yield event<Extract<RunEvent, { type: "run.completed" }>>({
      type: "run.completed",
      payload: { totalDurationMs: Date.now() - runStartedAt },
    });
  } catch (error) {
    if (
      signal.aborted ||
      (error instanceof DOMException && error.name === "AbortError")
    ) {
      yield event<Extract<RunEvent, { type: "run.cancelled" }>>({
        type: "run.cancelled",
        payload: { message: "生成已由用户取消。" },
      });
      return;
    }

    const message = error instanceof Error ? error.message : "未知错误";
    const code =
      error instanceof SandboxValidationError
        ? "sandbox_rejected"
        : error instanceof ModelProviderError
          ? error.code
          : "internal";
    const retryable =
      error instanceof ModelProviderError
        ? error.retryable
        : code !== "sandbox_rejected";
    yield event<Extract<RunEvent, { type: "stage.failed" }>>({
      type: "stage.failed",
      stage: currentStage,
      payload: { code, message, retryable },
    });
  }
}
