import { z } from "zod";

export const StageIdSchema = z.enum([
  "product",
  "architecture",
  "engineering",
  "validation",
]);

export type StageId = z.infer<typeof StageIdSchema>;

export const GuidedContextSchema = z.object({
  audience: z.string().trim().max(300).optional(),
  primaryAction: z.string().trim().max(300).optional(),
  constraints: z.array(z.string().trim().max(200)).max(8).optional(),
});

export type GuidedContext = z.infer<typeof GuidedContextSchema>;

export const IdeaAnalysisSchema = z.object({
  problem: z.string().min(20).max(800),
  audience: z.string().min(10).max(500),
  assumptions: z.array(z.string().max(240)).min(1).max(6),
  risks: z.array(z.string().max(240)).max(6),
});

export const ProductBriefSchema = z.object({
  productName: z.string().min(2).max(80),
  valueProposition: z.string().min(20).max(300),
  primaryUser: z.string().min(10).max(300),
  primaryAction: z.string().min(10).max(300),
  functionalRequirements: z.array(z.string().max(240)).min(2).max(8),
  acceptanceCriteria: z.array(z.string().max(240)).min(2).max(8),
  constraints: z.array(z.string().max(240)).max(8),
  outOfScope: z.array(z.string().max(240)).max(8),
});

export const ProductAgentOutputSchema = z.object({
  ideaAnalysis: IdeaAnalysisSchema,
  productBrief: ProductBriefSchema,
});

export type ProductAgentOutput = z.infer<typeof ProductAgentOutputSchema>;

export const TechnicalPlanSchema = z.object({
  interactionModel: z.string().min(20).max(600),
  dataModel: z
    .array(
      z.object({
        name: z.string().max(80),
        fields: z.array(z.string().max(120)).max(12),
      }),
    )
    .max(8),
  components: z
    .array(
      z.object({
        name: z.string().max(80),
        responsibility: z.string().max(240),
      }),
    )
    .min(2)
    .max(12),
  behaviors: z.array(z.string().max(240)).min(1).max(12),
  validationPlan: z.array(z.string().max(240)).min(1).max(10),
});

export type TechnicalPlan = z.infer<typeof TechnicalPlanSchema>;

export const GeneratedAppSchema = z.object({
  title: z.string().min(2).max(100),
  summary: z.string().min(20).max(300),
  html: z.string().min(300).max(100_000),
  implementedRequirementIds: z.array(z.string()).min(1),
});

export type GeneratedApp = z.infer<typeof GeneratedAppSchema>;

export const ArtifactSnapshotSchema = z.object({
  product: ProductAgentOutputSchema.optional(),
  technicalPlan: TechnicalPlanSchema.optional(),
  generatedApp: GeneratedAppSchema.optional(),
});

export type ArtifactSnapshot = z.infer<typeof ArtifactSnapshotSchema>;

export const RunRequestSchema = z
  .object({
    protocolVersion: z.literal(1),
    runId: z.string().uuid(),
    clientSessionId: z.string().uuid(),
    idempotencyKey: z.string().min(16).max(128),
    mode: z.enum(["quick", "guided"]),
    action: z.enum(["initial", "continue", "retry", "rebuild"]),
    prompt: z.string().trim().min(10).max(2_000),
    context: GuidedContextSchema.optional(),
    retryFrom: StageIdSchema.optional(),
    rebuildFrom: StageIdSchema.optional(),
    artifacts: ArtifactSnapshotSchema.optional(),
  })
  .superRefine((request, context) => {
    if (request.action === "initial") {
      if (request.retryFrom || request.rebuildFrom || request.artifacts) {
        context.addIssue({
          code: "custom",
          message: "Initial runs cannot include resume artifacts.",
        });
      }
      return;
    }

    if (request.action === "rebuild" || request.action === "continue") {
      if (
        request.rebuildFrom !== "architecture" ||
        !request.artifacts?.product
      ) {
        context.addIssue({
          code: "custom",
          message: "Rebuilds require a validated product artifact.",
        });
      }
      return;
    }

    if (!request.retryFrom) {
      context.addIssue({
        code: "custom",
        message: "Retries require retryFrom.",
      });
      return;
    }

    const artifacts = request.artifacts;
    if (request.retryFrom === "architecture" && !artifacts?.product) {
      context.addIssue({
        code: "custom",
        message: "Architecture retries require the product artifact.",
      });
    }
    if (
      request.retryFrom === "engineering" &&
      (!artifacts?.product || !artifacts.technicalPlan)
    ) {
      context.addIssue({
        code: "custom",
        message: "Engineering retries require product and technical artifacts.",
      });
    }
    if (request.retryFrom === "validation" && !artifacts?.generatedApp) {
      context.addIssue({
        code: "custom",
        message: "Validation retries require the generated app artifact.",
      });
    }
  });

export type RunRequest = z.infer<typeof RunRequestSchema>;

export const ValidationCheckSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: z.enum(["pass", "warning", "failure"]),
  detail: z.string(),
});

export type ValidationCheck = z.infer<typeof ValidationCheckSchema>;

export const PresetProjectSchema = z.object({
  protocolVersion: z.literal(1),
  source: z.literal("preset"),
  prompt: z.string().min(10).max(2_000),
  providerLabel: z.string().max(120),
  product: ProductAgentOutputSchema,
  technicalPlan: TechnicalPlanSchema,
  generatedApp: GeneratedAppSchema,
  acceptedHtml: z.string().min(300).max(150_000),
  checks: z.array(ValidationCheckSchema).max(20),
});

export type PresetProject = z.infer<typeof PresetProjectSchema>;

const BaseEventSchema = z.object({
  protocolVersion: z.literal(1),
  runId: z.string().uuid(),
  sequence: z.number().int().nonnegative(),
  timestamp: z.string(),
  stage: StageIdSchema.optional(),
});

export const RunEventSchema = z.discriminatedUnion("type", [
  BaseEventSchema.extend({
    type: z.literal("run.accepted"),
    payload: z.object({ providerLabel: z.string(), mode: z.string() }),
  }),
  BaseEventSchema.extend({
    type: z.literal("stage.started"),
    stage: StageIdSchema,
    payload: z.object({ label: z.string(), agent: z.string() }),
  }),
  BaseEventSchema.extend({
    type: z.literal("stage.progress"),
    stage: StageIdSchema,
    payload: z.object({ message: z.string() }),
  }),
  BaseEventSchema.extend({
    type: z.literal("artifact.completed"),
    stage: StageIdSchema,
    payload: z.discriminatedUnion("kind", [
      z.object({
        kind: z.literal("product"),
        artifact: ProductAgentOutputSchema,
      }),
      z.object({
        kind: z.literal("technical-plan"),
        artifact: TechnicalPlanSchema,
      }),
      z.object({
        kind: z.literal("generated-app"),
        artifact: GeneratedAppSchema,
      }),
    ]),
  }),
  BaseEventSchema.extend({
    type: z.literal("stage.completed"),
    stage: StageIdSchema,
    payload: z.object({ durationMs: z.number().nonnegative() }),
  }),
  BaseEventSchema.extend({
    type: z.literal("validation.completed"),
    stage: z.literal("validation"),
    payload: z.object({
      checks: z.array(ValidationCheckSchema),
      acceptedHtml: z.string(),
      title: z.string(),
      summary: z.string(),
    }),
  }),
  BaseEventSchema.extend({
    type: z.literal("stage.failed"),
    stage: StageIdSchema,
    payload: z.object({
      code: z.string(),
      message: z.string(),
      retryable: z.boolean(),
    }),
  }),
  BaseEventSchema.extend({
    type: z.literal("run.awaiting_user"),
    stage: z.literal("product"),
    payload: z.object({
      reason: z.literal("product_review"),
      nextStage: z.literal("architecture"),
    }),
  }),
  BaseEventSchema.extend({
    type: z.literal("run.completed"),
    payload: z.object({ totalDurationMs: z.number().nonnegative() }),
  }),
  BaseEventSchema.extend({
    type: z.literal("run.cancelled"),
    payload: z.object({ message: z.string() }),
  }),
]);

export type RunEvent = z.infer<typeof RunEventSchema>;

export const STAGE_META: Record<
  StageId,
  { label: string; agent: string; short: string }
> = {
  product: {
    label: "想法分析与产品简报",
    agent: "产品 Agent",
    short: "产品",
  },
  architecture: {
    label: "交互与实现规划",
    agent: "架构 Agent",
    short: "架构",
  },
  engineering: {
    label: "微型产品构建",
    agent: "工程 Agent",
    short: "构建",
  },
  validation: {
    label: "确定性验证",
    agent: "验证器",
    short: "验证",
  },
};
