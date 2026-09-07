import { RunEventSchema, RunRequestSchema } from "@/src/lib/contracts";
import { authorizeLiveRun } from "@/src/lib/live-budget";
import { ModelProviderError } from "@/src/lib/model-provider";
import { runPipeline } from "@/src/lib/orchestrator";
import { createConfiguredProvider } from "@/src/lib/provider-factory";
import { authenticateRunRequest } from "@/src/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "请求体必须是有效 JSON。" }, { status: 400 });
  }

  const parsed = RunRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "请求不符合生成契约。", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  let identity;
  try {
    identity = await authenticateRunRequest(request);
  } catch {
    return Response.json(
      { error: "身份服务暂时不可用，请稍后重试。" },
      { status: 503 },
    );
  }
  if (identity.authRequired && !identity.userId) {
    return Response.json(
      { error: "请先登录后再使用实时生成。" },
      { status: 401 },
    );
  }

  let provider;
  try {
    provider = createConfiguredProvider();
    if (provider.id === "deepseek") {
      authorizeLiveRun({
        sessionId: identity.userId ?? parsed.data.clientSessionId,
        idempotencyKey: parsed.data.idempotencyKey,
      });
    }
  } catch (error) {
    const message =
      error instanceof ModelProviderError
        ? error.message
        : "模型服务配置无效。";
    return Response.json({ error: message }, { status: 503 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of runPipeline(
          parsed.data,
          request.signal,
          provider,
        )) {
          const validated = RunEventSchema.parse(event);
          controller.enqueue(encoder.encode(`${JSON.stringify(validated)}\n`));
        }
      } catch (error) {
        controller.error(error);
        return;
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
