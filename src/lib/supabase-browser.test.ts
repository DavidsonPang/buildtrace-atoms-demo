import { describe, expect, it, vi } from "vitest";

import { fetchSupabaseWithTimeout } from "./supabase-browser";

describe("fetchSupabaseWithTimeout", () => {
  it("在请求悬挂时主动中止，而不是让会话恢复无限等待", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          );
        }),
    );

    const request = fetchSupabaseWithTimeout(
      "https://example.supabase.co/auth/v1/token",
      undefined,
      100,
      fetcher,
    );
    const rejection = expect(request).rejects.toMatchObject({
      name: "TimeoutError",
    });

    await vi.advanceTimersByTimeAsync(100);
    await rejection;
    expect(fetcher).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("保留调用方已经传入的中止信号", async () => {
    const upstream = new AbortController();
    const fetcher = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          );
        }),
    );

    const request = fetchSupabaseWithTimeout(
      "https://example.supabase.co/rest/v1/projects",
      { signal: upstream.signal },
      5_000,
      fetcher,
    );
    upstream.abort(new DOMException("调用方取消", "AbortError"));

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });
});
