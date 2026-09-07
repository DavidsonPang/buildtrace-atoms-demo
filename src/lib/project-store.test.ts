import { describe, expect, it } from "vitest";

import {
  createGeneratedApp,
  createProductArtifacts,
  createTechnicalPlan,
} from "@/src/lib/fake-provider";
import {
  LEGACY_PROJECT_STORAGE_KEY,
  MAX_STORED_VERSIONS,
  PROJECT_STORAGE_KEY,
  ProjectSnapshotSchema,
  forkProjectSnapshot,
  loadProject,
  saveProject,
  selectAccountSnapshot,
  type ProjectSnapshot,
} from "@/src/lib/project-store";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

const prompt = "为自由职业设计师创建一个项目报价计算器，包含工时和加急费用。";

function snapshot(): ProjectSnapshot {
  const product = createProductArtifacts(prompt);
  const technicalPlan = createTechnicalPlan(prompt);
  const generatedApp = createGeneratedApp(prompt);
  const version = {
    id: "b43ad55a-fefd-45e1-9c8d-90ce7db802c5",
    createdAt: "2026-09-07T00:00:00.000Z",
    revision: 1,
    prompt,
    providerLabel: "Fake Provider · 确定性演示",
    product,
    technicalPlan,
    generatedApp,
    acceptedHtml: generatedApp.html,
    checks: [],
  };

  return ProjectSnapshotSchema.parse({
    schemaVersion: 2,
    projectId: "8b38a126-fdd8-4784-9e92-101dc73420d5",
    savedAt: "2026-09-07T00:00:00.000Z",
    prompt,
    mode: "quick",
    runState: "ready",
    stages: {
      product: "completed",
      architecture: "completed",
      engineering: "completed",
      validation: "ready",
    },
    providerLabel: version.providerLabel,
    product,
    technicalPlan,
    generatedApp,
    activeVersionId: version.id,
    versions: [version],
    lastError: "",
    briefRevision: 1,
  });
}

describe("project store", () => {
  it("保存并恢复经过 Schema 校验的项目快照", () => {
    const storage = new MemoryStorage();
    expect(saveProject(storage, snapshot()).ok).toBe(true);
    expect(loadProject(storage).snapshot?.activeVersionId).toBe(
      "b43ad55a-fefd-45e1-9c8d-90ce7db802c5",
    );
  });

  it("对损坏数据安全降级而不删除原始值", () => {
    const storage = new MemoryStorage();
    storage.setItem(PROJECT_STORAGE_KEY, "{invalid json");

    const result = loadProject(storage);
    expect(result.snapshot).toBeNull();
    expect(result.error).toContain("损坏");
    expect(storage.getItem(PROJECT_STORAGE_KEY)).toBe("{invalid json");
  });

  it("只保留最近三个成功版本", () => {
    const storage = new MemoryStorage();
    const base = snapshot();
    const versions = Array.from({ length: 5 }, (_, index) => ({
      ...base.versions[0],
      id: `00000000-0000-4000-8000-00000000000${index}`,
      revision: index + 1,
    }));

    saveProject(storage, {
      ...base,
      activeVersionId: versions.at(-1)?.id ?? null,
      versions,
    } as ProjectSnapshot);

    const restored = loadProject(storage).snapshot;
    expect(restored?.versions).toHaveLength(MAX_STORED_VERSIONS);
    expect(restored?.versions[0].revision).toBe(3);
  });

  it("把旧版游客快照迁移到带项目 ID 的 v2 结构", () => {
    const storage = new MemoryStorage();
    const current = snapshot();
    const legacy: Partial<ProjectSnapshot> = { ...current };
    delete legacy.projectId;
    storage.setItem(
      LEGACY_PROJECT_STORAGE_KEY,
      JSON.stringify({ ...legacy, schemaVersion: 1 }),
    );

    const restored = loadProject(storage, "guest").snapshot;
    expect(restored?.schemaVersion).toBe(2);
    expect(restored?.projectId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("按用户 ID 隔离本地缓存", () => {
    const storage = new MemoryStorage();
    saveProject(storage, snapshot(), "user-a");

    expect(loadProject(storage, "user-a").snapshot).not.toBeNull();
    expect(loadProject(storage, "user-b").snapshot).toBeNull();
  });

  it("把游客项目迁入账户时重建项目与版本 ID", () => {
    const guest = snapshot();
    const migrated = forkProjectSnapshot(guest);

    expect(migrated.projectId).not.toBe(guest.projectId);
    expect(migrated.versions[0].id).not.toBe(guest.versions[0].id);
    expect(migrated.activeVersionId).toBe(migrated.versions[0].id);
  });

  it("账户已有本地或云端数据时不让游客快照参与冲突", () => {
    const guest = snapshot();
    const cloud = {
      ...snapshot(),
      projectId: "84c082c1-b442-4d03-833f-aa23fe89d23c",
      savedAt: "2026-09-06T00:00:00.000Z",
    };

    expect(
      selectAccountSnapshot({ local: null, cloud, guest })?.projectId,
    ).toBe(cloud.projectId);
  });

  it("账户本地与云端冲突时选择 savedAt 较新者", () => {
    const local = snapshot();
    const cloud = {
      ...snapshot(),
      projectId: "84c082c1-b442-4d03-833f-aa23fe89d23c",
      savedAt: "2026-09-08T00:00:00.000Z",
    };

    expect(
      selectAccountSnapshot({ local, cloud, guest: snapshot() })?.projectId,
    ).toBe(cloud.projectId);
  });
});
