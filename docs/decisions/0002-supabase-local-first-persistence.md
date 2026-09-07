# ADR-0002：Supabase 身份与本地优先云持久化

- 状态：Accepted
- 日期：2026-09-07
- 决策者：候选人确认实施

## 背景

最初 MVP 只用 LocalStorage 保存单浏览器项目，适合优先验证 Agent Pipeline，但无法证明用户身份、跨设备持久化和多租户数据隔离。范围升级要求增加注册登录，并把项目元数据、Agent 产物、版本和生成 HTML 保存到云端，同时保留断网恢复能力。

## 决策

采用四层边界：

1. Supabase Auth 保存邮箱身份和浏览器会话；
2. Supabase Postgres 的 `projects` 与 `project_versions` 保存当前快照和最近三个成功版本；
3. 自包含 HTML 首版存入 `project_versions.accepted_html`，单份限制 150 KB；超过边界后迁移到 Supabase Storage；
4. LocalStorage 继续保存版本化本地投影，并按 `guest` 或 Supabase User ID 分区。

浏览器使用 Publishable Key 和用户 JWT 直接访问 Data API。两张业务表撤销匿名权限、只向 `authenticated` 授予所需 CRUD，并为四类操作分别建立基于 `auth.uid()` 的 RLS Policy。服务端生成接口不信任客户端传入的用户 ID，而通过 Supabase `auth.getUser(accessToken)` 验证 Bearer Token。

登录同步采用受限的 Last-Write-Wins：只比较当前用户本地缓存和云端快照的 `savedAt`。两者均不存在时才迁入游客项目，并重新生成项目 ID 和所有版本 ID。退出后切回游客分区，不继续展示上一个账户的数据。云端失败不阻断本地保存，用户手动重试或浏览器恢复联网时重新读取云端后再合并。

## 为什么这样选择

- 身份、关系数据和 RLS 在一个托管服务中完成，适合限时全栈作业；
- Publishable Key 本来就是浏览器可见凭证，真正的数据边界由用户 JWT、表 Grants 和 RLS 共同执行；
- 本地优先保留刷新恢复与断网韧性，云端不是唯一可用性单点；
- 项目当前最多三个 HTML 版本，行内文本实现简单且可查询；显式大小上限避免把临时方案无限延长；
- 服务端重新验证 Token，使付费生成配额可以绑定可信用户，而不是可伪造的客户端 Session ID。

## 后果与限制

- 客户端时间可以影响 `savedAt`，因此该冲突策略不适合多人并发编辑；生产版应使用服务端 Revision、乐观锁或 CRDT；
- 浏览器持有的会话和本地项目仍受 XSS 风险影响，必须继续维持 CSP、依赖审计与生成内容沙箱；
- 邮箱确认依赖邮件投递，公开体验需要配置正确的 Site URL、Redirect URL，正式生产还应接入自有 SMTP；
- 当前只恢复一个最近项目，没有项目列表、共享、角色或审计能力；
- 迁移脚本提供可重复审阅的 Schema 和 Policy，但远程配置仍需独立集成验证。

## 被拒绝的方案

### 只保留 LocalStorage

实现最简单，但不能满足账号、跨设备恢复和服务端数据隔离要求。

### 使用 Service Role 由 Next.js 代写所有数据

会把高权限 Secret 引入应用运行时，并要求手写所有授权检查。当前简单 CRUD 更适合通过用户 JWT + RLS 直接访问；仓库和 Vercel 均不配置 Service Role Key。

### 立即把所有 HTML 存入 Storage

会增加 Bucket、对象命名、清理一致性和 Signed URL 生命周期复杂度。当前 150 KB × 最近三个版本的边界可控，先在 Postgres 建立清晰迁移阈值。
