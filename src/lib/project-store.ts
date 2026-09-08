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
export const MAX_INDEXED_PROJECTS = 50;

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
  revisionInstruction: z.string().max(800).default(""),
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

export const ProjectSummarySchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(100),
  savedAt: z.string(),
  runState: RunStateSchema,
  activeVersionId: z.string().uuid().nullable(),
  versionCount: z.number().int().nonnegative(),
});

export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;

const ProjectIndexSchema = z.object({
  schemaVersion: z.literal(1),
  activeProjectId: z.string().uuid().nullable(),
  projects: z.array(ProjectSummarySchema).max(MAX_INDEXED_PROJECTS),
});

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type LoadProjectResult =
  | { snapshot: ProjectSnapshot; error: null }
  | { snapshot: null; error: string | null };

export function projectStorageKey(ownerScope = "guest") {
  return `buildtrace-project-v2:${encodeURIComponent(ownerScope)}`;
}

export function projectIndexKey(ownerScope = "guest") {
  return `buildtrace-project-index-v1:${encodeURIComponent(ownerScope)}`;
}

export function projectSnapshotKey(projectId: string, ownerScope = "guest") {
  return `buildtrace-project-v3:${encodeURIComponent(ownerScope)}:${projectId}`;
}

export function projectTitle(snapshot: ProjectSnapshot) {
  const productName = snapshot.product?.productBrief.productName.trim();
  return (productName || "未命名项目").slice(0, 100);
}

export function projectSummary(snapshot: ProjectSnapshot): ProjectSummary {
  return ProjectSummarySchema.parse({
    projectId: snapshot.projectId,
    title: projectTitle(snapshot),
    savedAt: snapshot.savedAt,
    runState: snapshot.runState,
    activeVersionId: snapshot.activeVersionId,
    versionCount: snapshot.versions.length,
  });
}

function readProjectIndex(storage: StorageLike, ownerScope: string) {
  const raw = storage.getItem(projectIndexKey(ownerScope));
  if (!raw) return { index: null, error: null } as const;
  try {
    const parsed = ProjectIndexSchema.safeParse(JSON.parse(raw) as unknown);
    if (parsed.success) return { index: parsed.data, error: null } as const;
    return { index: null, error: "本地项目索引版本无法识别。" } as const;
  } catch {
    return { index: null, error: "本地项目索引已损坏。" } as const;
  }
}

function parseSnapshot(raw: string): LoadProjectResult {
  try {
    const parsed = ProjectSnapshotSchema.safeParse(JSON.parse(raw) as unknown);
    return parsed.success
      ? { snapshot: parsed.data, error: null }
      : {
          snapshot: null,
          error:
            "本地项目版本无法识别，已暂停恢复；你可以重置本地数据后重新开始。",
        };
  } catch {
    return {
      snapshot: null,
      error: "本地项目数据已损坏，已暂停恢复；你可以重置本地数据后重新开始。",
    };
  }
}

export function listLocalProjects(
  storage: StorageLike,
  ownerScope = "guest",
): {
  projects: ProjectSummary[];
  activeProjectId: string | null;
  error: string | null;
} {
  const { index, error } = readProjectIndex(storage, ownerScope);
  if (index) {
    return {
      projects: [...index.projects].sort(
        (left, right) => Date.parse(right.savedAt) - Date.parse(left.savedAt),
      ),
      activeProjectId: index.activeProjectId,
      error: null,
    };
  }

  const legacy = loadLegacyProject(storage, ownerScope);
  return {
    projects: legacy.snapshot ? [projectSummary(legacy.snapshot)] : [],
    activeProjectId: legacy.snapshot?.projectId ?? null,
    error: error ?? legacy.error,
  };
}

export function loadProject(
  storage: StorageLike,
  ownerScope = "guest",
  projectId?: string,
): LoadProjectResult {
  if (projectId) {
    const raw = storage.getItem(projectSnapshotKey(projectId, ownerScope));
    return raw ? parseSnapshot(raw) : { snapshot: null, error: null };
  }

  const { index, error: indexError } = readProjectIndex(storage, ownerScope);
  if (index?.activeProjectId) {
    const raw = storage.getItem(
      projectSnapshotKey(index.activeProjectId, ownerScope),
    );
    if (raw) return parseSnapshot(raw);
  }

  const legacy = loadLegacyProject(storage, ownerScope);
  if (legacy.snapshot || legacy.error) return legacy;
  if (indexError) return { snapshot: null, error: indexError };
  return { snapshot: null, error: null };
}

function loadLegacyProject(
  storage: StorageLike,
  ownerScope: string,
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
    writeProjectAndIndex(storage, normalized, ownerScope);
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
      writeProjectAndIndex(storage, compacted, ownerScope);
      return { ok: true, compacted: true } as const;
    } catch {
      return { ok: false, compacted: true } as const;
    }
  }
}

function writeProjectAndIndex(
  storage: StorageLike,
  snapshot: ProjectSnapshot,
  ownerScope: string,
) {
  storage.setItem(
    projectSnapshotKey(snapshot.projectId, ownerScope),
    JSON.stringify(snapshot),
  );
  const current = readProjectIndex(storage, ownerScope).index;
  const projects = [
    projectSummary(snapshot),
    ...(current?.projects ?? []).filter(
      (project) => project.projectId !== snapshot.projectId,
    ),
  ]
    .sort((left, right) => Date.parse(right.savedAt) - Date.parse(left.savedAt))
    .slice(0, MAX_INDEXED_PROJECTS);
  storage.setItem(
    projectIndexKey(ownerScope),
    JSON.stringify({
      schemaVersion: 1,
      activeProjectId: snapshot.projectId,
      projects,
    }),
  );
}

export function clearProject(
  storage: StorageLike,
  ownerScope = "guest",
  projectId?: string,
) {
  const current = readProjectIndex(storage, ownerScope).index;
  const targetId = projectId ?? current?.activeProjectId;
  if (targetId) {
    storage.removeItem(projectSnapshotKey(targetId, ownerScope));
    const projects = (current?.projects ?? []).filter(
      (project) => project.projectId !== targetId,
    );
    storage.setItem(
      projectIndexKey(ownerScope),
      JSON.stringify({
        schemaVersion: 1,
        activeProjectId: projects[0]?.projectId ?? null,
        projects,
      }),
    );
  } else {
    storage.removeItem(projectIndexKey(ownerScope));
  }

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
  revisionInstruction?: string;
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
