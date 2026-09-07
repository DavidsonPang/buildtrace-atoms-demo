# BuildTrace 验证报告

> 日期：2026-09-07
> 范围：本地端到端纵向切片、DeepSeek V4 Flash Provider Spike、五场景评测、Vercel 生产部署、Supabase 身份/持久化，以及自然语言迭代与虚拟多文件源码视图的本地验证
> 结论：本地核心生成链路通过；真实模型场景 4/5 成功，达到 PRD 的最低验收线；生产环境真实 Pipeline 与平台限流已验证。Supabase 邮箱身份、数据库写入和跨 Origin 云恢复已在线验收。自然语言迭代与虚拟文件视图已通过本地自动验证，但增量数据库 Migration 和新版生产部署尚未执行；双账号越权与断网重连仍明确保留为待验证项。

## 1. 验证口径

本报告区分四类证据：

- **自动测试通过**：由 Vitest、TypeScript、ESLint、Next.js Build 或 Playwright 直接验证。
- **真实模型通过**：确实调用 `deepseek-v4-flash`，产物通过运行时 Schema 和确定性 HTML 验证。
- **浏览器实测通过**：产物已在受限 iframe 中启动并产生可见交互变化。
- **已知失败或限制**：保留失败样本，不把修复后的单次成功包装成从未失败。

## 2. 工程自动验证

| 检查               | 结果 | 证据                                                                    |
| ------------------ | ---- | ----------------------------------------------------------------------- |
| ESLint             | 通过 | `npm run lint`，0 error / 0 warning                                     |
| TypeScript         | 通过 | `npm run typecheck`                                                     |
| 单元测试           | 通过 | 8 个测试文件、35 个测试通过                                             |
| 生产构建           | 通过 | `npm run build`；主页和 `/api/preset` 为 Static，`/api/runs` 为 Dynamic |
| Fake Provider E2E  | 通过 | Chromium 用户流程 5/5 通过                                              |
| 真实产物浏览器回放 | 通过 | 10 个交互控件；输入改变后结果变化；父页面显示“已就绪 · 交互已验证”      |

单元测试覆盖 Orchestrator 阶段顺序与取消、引导式暂停、局部重建、自然语言迭代、失败阶段续跑、请求快照校验、DeepSeek Responses API 请求契约、限流错误归一化、一次结构化修复、预算计数、HTML 安全策略、Preview 注入、虚拟源码拆分、本地快照的校验/迁移/账号分区/版本上限、服务端 Bearer Token 验证边界，以及 Supabase Migration 的 Grants、RLS Policy、修改元数据和 HTML 大小约束。

五条 Chromium 端到端流程分别验证：

1. 快速模式生成并操作沙箱预览。
2. 引导模式在 Product Brief 后暂停，再从 Architecture 继续。
3. 编辑 Brief 后仅重建下游、生成 v2，并在刷新后恢复。
4. 预置成功项目无需模型调用即可进入可交互预览。
5. 成功版本通过自然语言修改生成 v2，并在 `index.html`、`styles.css`、`app.js` 三个虚拟源码文件间切换。

## 3. DeepSeek Provider 实测

### 3.1 接口与配置

- Provider：DeepSeek。
- 模型：`deepseek-v4-flash`。
- API：`POST https://api.deepseek.com/responses`。
- 输出：由 Zod Schema 转换的 JSON Schema，收到响应后再次执行 Zod 运行时校验。
- Pipeline：Product → Architecture → Engineering → Deterministic Validation。
- 安全：Key 仅存在于被 Git 忽略的 `.env.local`，不进入浏览器事件、普通日志或仓库。

官方资料：[DeepSeek Responses API](https://api-docs.deepseek.com/guides/responses_api/)、[模型与人民币价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)。

### 3.2 首次 Spike 暴露的问题

第一次报价场景中，Product 成功，但 Architecture 达到 3,000 Token 上限并返回 `incomplete`。这证明 Responses API 的输出窗口需要同时容纳推理与最终 JSON。调整后各阶段最大输出为：

| 阶段         |     最大输出 |         超时 |
| ------------ | -----------: | -----------: |
| Product      |  8,000 Token |        45 秒 |
| Architecture |  8,000 Token |        45 秒 |
| Engineering  | 24,000 Token |        75 秒 |
| Validation   |   不调用模型 | 本地同步验证 |

### 3.3 五场景结果

| 场景                 | 结果         |  总耗时 |   生成 HTML | 说明                                                       |
| -------------------- | ------------ | ------: | ----------: | ---------------------------------------------------------- |
| 自由职业者报价计算器 | 通过         | 70.1 秒 | 25,221 字符 | 四项验证通过；浏览器交互回放通过                           |
| 活动报名与容量看板   | 通过         | 38.0 秒 | 16,477 字符 | 四项验证通过                                               |
| SaaS 定价与 ROI      | 失败         |       — |           — | Product、Architecture 成功；Engineering 在旧 45 秒上限超时 |
| 英文 B2B 潜客评估    | 通过（重试） | 78.2 秒 | 25,574 字符 | 首次 Product 非 JSON；增加受限修复后完整通过               |
| 咖啡店团购预订       | 通过         | 61.6 秒 | 16,352 字符 | 四项验证通过                                               |

结果为 **4/5（80%）**，达到 PRD“至少四个通过 Schema、沙箱、就绪、可见内容和交互检查”的最低线。活动场景的 Spike 使用了与固定英文提示词语义等价的中文描述；英文输入能力由 B2B 潜客评估场景覆盖。

## 4. 确定性验证内容

每个成功产物在进入 Preview 前都必须通过：

1. HTML 字节大小不超过 100,000。
2. 存在足够的可见页面主体。
3. 至少包含一个表单或按钮交互目标。
4. 不包含被禁止的 iframe、object、embed、外部资源、危险 URL 或顶层导航。
5. 服务端注入限制性 CSP 和带 Run Channel Token 的 Preview Bridge。
6. iframe 使用 `sandbox="allow-scripts"`，不授予 Same-Origin 权限。

浏览器回放进一步验证了 `ready` 与 `interaction` 消息，而不是仅凭 HTML 文本推断应用可运行。

## 5. 费用保护

D3 确认预算上限为 ¥10。本地实现包括：

- 单进程最多接受 15 次真实完整运行。
- 单浏览器会话最多 3 次真实运行。
- 每次接受运行预留 ¥0.65，15 次合计 ¥9.75。
- 按 DeepSeek 人民币高峰单价和响应 `usage` 保守累计实际估算。
- 同一幂等键重试不重复占用运行次数。
- 结构化产物最多进行一次受限修复。

这些计数目前保存在进程内，重启后会清零，因此不能作为公共部署的唯一保护。生产环境额外启用了 Vercel WAF 固定窗口限流，DeepSeek 账户额度仍是最终费用边界。

## 6. 生产部署验证

### 6.1 部署配置

- 平台：Vercel Hobby；项目通过本地 CLI 部署，不连接 GitHub。
- 生产地址：<https://buildtrace-atoms-demo-xi.vercel.app>。
- Function：Fluid Compute；平台时长上限 300 秒，Route 声明 `maxDuration = 180`。
- Secret：`DEEPSEEK_API_KEY` 仅由候选人在 Vercel Dashboard 配置为 Production Secret；验证只读取变量名称和类型，没有回读值。
- Supabase：Project URL 和 Publishable Key 配置为 Production Config；未配置 `service_role` Key。部署 `dpl_8ExouFWg56jjQErYYiQ5B4zHiZUQ` 构建成功并重新绑定稳定域名。
- 上传边界：`.env*`、`.internal/`、内部执行计划、根目录文本材料、依赖、构建和测试产物均被 `.vercelignore` 排除。

### 6.2 在线真实生成

生产环境使用“独立开发者专注时段与本周趋势”提示词执行一次 Quick Pipeline：

| 检查         | 结果                           |
| ------------ | ------------------------------ |
| 首页访问     | HTTP 200                       |
| Provider     | `DeepSeek · deepseek-v4-flash` |
| Product      | 产物完成                       |
| Architecture | 产物完成                       |
| Engineering  | 产物完成                       |
| Validation   | 确定性验证完成                 |
| 整体结果     | `run.completed`                |
| 总耗时       | 78,791 ms                      |

事件流在 Vercel Route Handler 上保持 Product → Architecture → Engineering → Validation 的顺序，证明长请求、NDJSON、运行时 Schema 和生产 Secret 已真实贯通。

### 6.3 平台限流

生产 Firewall 规则 `Protect DeepSeek generation`：

```text
path equals /api/runs
rate limit = 3 requests / 600 seconds
algorithm = fixed window
key = IP
exceeded action = rate_limit (HTTP 429)
```

为避免额外模型费用，使用无法通过请求 Schema 的空 JSON 连续测试。四次响应依次为 `400、400、400、429`：前三次到达应用校验层，第四次由边缘限流拦截。规则状态为 Enabled，且已发布至生产配置。

## 7. Supabase 升级验证状态

### 7.1 已自动验证

- 未配置 Supabase 时保留 Fake Provider 本地模式，不误要求远程身份服务；
- 配置 Supabase 后，缺少或无效 Bearer Token 的身份结果为未登录；有效 Token 的用户 ID 只取自服务端 `auth.getUser`；
- LocalStorage v1 游客数据可迁移到 v2，用户缓存 Key 相互隔离；游客项目迁入账户时重建项目与版本 ID；
- SQL Migration 对 `projects` 和 `project_versions` 启用 RLS、撤销匿名权限，并为 select/insert/update/delete 建立 Owner Policy；
- Postgres 与运行时 Schema 都限制 HTML 大小；当前修改仍先写本地，云端错误有明确状态和重试入口。

### 7.2 已完成的远程验证

- Supabase Auth Settings Endpoint 返回 200；邮箱注册、确认、本地登录和刷新后的会话恢复成功；
- 远程 `projects` 与 `project_versions` 表存在，匿名 Data API 请求均返回 PostgreSQL `42501 permission denied`；
- 登录状态下加载预置项目后显示“已同步”，刷新本地页面仍恢复成功版本；
- 本地 Fake Provider 的登录请求通过服务端 `auth.getUser` 并返回 HTTP 200，不产生模型费用；
- 同一账户在 Vercel 生产 Origin 登录后，从 Postgres 恢复本地 Origin 创建的项目和版本，并显示“已同步”；
- Vercel 构建完成并重新绑定 <https://buildtrace-atoms-demo-xi.vercel.app>。
- 最终源码、Git 历史和未追踪文件名扫描没有发现 Secret 形态；对 251 个生产构建文件执行已配置 DeepSeek Secret 的精确值扫描，结果为 0；Vercel 变量清单不存在 `service_role`。Publishable Key 按设计进入浏览器包并由 RLS 约束。

### 7.3 仍待验证

- 使用第二个独立账号直接尝试读取、修改和删除账号 A 的项目，验证 Owner RLS 的动态越权结果；当前只有 Migration Policy 检查与匿名拒绝证据；
- 真实断网编辑后恢复联网，验证自动重新拉取与同步；当前由代码路径和单元边界覆盖；
- Vercel `/api/runs` 的未登录 401 与登录后完整 DeepSeek Pipeline；直连测试受本机网络超时影响，为避免额外模型费用未重复真实生成；

### 7.4 自然语言迭代增量状态

- 请求契约会拒绝缺失修改要求或当前 Product 产物的 `revise` 请求；
- Fake Provider 集成测试证明引导模式下修改不会再次暂停，并按 Product → Architecture → Engineering → Validation 完整执行；
- 浏览器测试证明 v2 只有在 Preview Ready 后出现，v1 仍保留在版本列表，修改内容在新预览中可见；
- 纯函数测试证明多个 Style/Script 块会按顺序投影到三个虚拟文件，运行使用的 `acceptedHtml` 不被修改；
- `202609070002_iteration_metadata.sql` 已通过静态契约测试，但尚未应用到生产 Supabase；新版应用尚未部署，线上仍保持已验证的 v1.1 行为。

## 8. 已知限制与下一步

- ROI 场景没有在 75 秒新上限下重复验证，保留为真实失败样本。
- 最近一次成功产物会在新预览 Ready 后才写入版本；运行时错误会恢复旧预览，但没有覆盖所有浏览器兼容性故障。
- Supabase 升级已完成远程数据库、邮箱身份、跨 Origin 恢复和 Vercel 重部署；双账号 RLS 动态越权与断网重连仍待验证。
- 当前只恢复登录用户最近项目，没有多项目列表、共享、角色或多人协作。
- 冲突策略依赖客户端 `savedAt`，不适合不可信时钟或多人并发编辑。
- HTML 首版存入 Postgres，超过 150 KB 后仍需迁移 Supabase Storage。
- 已完成项目可在刷新后恢复；未完成运行的流式连接和一键续跑元数据不会跨刷新恢复。
- 引导模式只允许编辑 Product Brief；Technical Plan 目前只读。
- 自然语言修改基于 Product Brief 进行语义重建，不保证未提及的代码或像素细节逐字不变；虚拟多文件视图只读，不是真实构建目录。
- 生产 Supabase 在部署新版前必须先执行 `202609070002_iteration_metadata.sql`，否则云端版本查询会因缺少字段失败。
- 线上只执行了一次完整真实生成，不能据此推断长期可用性或所有提示词表现。
- 没有把 Provider 用量暴露给客户端；费用应以 DeepSeek 控制台账单为最终依据。
- 内存次数与费用计数不是分布式配额；当前 WAF 限制单 IP 频率，但不能替代用户级配额。

核心 Agent Pipeline、差异化重建、本地恢复和 Supabase 单账号生产链路已完成；自然语言迭代与虚拟源码视图已完成本地实现和自动验证。生产增量迁移、部署、双账号隔离与断网重连不会被当前证据夸大为已验证。
