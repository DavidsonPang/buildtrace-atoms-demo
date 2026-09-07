# BuildTrace

BuildTrace 是一个“从想法到可运行产品”的透明 AI Builder：用户输入业务想法后，产品、架构和工程 Agent 会依次生成结构化产物，最终交付一个经过确定性安全检查、可以直接交互的微型网页应用。

[在线体验](https://buildtrace-atoms-demo-xi.vercel.app)

## 三步体验

1. 点击“预置成功项目”可以零成本立即体验完整结果；也可以选择示例或输入至少 10 个字符的产品想法。
2. 注册或登录后点击“开始生成”，观察 Product、Architecture、Engineering、Validation 四个阶段的真实事件与中间产物。
3. 在右侧操作预览；成功后可用自然语言继续修改并生成可回滚的新版本，也可在 Code 标签中切换查看虚拟的 HTML、CSS 和 JavaScript 文件。

在线生成使用 DeepSeek V4 Flash，通常需要约 40–90 秒。公开 Demo 要求登录，并按 IP 限制为每 10 分钟 3 次生成请求，以控制滥用和模型费用；预置成功项目无需登录或模型调用。

## 当前实现

- Next.js 全栈应用，模型密钥仅保存在服务端环境变量中。
- Product → Architecture → Engineering → Validation 四阶段 Pipeline。
- Zod 校验请求、Agent 结构化输出和流式 NDJSON 事件。
- DeepSeek Provider Adapter、分阶段超时、错误归一化和一次受限格式修复。
- 快速模式与引导模式；引导模式会在 Product Brief 后暂停，等待用户确认。
- Product Brief 结构化编辑、下游失效标记和从 Architecture 开始的局部重建。
- 成功版本上的自然语言迭代：合并当前 Product Brief 后完整重跑四阶段，新版本 Ready 前保留旧预览。
- Code 标签把同一份自包含 HTML 只读投影为 `index.html`、`styles.css`、`app.js`；界面明确标注其为虚拟文件视图。
- 失败阶段续跑：保留已成功的上游产物，只重试失败阶段及其下游。
- 自包含 HTML 产物；进入预览前执行大小、结构、危险标签、外部资源和交互目标检查。
- `iframe sandbox="allow-scripts"` 隔离运行，使用带随机 Channel Token 的 `postMessage` 验证就绪、交互和运行时错误。
- 三个一键示例、生成取消、阶段产物、代码、事件日志、验证面板和 HTML 下载。
- Supabase Auth 邮箱注册、登录、会话恢复和退出；服务端生成接口重新校验 Bearer Token。
- Supabase Postgres 保存项目元数据、Agent 产物、首版 HTML 和最近 3 个成功版本；Grants + Owner RLS 隔离用户数据。
- 按用户分区的 LocalStorage 版本化快照：Schema 校验、损坏数据安全降级、断网恢复和重新联网同步。
- Preview 只有在 iframe 报告 Ready 后才提交新版本；新产物运行失败时保留最近一次成功预览。
- 明确标注的预置成功项目，通过静态 API 返回，不调用模型，保证评审者可以零成本进入完整体验。
- 应用侧会话/预算保护，以及 Vercel WAF 的 IP 固定窗口限流。

## 架构

```text
Browser
  ├─ Builder Workspace
  ├─ NDJSON event consumer
  ├─ LocalStorage cache / offline recovery
  ├─ Supabase Auth + Postgres (user JWT / RLS)
  └─ sandboxed iframe preview
          │
          │ Bearer access token
          ▼
POST /api/runs
  ├─ request schema + Supabase getUser
  ├─ user budget guard
  ├─ provider adapter
  ├─ Product Agent
  ├─ Architecture Agent
  ├─ Engineering Agent
  └─ deterministic validator + preview instrumentation
          │
          ▼
DeepSeek Responses API
```

本次原型主动选择“自包含单页应用”和“本地优先云同步”，以在受限时间内同时保证生成稳定性、即时预览、断网恢复和清晰的数据安全边界。生产演进方向包括持久化任务队列、可重连事件流、Supabase Storage Artifact、容器化多文件构建、租户级配额和可观测性。

更完整的决策依据见：

- [产品调研](docs/product-discovery.md)
- [产品需求](docs/product-requirements.md)
- [技术设计](docs/technical-design.md)
- [沙箱 ADR](docs/decisions/0001-sandboxed-self-contained-html.md)
- [身份与持久化 ADR](docs/decisions/0002-supabase-local-first-persistence.md)
- [自然语言迭代与虚拟文件 ADR](docs/decisions/0003-natural-language-revision-and-virtual-files.md)
- [验证报告](docs/validation-report.md)

## 本地运行

要求 Node.js 24。

```bash
npm install
cp .env.example .env.local
npm run dev
```

默认配置使用确定性的 Fake Provider，不需要 API Key，也不会产生模型费用。若需本地验证 DeepSeek，请在 `.env.local` 中设置以下变量，真实 Key 不得提交到 Git：

```dotenv
MODEL_PROVIDER=deepseek
MODEL_NAME=deepseek-v4-flash
DEEPSEEK_API_KEY=your_key_here
DEEPSEEK_BASE_URL=https://api.deepseek.com
LIVE_GENERATION_ENABLED=true
MODEL_REQUEST_TIMEOUT_MS=45000
MODEL_ENGINEERING_TIMEOUT_MS=75000
LIVE_BUDGET_CNY=10
LIVE_MAX_RUNS_PER_PROCESS=15
LIVE_MAX_RUNS_PER_SESSION=3
```

如需启用注册、登录与云同步，先按 [Supabase 配置说明](supabase/README.md)执行迁移，再增加：

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

未配置这两个变量时，应用明确显示“本地模式”，便于 Fake Provider 零依赖开发；一旦配置，实时生成接口强制要求有效登录会话。不要配置或提交 Supabase `service_role` Key。

## 验证

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

当前证据包括 35 个单元测试、5 条 Chromium 端到端流程、5 个固定提示词的真实模型评测，以及 Vercel 生产环境的实时生成、WAF 429、邮箱登录与跨 Origin 云恢复验证。自然语言迭代和虚拟多文件视图已完成本地验证，生产启用前还需执行增量 Migration。尚未完成的双账号越权测试和断网重连测试会在[验证报告](docs/validation-report.md)中明确保留。

## 安全与费用边界

- `.env*`、Vercel 本地元数据、内部工作文件和根目录原始材料均被 Git 与部署忽略规则隔离。
- 提示词、模型输出、自动修复次数、单进程运行次数和单会话运行次数均有上限。
- 生产 `/api/runs` 使用 Vercel WAF：每 IP 每 600 秒最多 3 次，超限返回 HTTP 429。
- 配置 Supabase 后，服务端只接受经 `auth.getUser` 验证的 Access Token；浏览器数据访问还受表 Grants 和 RLS 双重约束。
- Publishable Key 可以出现在浏览器；Provider Key 与 Supabase `service_role` Key 不得进入客户端或仓库。
- 应用侧内存计数不是分布式精确配额；DeepSeek 账户额度仍是最终费用边界。

## 已知限制

- 登录用户的最近项目与 3 个成功版本同步到 Supabase；当前没有多项目列表、团队共享、角色权限或多人协作。
- 云端冲突暂按 `savedAt` Last-Write-Wins；生产多人编辑需要服务端 Revision 与显式冲突处理。
- 生成 HTML 首版存入 Postgres 且限制为 150 KB；体积扩大后需要迁移到 Supabase Storage。
- 已完成的项目可在刷新后恢复；但刷新发生在未完成运行中时，不承诺恢复流式连接或一键续跑元数据。
- 引导模式只在 Product Brief 暂停一次；Technical Plan 可查看但不提供可视化编辑器。
- 自然语言修改会基于当前 Product Brief 完整重建，不是对上一版 HTML 的逐字符补丁，因此未明确要求保留的像素细节可能变化。
- Code 标签的三个文件是只读虚拟投影；生成范围仍限于自包含前端应用，不运行任意 npm 依赖或生成的后端代码。
- Serverless 实例内的次数与费用估算会随冷启动重置，因此必须与平台限流和账户额度配合。

这些限制会保留为明确的原型边界，而不会被描述为生产级能力。

## License

[MIT](LICENSE) © 2026 Davidson
