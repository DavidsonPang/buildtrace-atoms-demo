"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  RunEventSchema,
  STAGE_META,
  type GeneratedApp,
  type ProductAgentOutput,
  type RunEvent,
  type StageId,
  type TechnicalPlan,
  type ValidationCheck,
} from "@/src/lib/contracts";
import { CHANNEL_TOKEN_PLACEHOLDER } from "@/src/lib/html-sandbox";

type StageState = "queued" | "running" | "completed" | "failed" | "ready";
type InspectorTab = "preview" | "code" | "logs" | "validation";
type RunState = "idle" | "running" | "previewing" | "ready" | "failed" | "cancelled";

const stageOrder: StageId[] = ["product", "architecture", "engineering", "validation"];

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
  const [prompt, setPrompt] = useState(examples[0].prompt);
  const [mode, setMode] = useState<"quick" | "guided">("quick");
  const [runState, setRunState] = useState<RunState>("idle");
  const [stages, setStages] = useState(initialStages);
  const [currentProgress, setCurrentProgress] = useState("");
  const [providerLabel, setProviderLabel] = useState("尚未运行");
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [product, setProduct] = useState<ProductAgentOutput | null>(null);
  const [technicalPlan, setTechnicalPlan] = useState<TechnicalPlan | null>(null);
  const [generatedApp, setGeneratedApp] = useState<GeneratedApp | null>(null);
  const [acceptedHtml, setAcceptedHtml] = useState("");
  const [checks, setChecks] = useState<ValidationCheck[]>([]);
  const [activeTab, setActiveTab] = useState<InspectorTab>("preview");
  const [channelToken, setChannelToken] = useState("");
  const [previewReady, setPreviewReady] = useState(false);
  const [previewInteraction, setPreviewInteraction] = useState(false);
  const [error, setError] = useState("");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const abortRef = useRef<AbortController | null>(null);

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
      if (data.source !== "buildtrace-preview" || data.token !== channelToken) return;

      if (data.type === "ready") {
        setPreviewReady(true);
        setRunState("ready");
        setCurrentProgress("");
        setStages((current) => ({ ...current, validation: "ready" }));
      }
      if (data.type === "interaction") setPreviewInteraction(true);
      if (data.type === "error") {
        const payload = data.payload as { message?: unknown } | undefined;
        setError(`预览运行错误：${String(payload?.message ?? "未知错误")}`);
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [channelToken]);

  const handleEvent = useCallback((event: RunEvent) => {
    setEvents((current) => [...current, event]);

    if (event.type === "run.accepted") {
      setProviderLabel(event.payload.providerLabel);
    }
    if (event.type === "stage.started") {
      setStages((current) => ({ ...current, [event.stage]: "running" }));
    }
    if (event.type === "stage.progress") {
      setCurrentProgress(event.payload.message);
    }
    if (event.type === "artifact.completed") {
      if (event.payload.kind === "product") setProduct(event.payload.artifact);
      if (event.payload.kind === "technical-plan") setTechnicalPlan(event.payload.artifact);
      if (event.payload.kind === "generated-app") setGeneratedApp(event.payload.artifact);
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
    }
    if (event.type === "stage.failed") {
      setStages((current) => ({ ...current, [event.stage]: "failed" }));
      setError(`${event.payload.code}：${event.payload.message}`);
      setRunState("failed");
      setCurrentProgress("");
    }
    if (event.type === "run.completed") {
      setRunState("previewing");
      setCurrentProgress("服务端验证通过，正在等待预览运行时握手…");
    }
    if (event.type === "run.cancelled") {
      setRunState("cancelled");
      setCurrentProgress("");
    }
  }, []);

  const startRun = async () => {
    const normalizedPrompt = prompt.trim();
    if (normalizedPrompt.length < 10) {
      setError("请至少用 10 个字符描述你想创建的产品。");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setRunState("running");
    setStages(initialStages());
    setEvents([]);
    setProduct(null);
    setTechnicalPlan(null);
    setGeneratedApp(null);
    setAcceptedHtml("");
    setChecks([]);
    setChannelToken("");
    setPreviewReady(false);
    setPreviewInteraction(false);
    setCurrentProgress("正在建立安全的生成会话…");
    setError("");

    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          protocolVersion: 1,
          runId: crypto.randomUUID(),
          idempotencyKey: crypto.randomUUID(),
          mode,
          action: "initial",
          prompt: normalizedPrompt,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? `请求失败（${response.status}）`);
      }
      if (!response.body) throw new Error("浏览器未收到事件流。");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const parsed = RunEventSchema.safeParse(JSON.parse(line));
          if (!parsed.success) throw new Error("收到无法识别的事件，已停止更新界面。");
          handleEvent(parsed.data);
        }
        if (done) break;
      }
    } catch (reason) {
      if (controller.signal.aborted) {
        setRunState("cancelled");
        setCurrentProgress("");
      } else {
        setRunState("failed");
        setError(reason instanceof Error ? reason.message : "生成失败，请稍后重试。");
        setCurrentProgress("");
      }
    } finally {
      abortRef.current = null;
    }
  };

  const cancelRun = () => abortRef.current?.abort();
  const isRunning = runState === "running" || runState === "previewing";

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          BuildTrace
        </div>
        <div className="topbar-meta">
          <span>idea → product</span>
          <span className="demo-chip">本地垂直切片</span>
        </div>
      </header>

      <section className="workspace" aria-label="BuildTrace 产品工作台">
        <aside className="stage-rail">
          <p className="rail-kicker">产品流水线</p>
          <div className="stage-list" aria-label="生成阶段">
            {stageOrder.map((stage, index) => (
              <div className={`stage-item ${stages[stage]}`} key={stage}>
                <span className="stage-dot" aria-hidden="true">
                  {stages[stage] === "completed" || stages[stage] === "ready" ? "✓" : `0${index + 1}`}
                </span>
                <span>
                  <span className="stage-name">{STAGE_META[stage].short}</span>
                  <span className="stage-state">{stateLabel(stages[stage])}</span>
                </span>
              </div>
            ))}
          </div>
          <div className="rail-note">
            <strong>透明，但不打断</strong>
            快速模式会自动推进。每个状态都来自真实事件，不展示隐藏推理。
          </div>
        </aside>

        <section className="workbench">
          <div className="composer">
            <p className="eyebrow">AI 产品团队 · Fast by default</p>
            <h1>把想法变成<br />可以操作的产品。</h1>
            <p className="composer-copy">
              描述一个业务想法。专业 Agent 会完成产品定义、交互规划、构建和验证，你可以随时查看产物。
            </p>
            <div className="mode-row" aria-label="生成模式">
              <button
                className={`mode-button ${mode === "quick" ? "active" : ""}`}
                onClick={() => setMode("quick")}
                type="button"
              >
                快速模式
              </button>
              <button
                className={`mode-button ${mode === "guided" ? "active" : ""}`}
                disabled
                onClick={() => setMode("guided")}
                type="button"
              >
                引导模式 · 即将开放
              </button>
            </div>
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
                  <button className="cancel-button" onClick={cancelRun} type="button">
                    取消
                  </button>
                ) : (
                  <button
                    className="build-button"
                    disabled={prompt.trim().length < 10}
                    onClick={startRun}
                    type="button"
                  >
                    开始生成 ↗
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
            </div>
          </div>

          <div className="activity" aria-live="polite">
            <div className="section-heading">
              <h2>Agent 产物</h2>
              <span className="provider-label">{providerLabel}</span>
            </div>

            {error && <div className="error-banner" role="alert">{error}</div>}
            {currentProgress && <div className="live-progress">{currentProgress}</div>}
            {!product && !technicalPlan && !generatedApp && !isRunning ? (
              <div className="empty-activity">选择一个示例开始，阶段产物会在这里按真实完成顺序出现。</div>
            ) : null}

            {product && (
              <details className="activity-card" open>
                <summary>
                  <span className="artifact-title"><span className="artifact-icon">P</span>Product Brief</span>
                  <span className="artifact-status">已完成 · 可检查</span>
                </summary>
                <div className="artifact-body">
                  <strong>{product.productBrief.productName}</strong>
                  <p>{product.productBrief.valueProposition}</p>
                  <p><strong>核心用户：</strong>{product.productBrief.primaryUser}</p>
                  <ul>{product.productBrief.functionalRequirements.map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
              </details>
            )}

            {technicalPlan && (
              <details className="activity-card">
                <summary>
                  <span className="artifact-title"><span className="artifact-icon">A</span>Technical Plan</span>
                  <span className="artifact-status">已完成 · 可检查</span>
                </summary>
                <div className="artifact-body">
                  <p>{technicalPlan.interactionModel}</p>
                  <ul>{technicalPlan.components.map((item) => <li key={item.name}><strong>{item.name}</strong>：{item.responsibility}</li>)}</ul>
                </div>
              </details>
            )}

            {generatedApp && (
              <details className="activity-card">
                <summary>
                  <span className="artifact-title"><span className="artifact-icon">E</span>Generated App</span>
                  <span className="artifact-status">{checks.length ? "已通过确定性验证" : "已生成 · 等待验证"}</span>
                </summary>
                <div className="artifact-body"><strong>{generatedApp.title}</strong><p>{generatedApp.summary}</p></div>
              </details>
            )}
          </div>
        </section>

        <section className="inspector">
          <header className="inspector-header">
            <div className="tabs" role="tablist" aria-label="结果检查器">
              {(["preview", "code", "logs", "validation"] as InspectorTab[]).map((tab) => (
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
            <div className={`runtime-status ${previewReady ? "ready" : ""}`}>
              <i />{previewReady ? (previewInteraction ? "已就绪 · 交互已验证" : "预览已就绪") : runStateLabel(runState)}
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
                    <div><div className="preview-empty-mark">↗</div><h2>等待第一个可运行版本</h2><p>生成完成后，经过结构检查的自包含应用会在受限沙箱中显示。</p></div>
                  </div>
                )}
              </div>
            )}
            {activeTab === "code" && (
              <pre className="panel-surface code-view">{acceptedHtml || "// 生成并通过验证后，代码将在这里显示。"}</pre>
            )}
            {activeTab === "logs" && (
              <div className="panel-surface"><div className="log-list">{events.length ? events.map((event) => (
                <div className="log-item" key={`${event.runId}-${event.sequence}`}><strong>#{event.sequence} · {event.type}</strong><p>{event.stage ? `${STAGE_META[event.stage].agent} · ` : ""}{event.timestamp}</p></div>
              )) : <div className="log-item"><strong>尚无事件</strong><p>启动生成后，这里会按顺序显示经过 Schema 校验的事件。</p></div>}</div></div>
            )}
            {activeTab === "validation" && (
              <div className="panel-surface"><div className="validation-list">{checks.length ? checks.map((check) => (
                <div className="validation-item" key={check.id}><span className={`check-dot ${check.status}`} /><div><strong>{check.label}</strong><p>{check.detail}</p></div></div>
              )) : <div className="validation-item"><span className="check-dot warning" /><div><strong>尚未验证</strong><p>验证器将在构建完成后检查结构、安全策略与交互目标。</p></div></div>}</div></div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

function stateLabel(state: StageState) {
  return { queued: "等待中", running: "正在执行", completed: "产物已生成", failed: "执行失败", ready: "预览已验证" }[state];
}

function tabLabel(tab: InspectorTab) {
  return { preview: "预览", code: "代码", logs: "日志", validation: "验证" }[tab];
}

function runStateLabel(state: RunState) {
  return { idle: "等待生成", running: "Pipeline 运行中", previewing: "预览启动中", ready: "预览已就绪", failed: "生成失败", cancelled: "已取消" }[state];
}
