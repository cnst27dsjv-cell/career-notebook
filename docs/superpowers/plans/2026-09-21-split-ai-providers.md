# DeepSeek 与 Tokendance 分离接入实施计划

1. 在 `lib/model.ts` 分离文本、图片和可选搜索配置，取消旧统一密钥回退。
2. 更新服务状态接口和设置页，提供 DeepSeek 文本与 Tokendance 图片独立连接测试。
3. 更新本地、Cloudflare 和开源部署示例，确保示例不包含真实密钥。
4. 添加配置隔离测试，运行全量测试、类型检查和 Vinext 构建。
5. 待用户在本地或 Cloudflare Secrets 提供两个新 API Key 后，执行真实连接验收并部署。
