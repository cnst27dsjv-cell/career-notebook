# 投递记录 JD 字段实施计划

1. 为 `Application` 增加带空字符串默认值的 `jd` 字段和数据库迁移。
2. 更新前端类型、投递保存校验与新增/编辑表单。
3. 在 CSV 导出中加入 JD，JSON 与 ZIP 沿用完整模型导出。
4. 生成 Prisma Client，迁移本地与 Supabase 数据库。
5. 运行类型检查、单元测试、Next.js 构建和 Cloudflare 构建。
