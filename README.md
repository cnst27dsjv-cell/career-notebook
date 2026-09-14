# 求职手账 · Career Notebook

一个参考复古纸质手账设计的个人求职工作台。Next.js + PostgreSQL，支持今日安排、日历、投递筛选、简历版本、面试资料和助理接口。

## 直接使用

当前电脑已完成依赖安装、数据库初始化和示例数据建立。

- 打开 http://127.0.0.1:3040 。
- 可以先进入示例手账，或点击“第一次使用？创建我的空白手账”。个人账号与示例记录隔离。
- 以后双击项目根目录的 `启动求职手账.command`，会启动本项目数据库、网页和提醒进程。
- 本地测试邮件在 http://localhost:8026 查看；当前不会向真实 QQ 邮箱发信。

## 文档

- [运行与部署说明](03_交付物/04_运行与部署说明.md)
- [当前交付与验收记录](03_交付物/05_当前交付与验收.md)
- [产品需求](03_交付物/01_PRD.md)
- [技术架构](03_交付物/02_技术架构.md)
- [分阶段计划](03_交付物/03_搭建计划.md)

## 开发

```sh
npm ci
docker compose up -d
npx prisma migrate deploy
npm run dev
# 在另一个终端保持提醒进程运行
npm run worker
```

首次安装需参考 `.env.example` 建立 `.env`，配置数据库及随机认证 secret。可运行 `npm run db:seed` 创建独立示例账号，脚本不会覆盖已存在的示例记录。

```sh
npm run typecheck
npm test
npm run build
npx tsx --env-file=.env scripts/integration-check.ts
npx tsx --env-file=.env scripts/flows-check.ts
```

浏览器验收脚本使用本机 Chrome；集成脚本需要网页与提醒服务正在运行。flows-check 包含首次开户验收，仅适用于尚无个人账号的测试环境，会清理自身创建的临时账号。不要对已开始真实使用的生产库运行测试脚本。

## 当前边界

这是本地可运行首版，尚未部署到公网。手机页面布局已验收，但要在任意网络访问并在电脑关闭后持续发信，需要部署到常驻服务器。模型、搜索、真实 SMTP 凭据尚未配置；对应接口有真实接入实现，但未完成外部服务联调。QQ 自动收信与微信推送属于后续阶段。
