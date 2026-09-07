import { describe, expect, it, vi } from "vitest";

import { createProductArtifacts } from "@/src/lib/fake-provider";
import { DeepSeekProvider } from "@/src/lib/deepseek-provider";

describe("DeepSeekProvider", () => {
  it("通过 Responses API 请求严格 Schema 并解析产物", async () => {
    const artifact = createProductArtifacts("创建一个自由职业者报价计算器");
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void input;
        void init;
        return new Response(
          JSON.stringify({
            status: "completed",
            output: [
              {
                type: "message",
                content: [
                  { type: "output_text", text: JSON.stringify(artifact) },
                ],
              },
            ],
            usage: { input_tokens: 800, output_tokens: 1_200 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    );
    const onUsage = vi.fn();
    const provider = new DeepSeekProvider({
      apiKey: "test-key",
      fetcher: fetcher as unknown as typeof fetch,
      onUsage,
    });

    const result = await provider.generateProduct(
      "创建一个自由职业者报价计算器",
      new AbortController().signal,
    );

    expect(result).toEqual(artifact);
    expect(onUsage).toHaveBeenCalledWith({
      input_tokens: 800,
      output_tokens: 1_200,
    });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.deepseek.com/responses");
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe("deepseek-v4-flash");
    expect(body.text.format.type).toBe("json_schema");
    expect(body.text.format.schema.$schema).toBeUndefined();
    expect(body.max_output_tokens).toBe(8_000);
  });

  it("把限流响应归一化为可重试错误", async () => {
    const provider = new DeepSeekProvider({
      apiKey: "test-key",
      fetcher: vi.fn(
        async () => new Response("{}", { status: 429 }),
      ) as unknown as typeof fetch,
    });

    const promise = provider.generateProduct(
      "创建一个自由职业者报价计算器",
      new AbortController().signal,
    );

    await expect(promise).rejects.toMatchObject({
      code: "provider_rate_limited",
      retryable: true,
    });
  });

  it("结构化输出无效时只执行一次受限修复", async () => {
    const artifact = createProductArtifacts("创建一个自由职业者报价计算器");
    let attempt = 0;
    const fetcher = vi.fn(async () => {
      attempt += 1;
      const text = attempt === 1 ? "not-json" : JSON.stringify(artifact);
      return new Response(
        JSON.stringify({
          status: "completed",
          output: [
            { type: "message", content: [{ type: "output_text", text }] },
          ],
        }),
        { status: 200 },
      );
    });
    const provider = new DeepSeekProvider({
      apiKey: "test-key",
      fetcher: fetcher as unknown as typeof fetch,
    });

    const result = await provider.generateProduct(
      "创建一个自由职业者报价计算器",
      new AbortController().signal,
    );

    expect(result).toEqual(artifact);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
