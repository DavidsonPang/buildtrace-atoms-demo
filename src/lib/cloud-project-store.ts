import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ProjectSummarySchema,
  ProjectSnapshotSchema,
  ProjectVersionSchema,
  projectTitle,
  type ProjectSnapshot,
  type ProjectSummary,
} from "@/src/lib/project-store";

const CloudProjectRowSchema = z.object({
  id: z.string().uuid(),
  prompt: z.string(),
  mode: z.string(),
  run_state: z.string(),
  stages: z.unknown(),
  provider_label: z.string(),
  product: z.unknown().nullable(),
  technical_plan: z.unknown().nullable(),
  generated_app: z.unknown().nullable(),
  active_version_id: z.string().uuid().nullable(),
  last_error: z.string(),
  brief_revision: z.number(),
  saved_at: z.string(),
});

const CloudVersionRowSchema = z.object({
  id: z.string().uuid(),
  revision: z.number(),
  prompt: z.string(),
  revision_instruction: z.string(),
  provider_label: z.string(),
  product: z.unknown(),
  technical_plan: z.unknown(),
  generated_app: z.unknown(),
  accepted_html: z.string(),
  checks: z.unknown(),
  created_at: z.string(),
});

const CloudProjectSummaryRowSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(100),
  saved_at: z.string(),
  run_state: z.string(),
  active_version_id: z.string().uuid().nullable(),
});

export class CloudProjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudProjectError";
  }
}

export async function saveCloudProject(
  client: SupabaseClient,
  userId: string,
  snapshot: ProjectSnapshot,
) {
  const project = {
    id: snapshot.projectId,
    user_id: userId,
    title: projectTitle(snapshot),
    prompt: snapshot.prompt,
    mode: snapshot.mode,
    run_state: snapshot.runState,
    stages: snapshot.stages,
    provider_label: snapshot.providerLabel,
    product: snapshot.product,
    technical_plan: snapshot.technicalPlan,
    generated_app: snapshot.generatedApp,
    active_version_id: snapshot.activeVersionId,
    last_error: snapshot.lastError,
    brief_revision: snapshot.briefRevision,
    saved_at: snapshot.savedAt,
    updated_at: new Date().toISOString(),
  };

  const { error: projectError } = await client
    .from("projects")
    .upsert(project, { onConflict: "id" });
  if (projectError) {
    throw new CloudProjectError(`云端项目保存失败：${projectError.message}`);
  }

  const versions = snapshot.versions.map((version) => ({
    id: version.id,
    project_id: snapshot.projectId,
    user_id: userId,
    revision: version.revision,
    prompt: version.prompt,
    revision_instruction: version.revisionInstruction,
    provider_label: version.providerLabel,
    product: version.product,
    technical_plan: version.technicalPlan,
    generated_app: version.generatedApp,
    accepted_html: version.acceptedHtml,
    checks: version.checks,
    created_at: version.createdAt,
  }));
  if (versions.length) {
    const { error: versionError } = await client
      .from("project_versions")
      .upsert(versions, { onConflict: "id" });
    if (versionError) {
      throw new CloudProjectError(`云端版本保存失败：${versionError.message}`);
    }
  }

  let cleanup = client
    .from("project_versions")
    .delete()
    .eq("project_id", snapshot.projectId)
    .eq("user_id", userId);
  if (versions.length) {
    cleanup = cleanup.not(
      "id",
      "in",
      `(${versions.map((version) => version.id).join(",")})`,
    );
  }
  const { error: cleanupError } = await cleanup;
  if (cleanupError) {
    throw new CloudProjectError(`云端旧版本清理失败：${cleanupError.message}`);
  }
}

export async function loadLatestCloudProject(
  client: SupabaseClient,
  userId: string,
): Promise<ProjectSnapshot | null> {
  const { data: projectData, error: projectError } = await client
    .from("projects")
    .select(
      "id,prompt,mode,run_state,stages,provider_label,product,technical_plan,generated_app,active_version_id,last_error,brief_revision,saved_at",
    )
    .eq("user_id", userId)
    .order("saved_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (projectError) {
    throw new CloudProjectError(`云端项目读取失败：${projectError.message}`);
  }
  if (!projectData) return null;

  return hydrateCloudProject(client, userId, projectData);
}

export async function loadCloudProject(
  client: SupabaseClient,
  userId: string,
  projectId: string,
): Promise<ProjectSnapshot | null> {
  const { data: projectData, error: projectError } = await client
    .from("projects")
    .select(
      "id,prompt,mode,run_state,stages,provider_label,product,technical_plan,generated_app,active_version_id,last_error,brief_revision,saved_at",
    )
    .eq("user_id", userId)
    .eq("id", projectId)
    .maybeSingle();

  if (projectError) {
    throw new CloudProjectError(`云端项目读取失败：${projectError.message}`);
  }
  if (!projectData) return null;

  return hydrateCloudProject(client, userId, projectData);
}

export async function listCloudProjects(
  client: SupabaseClient,
  userId: string,
): Promise<ProjectSummary[]> {
  const { data: projectData, error: projectError } = await client
    .from("projects")
    .select("id,title,saved_at,run_state,active_version_id")
    .eq("user_id", userId)
    .order("saved_at", { ascending: false })
    .limit(50);

  if (projectError) {
    throw new CloudProjectError(
      `云端项目列表读取失败：${projectError.message}`,
    );
  }

  const projects = (projectData ?? []).map((row) =>
    CloudProjectSummaryRowSchema.parse(row),
  );
  if (!projects.length) return [];

  const ids = projects.map((project) => project.id);
  const { data: versionData, error: versionError } = await client
    .from("project_versions")
    .select("project_id")
    .eq("user_id", userId)
    .in("project_id", ids);

  if (versionError) {
    throw new CloudProjectError(
      `云端项目版本统计失败：${versionError.message}`,
    );
  }

  const versionCounts = new Map<string, number>();
  for (const row of versionData ?? []) {
    if (typeof row.project_id !== "string") continue;
    versionCounts.set(
      row.project_id,
      (versionCounts.get(row.project_id) ?? 0) + 1,
    );
  }

  return projects.map((project) =>
    ProjectSummarySchema.parse({
      projectId: project.id,
      title: project.title,
      savedAt: project.saved_at,
      runState: project.run_state,
      activeVersionId: project.active_version_id,
      versionCount: versionCounts.get(project.id) ?? 0,
    }),
  );
}

async function hydrateCloudProject(
  client: SupabaseClient,
  userId: string,
  projectData: unknown,
): Promise<ProjectSnapshot> {
  const project = CloudProjectRowSchema.parse(projectData);
  const { data: versionData, error: versionError } = await client
    .from("project_versions")
    .select(
      "id,revision,prompt,revision_instruction,provider_label,product,technical_plan,generated_app,accepted_html,checks,created_at",
    )
    .eq("project_id", project.id)
    .eq("user_id", userId)
    .order("revision", { ascending: false })
    .limit(3);

  if (versionError) {
    throw new CloudProjectError(`云端版本读取失败：${versionError.message}`);
  }

  const versions = (versionData ?? [])
    .map((row) => {
      const version = CloudVersionRowSchema.parse(row);
      return ProjectVersionSchema.parse({
        id: version.id,
        revision: version.revision,
        prompt: version.prompt,
        revisionInstruction: version.revision_instruction,
        providerLabel: version.provider_label,
        product: version.product,
        technicalPlan: version.technical_plan,
        generatedApp: version.generated_app,
        acceptedHtml: version.accepted_html,
        checks: version.checks,
        createdAt: version.created_at,
      });
    })
    .reverse();

  return ProjectSnapshotSchema.parse({
    schemaVersion: 2,
    projectId: project.id,
    savedAt: project.saved_at,
    prompt: project.prompt,
    mode: project.mode,
    runState: project.run_state,
    stages: project.stages,
    providerLabel: project.provider_label,
    product: project.product,
    technicalPlan: project.technical_plan,
    generatedApp: project.generated_app,
    activeVersionId: project.active_version_id,
    versions,
    lastError: project.last_error,
    briefRevision: project.brief_revision,
  });
}
