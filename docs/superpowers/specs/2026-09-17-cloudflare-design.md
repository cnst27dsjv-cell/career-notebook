# Cloudflare 与 Supabase 部署适配

用户已确认 Cloudflare Workers 与 Supabase PostgreSQL。保留本地 Next.js、PostgreSQL 与 SMTP 开发路径。

## 架构

- 网页：验证 vinext 兼容性后增加 Workers 构建与部署入口。
- 数据：Supabase PostgreSQL，Prisma 保留现有结构与事务。运行连接与迁移连接分别配置。服务端数据库访问继续执行账号隔离，不启用 Supabase Auth。专用数据库项目关闭 Data API，避免公开业务表。
- 文件：云端 R2 私有 bucket，本地 storage 目录。下载始终检查登录和文件归属。
- 提醒：抽取一次扫描函数，本地循环与云端 scheduled 入口复用；保留并发锁、去重及不确定发送状态。
- 文档提取：Workers 无法启动子进程，需要独立的受限内存提取实现，并保留文件及解压大小限制。
- 邮件：增加 HTTP 邮件服务路径；本地继续使用 SMTP 捕获。外部邮件服务配置前不能声称真实提醒已验收。
- 密钥：仅本地忽略配置及 Workers Secrets，不提交真实数据库或模型凭据。

## 验收

本地原有测试、构建及集成流程通过；Workers 构建、预览与上传下载/资料导入/鉴权验证通过后才标记适配完成。Supabase 连接、远程迁移、R2 与真实邮件验收需要用户提供相应资源，不能以本地测试替代。云端首次上线不自动搬迁或覆盖本地个人数据。

## 实施顺序

1. 兼容性检查与依赖验证。
2. 提醒逻辑提取、文件存储接口与云数据库适配。
3. Workers 入口、定时触发及安全配置。
4. 本地回归与 Workers 预览。
5. 更新部署说明，扫描密钥，提交 GitHub。
