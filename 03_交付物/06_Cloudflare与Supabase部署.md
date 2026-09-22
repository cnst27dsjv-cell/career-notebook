# Cloudflare Workers 与 Supabase

这是独立的云端部署路径；本地继续使用 Next.js、PostgreSQL、storage 目录和 SMTP。

## 数据库

创建独立 Supabase 项目，在 Connect 面板取得 PostgreSQL 连接字符串。不要使用 publishable key 或 service_role key 代替数据库连接字符串。

本应用只通过服务端 Prisma 访问数据库，保留现有 Better Auth 登录与账号隔离。按照 Supabase 官方 Prisma 指南关闭该项目的 Data API，避免业务表通过 REST 暴露。不要将本应用表与其他应用的公开 Data API 混用。

- 网页运行：使用交易连接池（Transaction pooler）地址，作为加密 `DATABASE_URL`。
- 迁移：使用 Session pooler（通常端口 5432）或可达的 Direct connection；在独立私有配置中设置 `DATABASE_URL` 后执行 `npx prisma migrate deploy`。不要对真实数据库执行 `migrate reset`。
- 首次账号：在同一私有云配置环境使用 `scripts/create-account.ts`，不要导入示例种子。

首次部署默认新数据库；已有本地个人数据的迁移需要单独备份和验证，不会自动覆盖。

## R2

在 Cloudflare 创建私有 bucket `career-notebook-files`，保持公开访问关闭。Worker 的 `FILES` 绑定在 wrangler.jsonc 中声明。上传、下载和 ZIP 导出都经过应用鉴权；云端不会读取本机 storage 目录。

## 提醒与邮件

Cron 每分钟触发一次扫描，保留数据库锁和发送状态去重。云端邮件通过 Resend HTTPS API 发送，需配置 `RESEND_API_KEY` 和已验证发件域名的 `SMTP_FROM`。未配置前邮件提醒不能使用；本地仍使用原 SMTP 捕获服务。

## 密钥

参考 `deploy/cloudflare.env.example`。`DATABASE_URL`、`BETTER_AUTH_SECRET`、`TEXT_MODEL_API_KEY`、`VISION_MODEL_API_KEY`、`RESEND_API_KEY` 存为加密 Secrets。域名、模型名称等可作为普通运行变量。不要加 NEXT_PUBLIC_ 前缀。

本地 Workers 预览使用忽略的 `.dev.vars`；生成的 dist 目录可能含本地预览密钥，不可上传到 GitHub，也不要手工打包整个 dist 分享。

## 构建与部署

```sh
npm ci
npx prisma generate
npm run build:vinext
npm run start:vinext
```

Cloudflare Git 构建设置（代码与资源验收后使用）：

- 生产分支：main
- 根目录：/
- Build command：`npx prisma generate && npm run build:vinext`
- Deploy command：`npx wrangler deploy --config dist/server/wrangler.json`
- 非生产分支自动构建：初期关闭

正式域名使用 `career-notebook.cn`。域名实名成功后，先在 Cloudflare 添加该域名并把腾讯云的 DNS 服务器改为 Cloudflare 分配的两个 nameserver；Cloudflare zone 激活后，`wrangler.jsonc` 中的 custom domain route 会在部署时把 `career-notebook.cn` 绑定到 Worker。生产环境的 `APP_URL` 和 `BETTER_AUTH_URL` 也应设为 `https://career-notebook.cn`，否则验证邮件、提醒链接和登录回调仍会指向旧地址。

部署后检查登录、账号隔离、文件上传下载、Word 提取、资料保存、邮件验证及 Cron 提醒。构建成功不等于上述外部服务已经通过验收。

参考：
- https://supabase.com/docs/guides/database/prisma
- https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/

## 本次验收记录（2026-09-18）

已通过：Workers 构建、本地 workerd 连接 PostgreSQL、账号登录及未登录隔离、DOCX 提取、模拟 R2 上传下载与 ZIP 导出、登录后手机宽度页面渲染；22 项单元测试；原有本地完整集成验收（含后台 SMTP 捕获提醒及桌面/手机七个栏目）。

尚未验收：真实 Supabase 连接、云端 R2、真实 Resend 发信、远程 Cron、公开域名访问。用户尚未创建 Supabase 项目，暂未执行远程迁移或部署。vinext 为 beta 版本，升级前需重跑以上验收。

新建 Supabase 时可使用项目名 career-notebook；保存数据库密码。创建后在 Connect 面板取得 Session 和 Transaction 两种连接地址，通过本地私有配置填写，不要发到聊天或 GitHub。
