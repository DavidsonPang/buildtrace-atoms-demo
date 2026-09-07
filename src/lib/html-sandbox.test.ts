import { describe, expect, it } from "vitest";

import { createGeneratedApp } from "@/src/lib/fake-provider";
import {
  CHANNEL_TOKEN_PLACEHOLDER,
  SandboxValidationError,
  validateAndInstrument,
} from "@/src/lib/html-sandbox";

describe("validateAndInstrument", () => {
  it("接受自包含的交互式应用并注入运行桥", () => {
    const result = validateAndInstrument(
      createGeneratedApp("创建项目报价计算器"),
    );

    expect(result.checks.every((check) => check.status === "pass")).toBe(true);
    expect(result.acceptedHtml).toContain("Content-Security-Policy");
    expect(result.acceptedHtml).toContain(CHANNEL_TOKEN_PLACEHOLDER);
    expect(result.acceptedHtml).toContain("connect-src 'none'");
  });

  it("阻止远程脚本与嵌套 iframe", () => {
    expect(() =>
      validateAndInstrument({
        title: "Unsafe app",
        summary:
          "A deliberately unsafe generated application for validator testing.",
        implementedRequirementIds: ["R1"],
        html: `<!doctype html><html><head><script src="https://evil.example/a.js"></script></head><body><h1>Unsafe application body</h1><button>Try</button><iframe src="https://evil.example"></iframe></body></html>`,
      }),
    ).toThrow(SandboxValidationError);
  });

  it("拒绝没有有效交互控件的静态页面", () => {
    expect(() =>
      validateAndInstrument({
        title: "Static page",
        summary:
          "A static generated page without the required meaningful interaction.",
        implementedRequirementIds: ["R1"],
        html: `<!doctype html><html><head><style>body{color:#111}</style></head><body><main><h1>Only a static heading</h1><p>This page has enough visible body text but no useful interaction target.</p></main></body></html>`,
      }),
    ).toThrow("缺少有效交互控件");
  });
});
