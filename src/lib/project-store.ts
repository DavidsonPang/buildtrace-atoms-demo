import { z } from "zod";

import {
  GeneratedAppSchema,
  ProductAgentOutputSchema,
  TechnicalPlanSchema,
  ValidationCheckSchema,
  type GeneratedApp,
  type ProductAgentOutput,
  type TechnicalPlan,
  type ValidationCheck,
} from "@/src/lib/contracts";

export const PROJECT_STORAGE_KEY = "buildtrace-project-v1";
export const MAX_STORED_VERSIONS = 3;

const StageStateSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "stale",
  "cancelled",
  "ready",
]);

const RunStateSchema = z.enum([
  "idle",
  "running",
  "awaiting_user",
  "previewing",
  "ready",
  "failed",
  "cancelled",
  "rebuilding",
  "retrying",
]);

export const ProjectVersionSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string(),
  revision: z.number().int().positive(),
  prompt: z.string().min(10).max(2_000),
  providerLabel: z.string().max(120),
  product: ProductAgentOutputSchema,
  technicalPlan: TechnicalPlanSchema,
  generatedApp: GeneratedAppSchema,
  acceptedHtml: z.string().min(300).max(150_000),
  checks: z.array(ValidationCheckSchema).max(20),
});

export type ProjectVersion = z.infer<typeof ProjectVersionSchema>;

export const ProjectSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  savedAt: z.string(),
  prompt: z.string().max(2_000),
  mode: z.enum(["quick", "guided"]),
  runState: RunStateSchema,
  stages: z.object({
    product: StageStateSchema,
    architecture: StageStateSchema,
    engineering: StageStateSchema,
    validation: StageStateSchema,
  }),
  providerLabel: z.string().max(120),
  product: ProductAgentOutputSchema.nullable(),
  technicalPlan: TechnicalPlanSchema.nullable(),
  generatedApp: GeneratedAppSchema.nullable(),
  activeVersionId: z.string().uuid().nullable(),
  versions: z.array(ProjectVersionSchema).max(MAX_STORED_VERSIONS),
  lastError: z.string().max(600),
  briefRevision: z.number().int().nonnegative(),
});

export type ProjectSnapshot = z.infer<typeof ProjectSnapshotSchema>;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type LoadProjectResult =
  | { snapshot: ProjectSnapshot; error: null }
  | { snapshot: null; error: string | null };

export function loadProject(storage: StorageLike): LoadProjectResult {
  const raw = storage.getItem(PROJECT_STORAGE_KEY);
  if (!raw) return { snapshot: null, error: null };

  try {
    const parsed = ProjectSnapshotSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return {
        snapshot: null,
        error:
          "本地项目版本无法识别，已暂停恢复；你可以重置本地数据后重新开始。",
      };
    }
    return { snapshot: parsed.data, error: null };
  } catch {
    return {
      snapshot: null,
      error: "本地项目数据已损坏，已暂停恢复；你可以重置本地数据后重新开始。",
    };
  }
}

export function saveProject(storage: StorageLike, snapshot: ProjectSnapshot) {
  const normalized = ProjectSnapshotSchema.parse({
    ...snapshot,
    savedAt: new Date().toISOString(),
    versions: snapshot.versions.slice(-MAX_STORED_VERSIONS),
  });

  try {
    storage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(normalized));
    return { ok: true, compacted: false } as const;
  } catch {
    const active =
      normalized.versions.find(
        (version) => version.id === normalized.activeVersionId,
      ) ?? normalized.versions.at(-1);
    const compacted = ProjectSnapshotSchema.parse({
      ...normalized,
      versions: active ? [active] : [],
      activeVersionId: active?.id ?? null,
    });

    try {
      storage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(compacted));
      return { ok: true, compacted: true } as const;
    } catch {
      return { ok: false, compacted: true } as const;
    }
  }
}

export function clearProject(storage: StorageLike) {
  storage.removeItem(PROJECT_STORAGE_KEY);
}

export function createProjectVersion(input: {
  revision: number;
  prompt: string;
  providerLabel: string;
  product: ProductAgentOutput;
  technicalPlan: TechnicalPlan;
  generatedApp: GeneratedApp;
  acceptedHtml: string;
  checks: ValidationCheck[];
}): ProjectVersion {
  return ProjectVersionSchema.parse({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...input,
  });
}
