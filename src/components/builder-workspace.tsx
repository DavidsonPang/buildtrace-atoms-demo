"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  RunEventSchema,
  PresetProjectSchema,
  STAGE_META,
  type ArtifactSnapshot,
  type GeneratedApp,
  type GuidedContext,
  type ProductAgentOutput,
  type RunEvent,
  type StageId,
  type TechnicalPlan,
  type ValidationCheck,
} from "@/src/lib/contracts";
import {
  loadLatestCloudProject,
  saveCloudProject,
} from "@/src/lib/cloud-project-store";
import { CHANNEL_TOKEN_PLACEHOLDER } from "@/src/lib/html-sandbox";
import {
  MAX_STORED_VERSIONS,
  clearProject,
  createProjectVersion,
  loadProject,
  saveProject,
  selectAccountSnapshot,
  type ProjectSnapshot,
  type ProjectVersion,
} from "@/src/lib/project-store";

import { AuthControls, useAuth } from "./auth-provider";
import { ProductBriefEditor } from "./product-brief-editor";

type StageState =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "stale"
  | "cancelled"
  | "ready";
type InspectorTab = "preview" | "code" | "logs" | "validation";
type RunState =
  | "idle"
  | "running"
  | "awaiting_user"
  | "previewing"
  | "ready"
  | "failed"
  | "cancelled"
  | "rebuilding"
  | "retrying";

type StartRunOptions = {
  action?: "initial" | "retry" | "rebuild";
  retryFrom?: StageId;
  rebuildFrom?: "architecture";
};

const stageOrder: StageId[] = [
  "product",
  "architecture",
  "engineering",
  "validation",
];

const examples = [
  {
    label: "项目报价计算器",
    prompt:
      "为自由职业设计师创建一个项目报价计算器。用户可以选择服务、填写预计工时和时薪、设置加急程度和附加服务，然后看到分项报价、总价、交付时间，并复制一段客户报价摘要。",
  },
  {
    label: "活动容量看板",
    prompt:
      "Build an event registration and capacity board for a 30-person workshop. Let the organizer add attendees, move overflow registrations to a waitlist, filter by status, and see remaining seats.",
  },
  {
    label: "SaaS ROI 计算器",
    prompt:
      "创建一个小型 SaaS 的定价和 ROI 计算器，根据团队人数、人工成本、每周节省时间推荐套餐，并计算月度节省金额和回本周期。",
  },
];

const initialStages = (): Record<StageId, StageState> => ({
  product: "queued",
  architecture: "queued",
  engineering: "queued",
  validation: "queued",
});

export function BuilderWorkspace() {
  const auth = useAuth();
  const [prompt, setPrompt] = useState(examples[0].prompt);
  const [mode, setMode] = useState<"quick" | "guided">("quick");
  const [guidedAudience, setGuidedAudience] = useState("");
  const [guidedPrimaryAction, setGuidedPrimaryAction] = useState("");
  const [guidedConstraints, setGuidedConstraints] = useState("");
  const [runState, setRunState] = useState<RunState>("idle");
  const [stages, setStages] = useState(initialStages);
  const [currentProgress, setCurrentProgress] = useState("");
  const [providerLabel, setProviderLabel] = useState("尚未运行");
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [product, setProduct] = useState<ProductAgentOutput | null>(null);
  const [technicalPlan, setTechnicalPlan] = useState<TechnicalPlan | null>(
    null,
  );
  const [generatedApp, setGeneratedApp] = useState<GeneratedApp | null>(null);
  const [acceptedHtml, setAcceptedHtml] = useState("");
  const [checks, setChecks] = useState<ValidationCheck[]>([]);
  const [activeTab, setActiveTab] = useState<InspectorTab>("preview");
  const [channelToken, setChannelToken] = useState("");
  const [previewReady, setPreviewReady] = useState(false);
  const [previewInteraction, setPreviewInteraction] = useState(false);
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState("");
  const [cloudError, setCloudError] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [editingBrief, setEditingBrief] = useState(false);
  const [rebuildPending, setRebuildPending] = useState(false);
  const [lastFailedStage, setLastFailedStage] = useState<StageId | null>(null);
  const [lastFailureRetryable, setLastFailureRetryable] = useState(false);
  const [versions, setVersions] = useState<ProjectVersion[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [briefRevision, setBriefRevision] = useState(0);
  const [projectId, setProjectId] = useState("");
  const [storageScope, setStorageScope] = useState("guest");
  const [cloudStatus, setCloudStatus] = useState<
    "local" | "syncing" | "synced" | "error"
  >("local");
  const [cloudRetryNonce, setCloudRetryNonce] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef<string>("");
  const productRef = useRef<ProductAgentOutput | null>(null);
  const technicalPlanRef = useRef<TechnicalPlan | null>(null);
  const generatedAppRef = useRef<GeneratedApp | null>(null);
  const providerLabelRef = useRef("尚未运行");
  const runPromptRef = useRef(prompt);
  const nextVersionRevisionRef = useRef(1);
  const pendingVersionRef = useRef<ProjectVersion | null>(null);
  const previousActiveVersionRef = useRef<ProjectVersion | null>(null);
  const currentSnapshotRef = useRef<ProjectSnapshot | null>(null);
  const activeAuthScopeRef = useRef("guest");
  const cloudReadyUserRef = useRef<string | null>(null);
  const cloudSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applySnapshot = useCallback((snapshot: ProjectSnapshot) => {
    const interrupted = isInterruptedState(snapshot.runState);
    const restoredStages = interrupted
      ? markInterruptedStage(snapshot.stages)
      : snapshot.stages;
    const activeVersion =
      snapshot.versions.find(
        (version) => version.id === snapshot.activeVersionId,
      ) ?? snapshot.versions.at(-1);

    setProjectId(snapshot.projectId);
    setPrompt(snapshot.prompt || examples[0].prompt);
    setMode(snapshot.mode);
    setRunState(interrupted ? "failed" : snapshot.runState);
    setStages(restoredStages);
    setProviderLabel(snapshot.providerLabel);
    setProduct(snapshot.product);
    setTechnicalPlan(snapshot.technicalPlan);
    setGeneratedApp(snapshot.generatedApp);
    setVersions(snapshot.versions);
    setActiveVersionId(activeVersion?.id ?? null);
    setBriefRevision(snapshot.briefRevision);
    setError(
      interrupted
        ? "上一次生成在页面刷新时中断；已保留有效产物和最近成功预览。"
        : snapshot.lastError,
    );
    setAcceptedHtml(activeVersion?.acceptedHtml ?? "");
    setChecks(activeVersion?.checks ?? []);
    setChannelToken(
      activeVersion ? crypto.randomUUID().replaceAll("-", "") : "",
    );
    setPreviewReady(false);
    setPreviewInteraction(false);
    setEvents([]);
    setCurrentProgress("");
    setEditingBrief(false);
    setRebuildPending(false);

    productRef.current = snapshot.product;
    technicalPlanRef.current = snapshot.technicalPlan;
    generatedAppRef.current = snapshot.generatedApp;
    providerLabelRef.current = snapshot.providerLabel;
    nextVersionRevisionRef.current =
      Math.max(0, ...snapshot.versions.map((version) => version.revision)) + 1;
    previousActiveVersionRef.current = activeVersion ?? null;
    pendingVersionRef.current = null;
    currentSnapshotRef.current = snapshot;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const sessionStorageKey = "buildtrace-client-session-id";
    const existing = window.sessionStorage.getItem(sessionStorageKey);
    const sessionId = existing ?? crypto.randomUUID();
    window.sessionStorage.setItem(sessionStorageKey, sessionId);
    sessionIdRef.current = sessionId;

    const restored = loadProject(window.localStorage, "guest");
    queueMicrotask(() => {
      if (cancelled) return;
      if (restored.error) setStorageError(restored.error);
      applySnapshot(restored.snapshot ?? createEmptyProjectSnapshot());
      setHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, [applySnapshot]);

  useEffect(() => {
    if (!hydrated || auth.status === "loading") return;
    let cancelled = false;

    if (auth.status === "signed_in" && auth.user && auth.client) {
      const userId = auth.user.id;
      const client = auth.client;
      if (
        activeAuthScopeRef.current === userId &&
        cloudReadyUserRef.current === userId
      )
        return;

      setCloudStatus("syncing");
      setCloudError("");
      void (async () => {
        const local = loadProject(window.localStorage, userId);
        const guestCandidate = currentSnapshotRef.current;
        setStorageError(local.error ?? "");
        try {
          const cloud = await loadLatestCloudProject(client, userId);
          if (cancelled) return;

          const snapshot =
            selectAccountSnapshot({
              local: local.snapshot,
              cloud,
              guest: guestCandidate,
            }) ?? createEmptyProjectSnapshot();

          setStorageScope(userId);
          activeAuthScopeRef.current = userId;
          applySnapshot(snapshot);
          const cached = saveProject(window.localStorage, snapshot, userId);
          setStorageError(
            !cached.ok
              ? "本地空间不足，云端项目已加载但无法建立离线缓存。"
              : cached.compacted
                ? "本地空间接近上限，离线缓存仅保留当前成功版本。"
                : "",
          );
          cloudReadyUserRef.current = userId;

          if (!cloud || snapshot.savedAt !== cloud.savedAt) {
            await saveCloudProject(client, userId, snapshot);
          }
          if (!cancelled) {
            setCloudStatus("synced");
            setCloudError("");
          }
        } catch (reason) {
          if (cancelled) return;
          cloudReadyUserRef.current = null;
          if (local.snapshot) {
            setStorageScope(userId);
            activeAuthScopeRef.current = userId;
            applySnapshot(local.snapshot);
          } else {
            setStorageScope("guest");
            activeAuthScopeRef.current = "guest";
          }
          setCloudStatus("error");
          setCloudError(
            reason instanceof Error
              ? `${reason.message}；当前修改仍保存在本机。`
              : "云端同步失败；当前修改仍保存在本机。",
          );
        }
      })();
    } else if (activeAuthScopeRef.current !== "guest") {
      cloudReadyUserRef.current = null;
      activeAuthScopeRef.current = "guest";
      setStorageScope("guest");
      setCloudStatus("local");
      setCloudError("");
      const guest = loadProject(window.localStorage, "guest");
      applySnapshot(guest.snapshot ?? createEmptyProjectSnapshot());
      setStorageError(guest.error ?? "");
    }

    return () => {
      cancelled = true;
    };
  }, [
    applySnapshot,
    auth.client,
    auth.status,
    auth.user,
    cloudRetryNonce,
    hydrated,
  ]);

  useEffect(() => {
    const retryWhenOnline = () => setCloudRetryNonce((value) => value + 1);
    window.addEventListener("online", retryWhenOnline);
    return () => window.removeEventListener("online", retryWhenOnline);
  }, []);

  useEffect(() => {
    if (!hydrated || !projectId || storageError) return;
    const snapshot: ProjectSnapshot = {
      schemaVersion: 2,
      projectId,
      savedAt: new Date().toISOString(),
      prompt,
      mode,
      runState,
      stages,
      providerLabel,
      product,
      technicalPlan,
      generatedApp,
      activeVersionId,
      versions,
      lastError: error,
      briefRevision,
    };
    currentSnapshotRef.current = snapshot;
    const result = saveProject(window.localStorage, snapshot, storageScope);
    if (!result.ok) {
      queueMicrotask(() =>
        setStorageError("本地空间不足，当前进度无法继续保存。"),
      );
    } else if (result.compacted) {
      queueMicrotask(() =>
        setStorageError("本地空间接近上限，仅保留了当前成功版本。"),
      );
    }

    if (
      auth.status === "signed_in" &&
      auth.user &&
      auth.client &&
      cloudReadyUserRef.current === auth.user.id
    ) {
      if (cloudSaveTimerRef.current) clearTimeout(cloudSaveTimerRef.current);
      setCloudStatus("syncing");
      const client = auth.client;
      const userId = auth.user.id;
      cloudSaveTimerRef.current = setTimeout(() => {
        void saveCloudProject(client, userId, snapshot)
          .then(() => {
            setCloudStatus("synced");
            setCloudError("");
          })
          .catch((reason: unknown) => {
            cloudReadyUserRef.current = null;
            setCloudStatus("error");
            setCloudError(
              reason instanceof Error
                ? `${reason.message}；本地缓存仍然可用。`
                : "云端同步失败；本地缓存仍然可用。",
            );
          });
      }, 800);
    }

    return () => {
      if (cloudSaveTimerRef.current) {
        clearTimeout(cloudSaveTimerRef.current);
        cloudSaveTimerRef.current = null;
      }
    };
  }, [
    activeVersionId,
    auth.client,
    auth.status,
    auth.user,
    briefRevision,
    error,
    generatedApp,
    hydrated,
    mode,
    product,
    projectId,
    prompt,
    providerLabel,
    runState,
    stages,
    storageError,
    storageScope,
    technicalPlan,
    versions,
  ]);

  const previewHtml = useMemo(
    () =>
      acceptedHtml && channelToken
        ? acceptedHtml.replaceAll(CHANNEL_TOKEN_PLACEHOLDER, channelToken)
        : "",
    [acceptedHtml, channelToken],
  );

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (!event.data || typeof event.data !== "object") return;
      const data = event.data as Record<string, unknown>;
      if (data.source !== "buildtrace-preview" || data.token !== channelToken)
        return;

      if (data.type === "ready") {
        const pendingVersion = pendingVersionRef.current;
        if (pendingVersion) {
          setVersions((current) =>
            [...current, pendingVersion].slice(-MAX_STORED_VERSIONS),
          );
          setActiveVersionId(pendingVersion.id);
          previousActiveVersionRef.current = pendingVersion;
          pendingVersionRef.current = null;
        }
        setPreviewReady(true);
        setRunState("ready");
        setCurrentProgress("");
        setStages((current) => ({ ...current, validation: "ready" }));
      }
      if (data.type === "interaction") setPreviewInteraction(true);
      if (data.type === "error") {
        const payload = data.payload as { message?: unknown } | undefined;
        const message = `预览运行错误：${String(payload?.message ?? "未知错误")}`;
        setError(message);
        setRunState("failed");
        setStages((current) => ({ ...current, validation: "failed" }));
        setChecks((current) => [
          ...current.filter((check) => check.id !== "preview-runtime"),
          {
            id: "preview-runtime",
            label: "预览运行时",
            status: "failure",
            detail: message,
          },
        ]);

        const previousVersion = previousActiveVersionRef.current;
        if (pendingVersionRef.current && previousVersion) {
          setAcceptedHtml(previousVersion.acceptedHtml);
          setChecks(previousVersion.checks);
          setActiveVersionId(previousVersion.id);
          setChannelToken(crypto.randomUUID().replaceAll("-", ""));
        }
        pendingVersionRef.current = null;
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [channelToken]);

  const handleEvent = useCallback((event: RunEvent) => {
    setEvents((current) => [...current, event]);

    if (event.type === "run.accepted") {
      setProviderLabel(event.payload.providerLabel);
      providerLabelRef.current = event.payload.providerLabel;
      setLastFailedStage(null);
      setLastFailureRetryable(false);
    }
    if (event.type === "stage.started") {
      setStages((current) => ({ ...current, [event.stage]: "running" }));
    }
    if (event.type === "stage.progress") {
      setCurrentProgress(event.payload.message);
    }
    if (event.type === "artifact.completed") {
      if (event.payload.kind === "product") {
        productRef.current = event.payload.artifact;
        setProduct(event.payload.artifact);
        setBriefRevision((current) => Math.max(1, current));
      }
      if (event.payload.kind === "technical-plan") {
        technicalPlanRef.current = event.payload.artifact;
        setTechnicalPlan(event.payload.artifact);
      }
      if (event.payload.kind === "generated-app") {
        generatedAppRef.current = event.payload.artifact;
        setGeneratedApp(event.payload.artifact);
      }
    }
    if (event.type === "stage.completed") {
      setStages((current) => ({ ...current, [event.stage]: "completed" }));
    }
    if (event.type === "validation.completed") {
      setChecks(event.payload.checks);
      setAcceptedHtml(event.payload.acceptedHtml);
      setChannelToken(crypto.randomUUID().replaceAll("-", ""));
      setPreviewReady(false);
      setActiveTab("preview");
      setRebuildPending(false);

      const productArtifact = productRef.current;
      const technicalArtifact = technicalPlanRef.current;
      const appArtifact = generatedAppRef.current;
      if (productArtifact && technicalArtifact && appArtifact) {
        const version = createProjectVersion({
          revision: nextVersionRevisionRef.current++,
          prompt: runPromptRef.current,
          providerLabel: providerLabelRef.current,
          product: productArtifact,
          technicalPlan: technicalArtifact,
          generatedApp: appArtifact,
          acceptedHtml: event.payload.acceptedHtml,
          checks: event.payload.checks,
        });
        pendingVersionRef.current = version;
      }
    }
    if (event.type === "stage.failed") {
      setStages((current) => ({ ...current, [event.stage]: "failed" }));
      setError(`${event.payload.code}：${event.payload.message}`);
      setRunState("failed");
      setCurrentProgress("");
      setLastFailedStage(event.stage);
      setLastFailureRetryable(event.payload.retryable);
    }
    if (event.type === "run.awaiting_user") {
      setRunState("awaiting_user");
      setCurrentProgress("Product Brief 已生成，请检查或编辑后开始构建。");
      setEditingBrief(true);
    }
    if (event.type === "run.completed") {
      setRunState("previewing");
      setCurrentProgress("服务端验证通过，正在等待预览运行时握手…");
    }
    if (event.type === "run.cancelled") {
      setRunState("cancelled");
      setCurrentProgress("");
      setStages(
        (current) =>
          Object.fromEntries(
            Object.entries(current).map(([stage, state]) => [
              stage,
              state === "running" ? "cancelled" : state,
            ]),
          ) as Record<StageId, StageState>,
      );
    }
  }, []);

  const startRun = async (options: StartRunOptions = {}) => {
    const normalizedPrompt = prompt.trim();
    if (normalizedPrompt.length < 10) {
      setError("请至少用 10 个字符描述你想创建的产品。");
      return;
    }
    if (auth.status !== "unavailable" && auth.status !== "signed_in") {
      setError("请先登录后再使用实时生成；预置成功项目仍可直接体验。");
      return;
    }

    const action = options.action ?? "initial";
    const isInitial = action === "initial";
    const resumeFrom = options.retryFrom ?? options.rebuildFrom;
    const artifacts: ArtifactSnapshot | undefined = isInitial
      ? undefined
      : {
          product: productRef.current ?? undefined,
          technicalPlan: technicalPlanRef.current ?? undefined,
          generatedApp: generatedAppRef.current ?? undefined,
        };

    const controller = new AbortController();
    abortRef.current = controller;
    runPromptRef.current = normalizedPrompt;
    previousActiveVersionRef.current =
      versions.find((version) => version.id === activeVersionId) ??
      versions.at(-1) ??
      null;
    pendingVersionRef.current = null;
    setRunState(
      action === "rebuild"
        ? "rebuilding"
        : action === "retry"
          ? "retrying"
          : "running",
    );
    setStages((current) =>
      isInitial
        ? initialStages()
        : prepareStagesForResume(current, resumeFrom ?? "product"),
    );
    setEvents([]);
    if (isInitial) {
      setProduct(null);
      setTechnicalPlan(null);
      setGeneratedApp(null);
      setAcceptedHtml("");
      setChecks([]);
      setChannelToken("");
      setPreviewReady(false);
      setPreviewInteraction(false);
      setActiveVersionId(null);
      setVersions([]);
      setBriefRevision(0);
      setRebuildPending(false);
      productRef.current = null;
      technicalPlanRef.current = null;
      generatedAppRef.current = null;
      nextVersionRevisionRef.current = 1;
    }
    setCurrentProgress("正在建立安全的生成会话…");
    setError("");
    setStorageError("");
    setCloudError("");
    setEditingBrief(false);
    setLastFailedStage(null);
    setLastFailureRetryable(false);

    try {
      const headers = new Headers({ "Content-Type": "application/json" });
      if (auth.accessToken) {
        headers.set("Authorization", `Bearer ${auth.accessToken}`);
      }
      const response = await fetch("/api/runs", {
        method: "POST",
        headers,
        body: JSON.stringify({
          protocolVersion: 1,
          runId: crypto.randomUUID(),
          clientSessionId: sessionIdRef.current || crypto.randomUUID(),
          idempotencyKey: crypto.randomUUID(),
          mode,
          action,
          prompt: normalizedPrompt,
          context: isInitial && mode === "guided" ? guidedContext() : undefined,
          retryFrom: options.retryFrom,
          rebuildFrom: options.rebuildFrom,
          artifacts,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `请求失败（${response.status}）`);
      }
      if (!response.body) throw new Error("浏览器未收到事件流。");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let receivedTerminalEvent = false;

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const parsed = RunEventSchema.safeParse(JSON.parse(line));
          if (!parsed.success)
            throw new Error("收到无法识别的事件，已停止更新界面。");
          if (
            parsed.data.type === "run.completed" ||
            parsed.data.type === "run.cancelled" ||
            parsed.data.type === "run.awaiting_user" ||
            parsed.data.type === "stage.failed"
          ) {
            receivedTerminalEvent = true;
          }
          handleEvent(parsed.data);
        }
        if (done) break;
      }
      if (!receivedTerminalEvent) {
        throw new Error("事件流提前中断；已保留收到的有效产物。");
      }
    } catch (reason) {
      if (controller.signal.aborted) {
        setRunState("cancelled");
        setCurrentProgress("");
      } else {
        setRunState("failed");
        setError(
          reason instanceof Error ? reason.message : "生成失败，请稍后重试。",
        );
        setCurrentProgress("");
      }
    } finally {
      abortRef.current = null;
    }
  };

  const guidedContext = (): GuidedContext => ({
    audience: guidedAudience.trim() || undefined,
    primaryAction: guidedPrimaryAction.trim() || undefined,
    constraints: guidedConstraints
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 8),
  });

  const cancelRun = () => abortRef.current?.abort();
  const isRunning = [
    "running",
    "previewing",
    "rebuilding",
    "retrying",
  ].includes(runState);

  const saveBriefRevision = (nextProduct: ProductAgentOutput) => {
    productRef.current = nextProduct;
    setProduct(nextProduct);
    setBriefRevision((current) => current + 1);
    setStages((current) => ({
      ...current,
      product: "completed",
      architecture: "stale",
      engineering: "stale",
      validation: "stale",
    }));
    setEditingBrief(false);
    setRebuildPending(true);
    setError("");
  };

  const restoreVersion = (version: ProjectVersion) => {
    productRef.current = version.product;
    technicalPlanRef.current = version.technicalPlan;
    generatedAppRef.current = version.generatedApp;
    providerLabelRef.current = version.providerLabel;
    previousActiveVersionRef.current = version;
    pendingVersionRef.current = null;
    setPrompt(version.prompt);
    setProviderLabel(version.providerLabel);
    setProduct(version.product);
    setTechnicalPlan(version.technicalPlan);
    setGeneratedApp(version.generatedApp);
    setAcceptedHtml(version.acceptedHtml);
    setChecks(version.checks);
    setActiveVersionId(version.id);
    setBriefRevision(version.revision);
    setStages({
      product: "completed",
      architecture: "completed",
      engineering: "completed",
      validation: "ready",
    });
    setChannelToken(crypto.randomUUID().replaceAll("-", ""));
    setPreviewReady(false);
    setPreviewInteraction(false);
    setRunState("previewing");
    setEditingBrief(false);
    setRebuildPending(false);
    setError("");
  };

  const resetLocalProject = () => {
    clearProject(window.localStorage, storageScope);
    setStorageError("");
    const current = currentSnapshotRef.current;
    if (storageScope !== "guest" && current) {
      const result = saveProject(window.localStorage, current, storageScope);
      if (!result.ok) {
        setStorageError("本地空间不足，无法重建缓存。");
      }
      return;
    }
    applySnapshot(createEmptyProjectSnapshot());
  };

  const downloadHtml = () => {
    if (!acceptedHtml) return;
    const blob = new Blob([acceptedHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `buildtrace-v${versions.find((version) => version.id === activeVersionId)?.revision ?? 1}.html`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const loadPresetProject = async () => {
    previousActiveVersionRef.current =
      versions.find((version) => version.id === activeVersionId) ??
      versions.at(-1) ??
      null;
    pendingVersionRef.current = null;
    setRunState("running");
    setCurrentProgress("正在加载不调用模型的预置成功项目…");
    setError("");
    try {
      const response = await fetch("/api/preset");
      if (!response.ok) throw new Error("预置项目暂时不可用。");
      const preset = PresetProjectSchema.parse(await response.json());
      const version = createProjectVersion({
        revision: nextVersionRevisionRef.current++,
        prompt: preset.prompt,
        providerLabel: preset.providerLabel,
        product: preset.product,
        technicalPlan: preset.technicalPlan,
        generatedApp: preset.generatedApp,
        acceptedHtml: preset.acceptedHtml,
        checks: preset.checks,
      });

      productRef.current = preset.product;
      technicalPlanRef.current = preset.technicalPlan;
      generatedAppRef.current = preset.generatedApp;
      providerLabelRef.current = preset.providerLabel;
      setPrompt(preset.prompt);
      setProviderLabel(preset.providerLabel);
      setProduct(preset.product);
      setTechnicalPlan(preset.technicalPlan);
      setGeneratedApp(preset.generatedApp);
      setAcceptedHtml(preset.acceptedHtml);
      setChecks(preset.checks);
      setStages({
        product: "completed",
        architecture: "completed",
        engineering: "completed",
        validation: "ready",
      });
      setEvents([]);
      pendingVersionRef.current = version;
      setBriefRevision(version.revision);
      setChannelToken(crypto.randomUUID().replaceAll("-", ""));
      setPreviewReady(false);
      setPreviewInteraction(false);
      setRebuildPending(false);
      setEditingBrief(false);
      setRunState("previewing");
      setCurrentProgress("预置项目已通过服务端确定性验证，正在启动预览…");
    } catch (reason) {
      setRunState("failed");
      setCurrentProgress("");
      setError(
        reason instanceof Error ? reason.message : "预置项目暂时不可用。",
      );
    }
  };

  return (
    <main className="app-shell" data-hydrated={hydrated}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          BuildTrace
        </div>
        <div className="topbar-meta">
          <span>idea → product</span>
          <span className="demo-chip">透明生成 Demo</span>
          {auth.status === "signed_in" ? (
            <span className={`cloud-chip ${cloudStatus}`}>
              {cloudStatusLabel(cloudStatus)}
            </span>
          ) : null}
          <AuthControls />
        </div>
      </header>

      <section className="workspace" aria-label="BuildTrace 产品工作台">
        <aside className="stage-rail">
          <p className="rail-kicker">产品流水线</p>
          <div className="stage-list" aria-label="生成阶段">
            {stageOrder.map((stage, index) => (
              <div className={`stage-item ${stages[stage]}`} key={stage}>
                <span className="stage-dot" aria-hidden="true">
                  {stages[stage] === "completed" || stages[stage] === "ready"
                    ? "✓"
                    : `0${index + 1}`}
                </span>
                <span>
                  <span className="stage-name">{STAGE_META[stage].short}</span>
                  <span className="stage-state">
                    {stateLabel(stages[stage])}
                  </span>
                </span>
              </div>
            ))}
          </div>
          {versions.length ? (
            <div className="version-section" aria-label="最近成功版本">
              <p>最近成功版本</p>
              {[...versions].reverse().map((version) => (
                <button
                  className={`version-button ${activeVersionId === version.id ? "active" : ""}`}
                  key={version.id}
                  onClick={() => restoreVersion(version)}
                  type="button"
                >
                  <span>v{version.revision}</span>
                  <small>{version.product.productBrief.productName}</small>
                </button>
              ))}
            </div>
          ) : null}
          <div className="rail-note">
            <strong>透明，但不打断</strong>
            快速模式会自动推进。每个状态都来自真实事件，不展示隐藏推理。
          </div>
        </aside>

        <section className="workbench">
          <div className="composer">
            <p className="eyebrow">AI 产品团队 · Fast by default</p>
            <h1>
              把想法变成
              <br />
              可以操作的产品。
            </h1>
            <p className="composer-copy">
              描述一个业务想法。专业 Agent
              会完成产品定义、交互规划、构建和验证，你可以随时查看产物。
            </p>
            <div className="mode-row" aria-label="生成模式">
              <button
                className={`mode-button ${mode === "quick" ? "active" : ""}`}
                disabled={isRunning || !hydrated}
                onClick={() => setMode("quick")}
                type="button"
              >
                快速模式
              </button>
              <button
                className={`mode-button ${mode === "guided" ? "active" : ""}`}
                disabled={isRunning || !hydrated}
                onClick={() => setMode("guided")}
                type="button"
              >
                引导模式
              </button>
            </div>
            {mode === "guided" ? (
              <div className="guided-context">
                <label>
                  目标用户（可选）
                  <input
                    maxLength={300}
                    onChange={(event) => setGuidedAudience(event.target.value)}
                    placeholder="例如：首次接商业项目的独立设计师"
                    value={guidedAudience}
                  />
                </label>
                <label>
                  核心操作（可选）
                  <input
                    maxLength={300}
                    onChange={(event) =>
                      setGuidedPrimaryAction(event.target.value)
                    }
                    placeholder="例如：生成并复制透明报价"
                    value={guidedPrimaryAction}
                  />
                </label>
                <label>
                  约束（可选，每行一项）
                  <textarea
                    maxLength={1_600}
                    onChange={(event) =>
                      setGuidedConstraints(event.target.value)
                    }
                    placeholder="不依赖外部服务\n移动端可用"
                    value={guidedConstraints}
                  />
                </label>
              </div>
            ) : null}
            <div className="prompt-box">
              <textarea
                aria-label="产品想法"
                maxLength={2000}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="例如：为自由职业者创建一个透明的项目报价计算器…"
                value={prompt}
              />
              <div className="prompt-actions">
                <span className="prompt-count">{prompt.length} / 2000</span>
                {isRunning ? (
                  <button
                    className="cancel-button"
                    onClick={cancelRun}
                    type="button"
                  >
                    取消
                  </button>
                ) : (
                  <button
                    className="build-button"
                    disabled={!hydrated || prompt.trim().length < 10}
                    onClick={() => void startRun()}
                    type="button"
                  >
                    {auth.status !== "unavailable" &&
                    auth.status !== "signed_in"
                      ? "登录后生成 ↗"
                      : mode === "guided"
                        ? "生成 Product Brief ↗"
                        : "开始生成 ↗"}
                  </button>
                )}
              </div>
            </div>
            <div className="examples" aria-label="示例想法">
              {examples.map((example) => (
                <button
                  className="example-button"
                  key={example.label}
                  onClick={() => setPrompt(example.prompt)}
                  type="button"
                >
                  {example.label}
                </button>
              ))}
              <button
                className="example-button preset-button"
                disabled={isRunning}
                onClick={() => void loadPresetProject()}
                type="button"
              >
                查看预置成功项目 · 零模型调用
              </button>
            </div>
          </div>

          <div className="activity" aria-live="polite">
            <div className="section-heading">
              <h2>Agent 产物</h2>
              <span className="provider-label">{providerLabel}</span>
            </div>

            {storageError && (
              <div className="storage-banner" role="alert">
                <span>{storageError}</span>
                <button onClick={resetLocalProject} type="button">
                  {storageScope === "guest" ? "重置本地数据" : "重建本地缓存"}
                </button>
              </div>
            )}
            {cloudError && (
              <div className="storage-banner cloud-warning" role="status">
                <span>{cloudError}</span>
                <button
                  onClick={() => setCloudRetryNonce((value) => value + 1)}
                  type="button"
                >
                  立即重试
                </button>
              </div>
            )}
            {error && (
              <div className="error-banner" role="alert">
                <span>{error}</span>
                {lastFailedStage && lastFailureRetryable ? (
                  <button
                    onClick={() =>
                      void startRun({
                        action: "retry",
                        retryFrom: lastFailedStage,
                      })
                    }
                    type="button"
                  >
                    只重试{STAGE_META[lastFailedStage].short}阶段
                  </button>
                ) : null}
              </div>
            )}
            {currentProgress && (
              <div className="live-progress">{currentProgress}</div>
            )}
            {!product && !technicalPlan && !generatedApp && !isRunning ? (
              <div className="empty-activity">
                选择一个示例开始，阶段产物会在这里按真实完成顺序出现。
              </div>
            ) : null}

            {product && (
              <details className="activity-card" open>
                <summary>
                  <span className="artifact-title">
                    <span className="artifact-icon">P</span>Product Brief
                  </span>
                  <span className="artifact-status">
                    已完成 · 修订 {briefRevision || 1}
                  </span>
                </summary>
                {editingBrief ? (
                  <ProductBriefEditor
                    key={`${product.productBrief.productName}-${briefRevision}`}
                    onCancel={() => setEditingBrief(false)}
                    onSave={saveBriefRevision}
                    product={product}
                  />
                ) : (
                  <div className="artifact-body">
                    <strong>{product.productBrief.productName}</strong>
                    <p>{product.productBrief.valueProposition}</p>
                    <p>
                      <strong>核心用户：</strong>
                      {product.productBrief.primaryUser}
                    </p>
                    <p>
                      <strong>核心操作：</strong>
                      {product.productBrief.primaryAction}
                    </p>
                    <ul>
                      {product.productBrief.functionalRequirements.map(
                        (item) => (
                          <li key={item}>{item}</li>
                        ),
                      )}
                    </ul>
                    {!isRunning ? (
                      <button
                        className="text-button"
                        onClick={() => setEditingBrief(true)}
                        type="button"
                      >
                        编辑结构化 Brief
                      </button>
                    ) : null}
                  </div>
                )}
              </details>
            )}

            {product &&
            !editingBrief &&
            (runState === "awaiting_user" || rebuildPending) ? (
              <div className="rebuild-banner">
                <div>
                  <strong>
                    {runState === "awaiting_user"
                      ? "Brief 等待确认"
                      : "下游产物已标记为过期"}
                  </strong>
                  <p>
                    将重新执行 Architecture → Engineering →
                    Validation；新版本成功前保留当前预览。
                  </p>
                </div>
                <button
                  className="build-button"
                  onClick={() =>
                    void startRun({
                      action: "rebuild",
                      rebuildFrom: "architecture",
                    })
                  }
                  type="button"
                >
                  {runState === "awaiting_user"
                    ? "确认并开始构建"
                    : "重建受影响阶段"}
                </button>
              </div>
            ) : null}

            {technicalPlan && (
              <details className="activity-card">
                <summary>
                  <span className="artifact-title">
                    <span className="artifact-icon">A</span>Technical Plan
                  </span>
                  <span className="artifact-status">已完成 · 可检查</span>
                </summary>
                <div className="artifact-body">
                  <p>{technicalPlan.interactionModel}</p>
                  <ul>
                    {technicalPlan.components.map((item) => (
                      <li key={item.name}>
                        <strong>{item.name}</strong>：{item.responsibility}
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            )}

            {generatedApp && (
              <details className="activity-card">
                <summary>
                  <span className="artifact-title">
                    <span className="artifact-icon">E</span>Generated App
                  </span>
                  <span className="artifact-status">
                    {checks.length ? "已通过确定性验证" : "已生成 · 等待验证"}
                  </span>
                </summary>
                <div className="artifact-body">
                  <strong>{generatedApp.title}</strong>
                  <p>{generatedApp.summary}</p>
                </div>
              </details>
            )}
          </div>
        </section>

        <section className="inspector">
          <header className="inspector-header">
            <div className="tabs" role="tablist" aria-label="结果检查器">
              {(
                ["preview", "code", "logs", "validation"] as InspectorTab[]
              ).map((tab) => (
                <button
                  aria-selected={activeTab === tab}
                  className={`tab-button ${activeTab === tab ? "active" : ""}`}
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  role="tab"
                  type="button"
                >
                  {tabLabel(tab)}
                </button>
              ))}
            </div>
            <div className="inspector-actions">
              {acceptedHtml ? (
                <button
                  className="download-button"
                  onClick={downloadHtml}
                  type="button"
                >
                  下载 HTML
                </button>
              ) : null}
              <div className={`runtime-status ${previewReady ? "ready" : ""}`}>
                <i />
                {previewReady
                  ? previewInteraction
                    ? "已就绪 · 交互已验证"
                    : "预览已就绪"
                  : runStateLabel(runState)}
              </div>
            </div>
          </header>

          <div className="inspector-body">
            {activeTab === "preview" && (
              <div className="preview-frame-wrap">
                {previewHtml ? (
                  <iframe
                    className="preview-frame"
                    key={channelToken}
                    ref={iframeRef}
                    sandbox="allow-scripts"
                    srcDoc={previewHtml}
                    title="生成产品预览"
                  />
                ) : (
                  <div className="preview-empty">
                    <div>
                      <div className="preview-empty-mark">↗</div>
                      <h2>等待第一个可运行版本</h2>
                      <p>
                        生成完成后，经过结构检查的自包含应用会在受限沙箱中显示。
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
            {activeTab === "code" && (
              <pre className="panel-surface code-view">
                {acceptedHtml || "// 生成并通过验证后，代码将在这里显示。"}
              </pre>
            )}
            {activeTab === "logs" && (
              <div className="panel-surface">
                <div className="log-list">
                  {events.length ? (
                    events.map((event) => (
                      <div
                        className="log-item"
                        key={`${event.runId}-${event.sequence}`}
                      >
                        <strong>
                          #{event.sequence} · {event.type}
                        </strong>
                        <p>
                          {event.stage
                            ? `${STAGE_META[event.stage].agent} · `
                            : ""}
                          {event.timestamp}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="log-item">
                      <strong>尚无事件</strong>
                      <p>
                        启动生成后，这里会按顺序显示经过 Schema 校验的事件。
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
            {activeTab === "validation" && (
              <div className="panel-surface">
                <div className="validation-list">
                  {checks.length ? (
                    checks.map((check) => (
                      <div className="validation-item" key={check.id}>
                        <span className={`check-dot ${check.status}`} />
                        <div>
                          <strong>{check.label}</strong>
                          <p>{check.detail}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="validation-item">
                      <span className="check-dot warning" />
                      <div>
                        <strong>尚未验证</strong>
                        <p>
                          验证器将在构建完成后检查结构、安全策略与交互目标。
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

function stateLabel(state: StageState) {
  return {
    queued: "等待中",
    running: "正在执行",
    completed: "产物已生成",
    failed: "执行失败",
    stale: "等待重建",
    cancelled: "已取消",
    ready: "预览已验证",
  }[state];
}

function tabLabel(tab: InspectorTab) {
  return { preview: "预览", code: "代码", logs: "日志", validation: "验证" }[
    tab
  ];
}

function runStateLabel(state: RunState) {
  return {
    idle: "等待生成",
    running: "Pipeline 运行中",
    awaiting_user: "等待确认 Brief",
    previewing: "预览启动中",
    ready: "预览已就绪",
    failed: "生成失败",
    cancelled: "已取消",
    rebuilding: "重建下游中",
    retrying: "重试失败阶段中",
  }[state];
}

function prepareStagesForResume(
  current: Record<StageId, StageState>,
  resumeFrom: StageId,
) {
  const index = stageOrder.indexOf(resumeFrom);
  return Object.fromEntries(
    stageOrder.map((stage, stageIndex) => [
      stage,
      stageIndex < index ? current[stage] : "queued",
    ]),
  ) as Record<StageId, StageState>;
}

function isInterruptedState(state: RunState) {
  return ["running", "previewing", "rebuilding", "retrying"].includes(state);
}

function markInterruptedStage(stages: Record<StageId, StageState>) {
  return Object.fromEntries(
    Object.entries(stages).map(([stage, state]) => [
      stage,
      state === "running" ? "failed" : state,
    ]),
  ) as Record<StageId, StageState>;
}

function createEmptyProjectSnapshot(): ProjectSnapshot {
  return {
    schemaVersion: 2,
    projectId: crypto.randomUUID(),
    savedAt: new Date().toISOString(),
    prompt: examples[0].prompt,
    mode: "quick",
    runState: "idle",
    stages: initialStages(),
    providerLabel: "尚未运行",
    product: null,
    technicalPlan: null,
    generatedApp: null,
    activeVersionId: null,
    versions: [],
    lastError: "",
    briefRevision: 0,
  };
}

function cloudStatusLabel(status: "local" | "syncing" | "synced" | "error") {
  return {
    local: "仅本地",
    syncing: "云端同步中",
    synced: "已同步",
    error: "云端待重试",
  }[status];
}
