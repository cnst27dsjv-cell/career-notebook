# DeepSeek 与 Tokendance 分离接入设计

## 目标

替换已不可用的 OpenAI Next 统一模型配置，将纯文本任务与图片识别分配给两个独立服务：

- DeepSeek 负责资料分类、信息提取、助理对话和中文润色。
- Tokendance 的 `qwen3.5-flash` 负责招聘截图、JD 图片和其他图像内容识别。
- 两套 API Key 仅保存在服务器或 Cloudflare Worker Secret 中，不进入浏览器和 Git 仓库。

## 服务配置

### DeepSeek 文本服务

- `TEXT_MODEL_BASE_URL=https://api.deepseek.com`
- `TEXT_MODEL_API_KEY=<DeepSeek API Key>`
- `TEXT_MODEL_NAME=deepseek-flash`
- `TEXT_MODEL_POLISH_NAME=deepseek-v4-pro`

普通文本任务使用 `deepseek-flash`，润色和模拟面试反馈使用 `deepseek-v4-pro`。请求使用 DeepSeek 官方 OpenAI 兼容的 `/chat/completions` 接口。

### Tokendance 图片服务

- `VISION_MODEL_BASE_URL=https://tokendance.space/gateway/v1`
- `VISION_MODEL_API_KEY=<Tokendance API Key>`
- `VISION_MODEL_NAME=qwen3.5-flash`

图片请求继续使用 OpenAI Chat Completions 多模态消息结构，图片以 data URL 传入。

## 代码边界

`lib/model.ts` 将增加两个内部配置解析器：

- 文本配置解析器只读取 `TEXT_MODEL_*`。
- 图片配置解析器只读取 `VISION_MODEL_*`。

`generate` 和文本连接测试走 DeepSeek；`generateWithImages` 和图片识别走 Tokendance。应用其他业务接口保持不变。

不使用旧的 `MODEL_BASE_URL` 或 `MODEL_API_KEY` 作隐式回退，避免生产环境在配置错误时意外继续调用旧服务。文档会明确说明如何删除旧变量。

## 服务状态与错误

设置页将分别显示：

- “AI 文本助理”及当前 DeepSeek 通用模型。
- “中文润色”及 DeepSeek 润色模型。
- “图片识别”及 Tokendance 视觉模型。

文本或图片任一服务未配置时，只禁用对应能力，不影响另一套服务和手动管理功能。错误信息明确指出是 DeepSeek 文本服务还是 Tokendance 图片服务失败。

## 开源与部署

`.env.example`、Cloudflare 配置示例和 README 只保留空密钥与示例值。部署时通过 Cloudflare Secrets 填写两个 API Key。其他 Fork 用户可各自申请 DeepSeek 和 Tokendance 密钥，不共享项目维护者的额度。

## 验证

- 单元测试确认文本和图片请求使用不同的 URL、API Key 和模型。
- 测试任一服务缺少配置时的独立错误。
- 运行全量测试、TypeScript 检查和 Vinext/Cloudflare 构建。
- 在不暴露密钥的前提下，分别执行一次文本连接测试和一次图片识别测试。
