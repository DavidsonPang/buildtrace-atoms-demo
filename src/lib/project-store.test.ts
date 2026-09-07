import { describe, expect, it } from "vitest";

import {
  createGeneratedApp,
  createProductArtifacts,
  createTechnicalPlan,
} from "@/src/lib/fake-provider";
import {
  MAX_STORED_VERSIONS,
  PROJECT_STORAGE_KEY,
  ProjectSnapshotSchema,
  loadProject,
  saveProject,
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
    schemaVersion: 1,
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
});
