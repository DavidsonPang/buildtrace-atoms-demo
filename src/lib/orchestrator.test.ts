import { describe, expect, it } from "vitest";

import {
  RunEventSchema,
  RunRequestSchema,
  type GeneratedApp,
  type ProductAgentOutput,
  type RunRequest,
  type TechnicalPlan,
} from "@/src/lib/contracts";
import {
  createProductArtifacts,
  createTechnicalPlan,
} from "@/src/lib/fake-provider";
import {
  FakeModelProvider,
  ModelProviderError,
} from "@/src/lib/model-provider";
import { runPipeline } from "@/src/lib/orchestrator";

const request: RunRequest = {
  protocolVersion: 1,
  runId: "bb510ba2-e9f8-44b4-acf0-66bcad62596e",
  clientSessionId: "1cd11466-2668-4618-a90b-4496b6f8b6c8",
  idempotencyKey: "phase-three-test-key",
  mode: "quick",
  action: "initial",
  prompt: "为自由职业设计师创建一个项目报价计算器，包含工时和加急费用。",
};

describe("runFakePipeline", () => {
  it("按真实阶段顺序生成并验证事件", async () => {
    const events = [];
    for await (const event of runPipeline(
      request,
      new AbortController().signal,
      new FakeModelProvider(),
    )) {
      events.push(RunEventSchema.parse(event));
    }

    expect(events[0].type).toBe("run.accepted");
    expect(events.at(-1)?.type).toBe("run.completed");
    expect(events.map((event) => event.sequence)).toEqual(
      events.map((_, index) => index),
    );
    expect(
      events
        .filter((event) => event.type === "stage.started")
        .map((event) => event.stage),
    ).toEqual(["product", "architecture", "engineering", "validation"]);
    expect(events.some((event) => event.type === "validation.completed")).toBe(
      true,
    );
  });

  it("在开始前取消时生成取消事件", async () => {
    const controller = new AbortController();
    controller.abort();
    const events = [];

    for await (const event of runPipeline(
      request,
      controller.signal,
      new FakeModelProvider(),
    )) {
      events.push(event);
    }

    expect(events.at(-1)?.type).toBe("run.cancelled");
    expect(events.some((event) => event.type === "run.completed")).toBe(false);
  });

  it("引导模式在 Product Brief 后等待用户确认", async () => {
    const guidedRequest: RunRequest = {
      ...request,
      runId: "e8b64f9e-cc13-478e-b8e4-b32b68e58f87",
      idempotencyKey: "guided-product-review-key",
      mode: "guided",
      context: {
        audience: "需要快速向客户报价的独立设计师",
        primaryAction: "填写项目参数并复制报价摘要",
      },
    };
    const events = [];

    for await (const event of runPipeline(
      guidedRequest,
      new AbortController().signal,
      new FakeModelProvider(),
    )) {
      events.push(RunEventSchema.parse(event));
    }

    expect(
      events
        .filter((event) => event.type === "stage.started")
        .map((event) => event.stage),
    ).toEqual(["product"]);
    expect(events.at(-1)?.type).toBe("run.awaiting_user");
  });

  it("从编辑后的 Product Brief 只重建下游阶段", async () => {
    const rebuildRequest = RunRequestSchema.parse({
      ...request,
      runId: "cd56095f-ffda-4b04-a1e0-7429da99d1a0",
      idempotencyKey: "downstream-rebuild-key",
      action: "rebuild",
      rebuildFrom: "architecture",
      artifacts: { product: createProductArtifacts(request.prompt) },
    });
    const events = [];

    for await (const event of runPipeline(
      rebuildRequest,
      new AbortController().signal,
      new FakeModelProvider(),
    )) {
      events.push(RunEventSchema.parse(event));
    }

    expect(
      events
        .filter((event) => event.type === "stage.started")
        .map((event) => event.stage),
    ).toEqual(["architecture", "engineering", "validation"]);
    expect(events.at(-1)?.type).toBe("run.completed");
  });

  it("拒绝缺少有效上游产物的重建请求", () => {
    expect(
      RunRequestSchema.safeParse({
        ...request,
        action: "rebuild",
        rebuildFrom: "architecture",
      }).success,
    ).toBe(false);
  });

  it("明确报告 Engineering 超时，并可复用上游产物只重试失败阶段", async () => {
    class EngineeringTimeoutProvider extends FakeModelProvider {
      override async generateApp(
        _prompt: string,
        _product: ProductAgentOutput,
        _technicalPlan: TechnicalPlan,
        _signal: AbortSignal,
      ): Promise<GeneratedApp> {
        throw new ModelProviderError(
          "provider_timeout",
          "工程阶段测试超时。",
          true,
        );
      }
    }

    const failedEvents = [];
    for await (const event of runPipeline(
      request,
      new AbortController().signal,
      new EngineeringTimeoutProvider(),
    )) {
      failedEvents.push(RunEventSchema.parse(event));
    }
    const failure = failedEvents.find(
      (event) => event.type === "stage.failed",
    );
    expect(failure).toMatchObject({
      type: "stage.failed",
      stage: "engineering",
      payload: { code: "provider_timeout", retryable: true },
    });

    const retryRequest = RunRequestSchema.parse({
      ...request,
      runId: "42b445c4-ecb4-410a-b8ea-c4c38b5da227",
      idempotencyKey: "engineering-retry-key",
      action: "retry",
      retryFrom: "engineering",
      artifacts: {
        product: createProductArtifacts(request.prompt),
        technicalPlan: createTechnicalPlan(request.prompt),
      },
    });
    const retriedEvents = [];
    for await (const event of runPipeline(
      retryRequest,
      new AbortController().signal,
      new FakeModelProvider(),
    )) {
      retriedEvents.push(RunEventSchema.parse(event));
    }

    expect(
      retriedEvents
        .filter((event) => event.type === "stage.started")
        .map((event) => event.stage),
    ).toEqual(["engineering", "validation"]);
    expect(retriedEvents.at(-1)?.type).toBe("run.completed");
  });
});
