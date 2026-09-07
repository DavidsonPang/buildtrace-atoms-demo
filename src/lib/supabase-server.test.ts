import { afterEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getUser } }),
}));

import { authenticateRunRequest } from "@/src/lib/supabase-server";

describe("Supabase server authentication", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    getUser.mockReset();
  });

  it("未配置 Supabase 时保留本地 Fake Provider 开发模式", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");

    await expect(
      authenticateRunRequest(new Request("http://localhost/api/runs")),
    ).resolves.toEqual({ authRequired: false, userId: null });
    expect(getUser).not.toHaveBeenCalled();
  });

  it("云端模式拒绝缺少 Bearer Token 的生成请求", async () => {
    configureSupabase();

    await expect(
      authenticateRunRequest(new Request("http://localhost/api/runs")),
    ).resolves.toEqual({ authRequired: true, userId: null });
    expect(getUser).not.toHaveBeenCalled();
  });

  it("只信任服务端校验后返回的用户身份", async () => {
    configureSupabase();
    getUser.mockResolvedValue({
      data: { user: { id: "4d716c26-364d-4b1d-8026-855227271340" } },
      error: null,
    });

    const request = new Request("http://localhost/api/runs", {
      headers: { Authorization: "Bearer verified-access-token" },
    });
    await expect(authenticateRunRequest(request)).resolves.toEqual({
      authRequired: true,
      userId: "4d716c26-364d-4b1d-8026-855227271340",
    });
    expect(getUser).toHaveBeenCalledWith("verified-access-token");
  });

  it("把无效 Token 降级为未登录而不是信任客户端声明", async () => {
    configureSupabase();
    getUser.mockResolvedValue({
      data: { user: null },
      error: new Error("invalid token"),
    });

    const request = new Request("http://localhost/api/runs", {
      headers: { Authorization: "Bearer invalid" },
    });
    await expect(authenticateRunRequest(request)).resolves.toEqual({
      authRequired: true,
      userId: null,
    });
  });
});

function configureSupabase() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "sb_publishable_example_for_unit_tests",
  );
}
