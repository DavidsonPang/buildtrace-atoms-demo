# BuildTrace

BuildTrace 是一个“从想法到可运行产品”的透明 AI Builder：用户输入业务想法后，产品、架构和工程 Agent 会依次生成结构化产物，最终交付一个经过确定性安全检查、可以直接交互的微型网页应用。

[在线体验](https://buildtrace-atoms-demo-xi.vercel.app)

## 三步体验

1. 选择“项目报价计算器”等示例，或输入至少 10 个字符的产品想法。
2. 点击“开始生成”，观察 Product、Architecture、Engineering、Validation 四个阶段的真实事件与中间产物。
3. 在右侧切换预览、代码、日志和验证结果，并直接操作生成的应用。

在线生成使用 DeepSeek V4 Flash，通常需要约 40–90 秒。公开 Demo 按 IP 限制为每 10 分钟 3 次生成请求，以控制匿名滥用和模型费用。

## 当前实现

- Next.js 全栈应用，模型密钥仅保存在服务端环境变量中。
- Product → Architecture → Engineering → Validation 四阶段 Pipeline。
- Zod 校验请求、Agent 结构化输出和流式 NDJSON 事件。
- DeepSeek Provider Adapter、分阶段超时、错误归一化和一次受限格式修复。
- 自包含 HTML 产物；进入预览前执行大小、结构、危险标签、外部资源和交互目标检查。
- `iframe sandbox="allow-scripts"` 隔离运行，使用带随机 Channel Token 的 `postMessage` 验证就绪、交互和运行时错误。
- 三个一键示例、生成取消、阶段产物、代码、事件日志和验证面板。
- 应用侧会话/预算保护，以及 Vercel WAF 的 IP 固定窗口限流。

## 架构

```text
Browser
  ├─ Builder Workspace
  ├─ NDJSON event consumer
  └─ sandboxed iframe preview
          │
          ▼
POST /api/runs
  ├─ request schema + budget guard
  ├─ provider adapter
  ├─ Product Agent
  ├─ Architecture Agent
  ├─ Engineering Agent
  └─ deterministic validator + preview instrumentation
          │
          ▼
DeepSeek Responses API
```

本次原型主动选择“自包含单页应用”，以在受限时间内同时保证生成稳定性、即时预览和清晰的执行安全边界。生产演进方向包括持久化任务队列、可重连事件流、容器化多文件构建、租户级配额和可观测性。

更完整的决策依据见：

- [产品调研](docs/product-discovery.md)
- [产品需求](docs/product-requirements.md)
- [技术设计](docs/technical-design.md)
- [沙箱 ADR](docs/decisions/0001-sandboxed-self-contained-html.md)
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

## 验证

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

当前证据包括 10 个单元测试、Fake Provider 浏览器端到端测试、5 个固定提示词的真实模型评测，以及 Vercel 生产环境的完整实时生成和 WAF 429 验证。细节与失败样本均记录在[验证报告](docs/validation-report.md)中。

## 安全与费用边界

- `.env*`、Vercel 本地元数据、内部工作文件和根目录原始材料均被 Git 与部署忽略规则隔离。
- 提示词、模型输出、自动修复次数、单进程运行次数和单会话运行次数均有上限。
- 生产 `/api/runs` 使用 Vercel WAF：每 IP 每 600 秒最多 3 次，超限返回 HTTP 429。
- 应用侧内存计数不是分布式精确配额；DeepSeek 账户额度仍是最终费用边界。

## 已知限制

- 当前运行状态保存在浏览器内存，刷新后的项目恢复、版本历史和回滚尚未实现。
- Product Brief 当前可查看但不可编辑；下游失效与局部重建尚未实现。
- 失败后重新生成会执行完整 Pipeline，尚未复用已成功的上游阶段。
- 生成范围限于自包含前端应用，不运行任意 npm 依赖或生成的后端代码。
- Serverless 实例内的次数与费用估算会随冷启动重置，因此必须与平台限流和账户额度配合。

这些限制会保留为明确的原型边界，而不会被描述为生产级能力。
