import { describe, expect, it } from "vitest";

import { RunEventSchema, type RunRequest } from "@/src/lib/contracts";
import { runFakePipeline } from "@/src/lib/orchestrator";

const request: RunRequest = {
  protocolVersion: 1,
  runId: "bb510ba2-e9f8-44b4-acf0-66bcad62596e",
  idempotencyKey: "phase-three-test-key",
  mode: "quick",
  action: "initial",
  prompt: "为自由职业设计师创建一个项目报价计算器，包含工时和加急费用。",
};

describe("runFakePipeline", () => {
  it("按真实阶段顺序生成并验证事件", async () => {
    const events = [];
    for await (const event of runFakePipeline(request, new AbortController().signal)) {
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
    expect(events.some((event) => event.type === "validation.completed")).toBe(true);
  });

  it("在开始前取消时生成取消事件", async () => {
    const controller = new AbortController();
    controller.abort();
    const events = [];

    for await (const event of runFakePipeline(request, controller.signal)) events.push(event);

    expect(events.at(-1)?.type).toBe("run.cancelled");
    expect(events.some((event) => event.type === "run.completed")).toBe(false);
  });
});
