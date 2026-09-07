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

export const LEGACY_PROJECT_STORAGE_KEY = "buildtrace-project-v1";
export const PROJECT_STORAGE_KEY = "buildtrace-project-v2:guest";
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

const ProjectSnapshotFields = {
  projectId: z.string().uuid(),
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
};

export const ProjectSnapshotSchema = z.object({
  schemaVersion: z.literal(2),
  ...ProjectSnapshotFields,
});

const LegacyProjectSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  ...ProjectSnapshotFields,
  projectId: z.never().optional(),
});

export type ProjectSnapshot = z.infer<typeof ProjectSnapshotSchema>;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type LoadProjectResult =
  | { snapshot: ProjectSnapshot; error: null }
  | { snapshot: null; error: string | null };

export function projectStorageKey(ownerScope = "guest") {
  return `buildtrace-project-v2:${encodeURIComponent(ownerScope)}`;
}

export function loadProject(
  storage: StorageLike,
  ownerScope = "guest",
): LoadProjectResult {
  const key = projectStorageKey(ownerScope);
  const raw =
    storage.getItem(key) ??
    (ownerScope === "guest"
      ? storage.getItem(LEGACY_PROJECT_STORAGE_KEY)
      : null);
  if (!raw) return { snapshot: null, error: null };

  try {
    const json = JSON.parse(raw) as unknown;
    const parsed = ProjectSnapshotSchema.safeParse(json);
    if (parsed.success) return { snapshot: parsed.data, error: null };

    const legacy = LegacyProjectSnapshotSchema.safeParse(json);
    if (legacy.success) {
      return {
        snapshot: ProjectSnapshotSchema.parse({
          ...legacy.data,
          schemaVersion: 2,
          projectId: crypto.randomUUID(),
        }),
        error: null,
      };
    }

    return {
      snapshot: null,
      error: "本地项目版本无法识别，已暂停恢复；你可以重置本地数据后重新开始。",
    };
  } catch {
    return {
      snapshot: null,
      error: "本地项目数据已损坏，已暂停恢复；你可以重置本地数据后重新开始。",
    };
  }
}

export function saveProject(
  storage: StorageLike,
  snapshot: ProjectSnapshot,
  ownerScope = "guest",
) {
  const normalized = ProjectSnapshotSchema.parse({
    ...snapshot,
    savedAt: new Date().toISOString(),
    versions: snapshot.versions.slice(-MAX_STORED_VERSIONS),
  });

  try {
    storage.setItem(projectStorageKey(ownerScope), JSON.stringify(normalized));
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
      storage.setItem(projectStorageKey(ownerScope), JSON.stringify(compacted));
      return { ok: true, compacted: true } as const;
    } catch {
      return { ok: false, compacted: true } as const;
    }
  }
}

export function clearProject(storage: StorageLike, ownerScope = "guest") {
  storage.removeItem(projectStorageKey(ownerScope));
  if (ownerScope === "guest") {
    storage.removeItem(LEGACY_PROJECT_STORAGE_KEY);
  }
}

export function forkProjectSnapshot(
  snapshot: ProjectSnapshot,
): ProjectSnapshot {
  const versionIds = new Map<string, string>();
  const versions = snapshot.versions.map((version) => {
    const id = crypto.randomUUID();
    versionIds.set(version.id, id);
    return { ...version, id };
  });

  return ProjectSnapshotSchema.parse({
    ...snapshot,
    projectId: crypto.randomUUID(),
    savedAt: new Date().toISOString(),
    activeVersionId: snapshot.activeVersionId
      ? (versionIds.get(snapshot.activeVersionId) ?? null)
      : null,
    versions,
  });
}

export function selectAccountSnapshot(input: {
  local: ProjectSnapshot | null;
  cloud: ProjectSnapshot | null;
  guest: ProjectSnapshot | null;
}): ProjectSnapshot | null {
  if (input.local && input.cloud) {
    return Date.parse(input.cloud.savedAt) > Date.parse(input.local.savedAt)
      ? input.cloud
      : input.local;
  }
  if (input.local) return input.local;
  if (input.cloud) return input.cloud;
  return input.guest ? forkProjectSnapshot(input.guest) : null;
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
