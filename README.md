# 求职手账 · Career Notebook

一个参考复古纸质手账设计的个人求职工作台。项目基于 Next.js、PostgreSQL 和 Prisma，支持日程提醒、投递管理、简历版本、面试资料库、AI 助理及带来源的联网调研。

## 功能概览

- 今日安排、日历、截止与逾期提醒
- 按公司、城市、岗位、批次、阶段和状态筛选投递
- 简历系列、版本、归档及投递版本关联
- 按岗位组织的面试资料库、DOCX 导入和 AI 分类
- 面试回答润色、模拟面试及确认后入库
- 连续对话求职助理：查询、投递/日程/面试准备联动，行动草稿确认后原子保存，历史对话可恢复
- 可选的 AI 模型与联网搜索；没有 API Key 时仍可使用全部手动管理功能

## 本地启动

需要 Node.js、Docker 与 Docker Compose。

```sh
cp .env.example .env
npm ci
docker compose up -d
npx prisma migrate deploy
npm run db:seed
npm run dev
```

另开一个终端运行提醒进程：

```sh
npm run worker
```

网页地址为 http://127.0.0.1:3040，本地测试邮件可在 http://127.0.0.1:8026 查看。macOS 用户完成首次安装后也可以双击 `启动求职手账.command`。

## 自行配置 AI

AI 配置只保存在服务器端的 `.env`，不会进入浏览器代码。仓库忽略所有 `.env` 文件，只保留不含密钥的示例文件。默认用 DeepSeek 处理文本，用 Tokendance 的视觉模型处理图片：

```env
TEXT_MODEL_BASE_URL="https://api.deepseek.com"
TEXT_MODEL_API_KEY="your-deepseek-api-key"
TEXT_MODEL_NAME="deepseek-flash"
TEXT_MODEL_POLISH_NAME="deepseek-v4-pro"
VISION_MODEL_BASE_URL="https://tokendance.space/gateway/v1"
VISION_MODEL_API_KEY="your-tokendance-api-key"
VISION_MODEL_NAME="qwen3.5-flash"
```

- `TEXT_MODEL_NAME` 用于资料分类、信息提取和普通助理任务。
- `TEXT_MODEL_POLISH_NAME` 用于中文润色和模拟面试反馈；留空时使用通用文本模型。
- `VISION_MODEL_NAME` 用于招聘截图识别，必须支持图片输入。
- 联网调研需要另外配置 `SEARCH_MODEL_BASE_URL`、`SEARCH_MODEL_API_KEY` 和 `SEARCH_MODEL_NAME`；当前两个默认服务不会被当作联网搜索服务。
- 修改配置后重启网页和 worker，再在设置页执行连接测试。

不要把真实密钥写入源码、截图、Issue 或提交记录。如果密钥曾被提交过，应立即在服务商后台撤销并重新生成。

## 助理第一批（2026-09-27）

采用信纸对话界面，支持先审阅再执行的跨模块操作。首次运行需执行数据库迁移并重新生成 Prisma 客户端。具体功能、验收与尚未上线边界见[助理交付记录](docs/superpowers/plans/2026-09-27-assistant-mvp-verification.md)。

## 验证

```sh
npm run typecheck
npm test
npm run build
npx tsx --env-file=.env scripts/integration-check.ts
```

集成脚本要求网页、数据库、Mailpit 和 worker 正在运行。`flows-check.ts` 包含首次开户验收，只适用于没有个人账号的独立测试库，不要在已经使用的数据库上运行。

## 文档

- [运行与部署说明](03_交付物/04_运行与部署说明.md)
- [当前交付与验收记录](03_交付物/05_当前交付与验收.md)
- [产品需求](03_交付物/01_PRD.md)
- [技术架构](03_交付物/02_技术架构.md)
- [分阶段计划](03_交付物/03_搭建计划.md)

## Cloudflare 部署

已提供 Workers + Supabase PostgreSQL + R2 的部署路径，详见[Cloudflare 与 Supabase 部署说明](03_交付物/06_Cloudflare与Supabase部署.md)。云端需要自行创建数据库、私有文件桶并配置密钥。

## 当前边界

项目目前完成本地可运行首版。真实 SMTP、公网部署、跨网络手机访问和电脑关机后的持续提醒仍需部署环境支持。QQ 邮箱自动收信与微信推送属于后续阶段。

### 助手联网搜索（Tavily）

在服务端环境配置 `TAVILY_API_KEY`，重启应用后，在助手输入区勾选「联网搜索」。仅当前问题发送给搜索服务，请勿在联网问题中填写私人资料；历史聊天与工作台资料不传给 Tavily。每条开启联网的消息发起一次 basic 搜索，最多5条摘要；回答附来源和搜索时间，不等于已读取网页全文。失败可重试，重试可能消耗新的搜索额度。普通聊天默认不搜索。线上需要单独设置密钥并应用数据库迁移，本地 `.env` 不会自动同步。

验收：`npx tsx --env-file=.env scripts/assistant-search-check.ts` 使用临时账号完成一次真实搜索与文本模型调用，检查来源保存、重放保护、桌面及手机布局，并清理测试账号。此检查会消耗搜索和文本模型额度。
