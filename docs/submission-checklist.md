# BuildTrace 面试提交与演示清单

> 用途：在正式提交前核对交付物，并为面试官提供一条 5 分钟内能看见产品判断、工程质量和风险意识的审阅路径。

## 1. 交付入口

- 在线 Demo：<https://buildtrace-atoms-demo-xi.vercel.app>
- GitHub：<https://github.com/DavidsonPang/buildtrace-atoms-demo>
- 最终交付标签：`v1.2-iteration`
- 产品调研：[product-discovery.md](./product-discovery.md)
- 产品需求：[product-requirements.md](./product-requirements.md)
- 技术方案：[technical-design.md](./technical-design.md)
- 验证证据：[validation-report.md](./validation-report.md)
- 关键决策：[ADR-0001](./decisions/0001-sandboxed-self-contained-html.md)、[ADR-0002](./decisions/0002-supabase-local-first-persistence.md)、[ADR-0003](./decisions/0003-natural-language-revision-and-virtual-files.md)

## 2. 面试官 5 分钟审阅路径

1. 打开在线 Demo，点击“查看预置成功项目 · 零模型调用”，无需账号或费用即可看到完整成功状态。
2. 在版本回复中依次打开 Product Brief、Technical Plan 和 Validation，观察中间产物与当前版本保持一致。
3. 打开 Product Brief 的结构化编辑入口，确认修改后只使下游阶段失效；无需实际调用模型也能看清重建边界。
4. 切换到 Code，查看 `index.html`、`styles.css`、`app.js` 三个只读虚拟文件；再回到 Preview 操作报价计算器。
5. 从顶部项目入口创建新项目并切回 SwiftQuote，观察不同项目的对话、产物、版本和预览彼此隔离。
6. 打开 README、技术方案和验证报告，检查架构取舍、测试证据、成本保护和已知限制是否与实现一致。

## 3. 值得重点说明的产品与工程判断

- 默认使用快速模式降低首次生成摩擦，同时提供只在 Product Brief 暂停一次的引导模式。
- 中间产物不是装饰：Product Brief 可编辑并驱动 Architecture → Engineering → Validation 的确定性重建边界。
- 版本只在服务端检查通过且 iframe 上报 Ready 后提交；候选版本失败时保留最近成功预览。
- 生成 HTML 在受限 iframe 中运行，进入预览前执行结构、安全策略、外部资源和交互目标检查。
- Provider Key 只在服务端使用；用户身份和云端项目由 Supabase Auth、Postgres、Grants 与 Owner RLS 保护。
- LocalStorage 是按用户、按项目隔离的缓存和断网恢复层，不被描述成权威云数据库。
- 自然语言修改采用 Product Brief 语义重建而不是 HTML 字符补丁，以换取 Agent 产物一致性和可控 Token 成本。

## 4. 最终验证状态

- [x] Lint、格式检查和 TypeScript 通过。
- [x] 40 个 Vitest 单元/契约测试通过。
- [x] 7 条 Chromium 端到端 UI 流程通过，包含 560×900 窄屏布局。
- [x] Vercel Production 构建 Ready，稳定域名首页与 Preset API 返回 200。
- [x] 未登录生成请求返回 401，没有触发模型调用。
- [x] 生产环境 Product Brief、Technical Plan、Validation 入口和 Brief 编辑由候选人人工确认正常。
- [x] 登录态下两个云端项目可以切换，并在刷新后恢复当前项目。
- [x] 创建并推送最终 `v1.2-iteration` 标签。
- [ ] D6 确认后才正式提交招聘回收表单。

## 5. 已知限制（提交时主动披露）

- 双账号动态越权、真实断网重连和长期模型稳定性没有被有限测试覆盖；当前证据不把它们描述为已验证。
- 多项目首版不包含删除、搜索、文件夹、共享、角色或多人协作。
- HTML 首版限制为 150 KB 并存入 Postgres，规模扩大后应迁移 Supabase Storage。
- 内存限流不是分布式配额；生产同时依赖 Vercel WAF 和 DeepSeek 账户预算作为外部边界。
- 虚拟多文件视图用于阅读，实际运行与下载仍使用经过验证的自包含 HTML。

## 6. 建议提交说明

> 我完成了一个从产品调研、PRD、技术方案到实现与验证的透明 AI Builder。它通过 Product、Architecture、Engineering、Validation 四阶段生成可运行微型产品，并支持结构化 Brief 编辑、局部重建、版本回滚、自然语言迭代、多项目、Supabase 云同步和受限沙箱预览。在线 Demo 提供零模型调用的预置成功项目，README 与验证报告中记录了真实模型评测、自动化测试、安全边界、费用保护和未完成验证。

正式提交前只替换招聘方要求的字段格式，不增加未经验证的宣传性结论。
