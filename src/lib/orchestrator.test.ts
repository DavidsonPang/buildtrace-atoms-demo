import { describe, expect, it } from "vitest";

import { RunEventSchema, type RunRequest } from "@/src/lib/contracts";
import { FakeModelProvider } from "@/src/lib/model-provider";
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
});
