# Supabase 配置

1. 创建 Supabase 项目。
2. 在 SQL Editor 中执行 `migrations/202609070001_buildtrace_projects.sql`。
3. 从项目 Connect 面板复制 Project URL 与 Publishable Key。
4. 在本地和 Vercel 配置：

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

不要在本项目中使用或提交 `service_role` Key。浏览器使用用户会话访问 Data API，`projects` 和 `project_versions` 同时通过最小 grants 与 RLS 按 `auth.uid()` 隔离。

公开 Demo 建议保留邮箱确认，并在 Authentication → URL Configuration 中设置：

- Site URL：`https://buildtrace-atoms-demo-xi.vercel.app`
- Redirect URL：`http://localhost:3000/**`
- Redirect URL：`https://buildtrace-atoms-demo-xi.vercel.app/**`

Supabase 默认邮件服务仅适合验证，正式生产应配置自有 SMTP 与 Auth 攻击保护。

## 远程验收清单

迁移和环境变量生效后，至少使用两个独立测试邮箱验证：

1. 账号 A 注册、确认、登录，创建项目并刷新页面，确认会话与项目恢复；
2. 在无痕窗口登录账号 A，确认可从 Postgres 恢复最近项目；
3. 登录账号 B，通过 Data API 尝试查询和修改账号 A 的 Project ID，预期返回空结果或权限错误；
4. 账号 A 断网修改项目，确认本地仍保存；恢复网络后点击“立即重试”，确认云端 `saved_at` 和版本更新；
5. 未登录请求 `POST /api/runs` 应返回 401，登录后应进入正常 Pipeline；
6. 检查仓库、浏览器 Bundle 和 Vercel 变量：只存在 Publishable Key，不存在 `service_role` Key。

SQL 文件是可审阅的首版迁移，不应直接编辑线上表来制造与仓库不一致的 Schema。后续变更新增迁移文件。
