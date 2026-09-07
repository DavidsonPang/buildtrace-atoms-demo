import { PresetProjectSchema } from "@/src/lib/contracts";
import {
  createGeneratedApp,
  createProductArtifacts,
  createTechnicalPlan,
} from "@/src/lib/fake-provider";
import { validateAndInstrument } from "@/src/lib/html-sandbox";

export const runtime = "nodejs";
export const dynamic = "force-static";

const prompt =
  "为自由职业设计师创建一个项目报价计算器，包含透明分项、加急费用和可复制摘要。";

export function GET() {
  const product = createProductArtifacts(prompt);
  const technicalPlan = createTechnicalPlan(prompt);
  const generatedApp = createGeneratedApp(prompt);
  const validation = validateAndInstrument(generatedApp);

  return Response.json(
    PresetProjectSchema.parse({
      protocolVersion: 1,
      source: "preset",
      prompt,
      providerLabel: "预置成功项目 · 不调用模型",
      product,
      technicalPlan,
      generatedApp,
      acceptedHtml: validation.acceptedHtml,
      checks: validation.checks,
    }),
    {
      headers: {
        "Cache-Control": "public, max-age=0, s-maxage=86400",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
