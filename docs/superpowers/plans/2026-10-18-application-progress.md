# 投递阶段进度条 Implementation Plan

**Goal:** 每条投递记录下方显示六阶段进度线，准确区分当前、完成、经过、未记录和未开始。

**Architecture:** 从已有 Application.stage/stageStatus/history/appliedAt/outcome 派生展示，不写库、不新增请求。独立展示组件放在原记录按钮下方，保留原点击编辑和筛选分页行为。

**Tech Stack:** React、TypeScript、现有全局 CSS、Vitest、Chrome 浏览器验证。

## 范围与规则

- 固定顺序：待投递、已投递、测评、笔试、面试、Offer。
- 当前节点突出；测评/笔试/面试的等待结果代表该阶段已完成，仍停留本阶段。
- 投递事实由实际投递时间或当前后续阶段确认。其他历史阶段仅明确等待结果才标完成，曾进入但无完成记录标已历经，缺失环节标未记录。
- 不把后续阶段自动当已开始，不推断录用接受；终止结果单独展示并停止当前活跃视觉。
- 仅实际投递日期显示月日；不拿修改记录日期冒充考试或面试日期。
- 六节点在手机上保持可读；原记录按钮仍可键盘和点击打开编辑。

## 步骤

- [x] 新增 tests/application-progress.test.ts，覆盖初始、阶段完成、跳过、终止、回退和日期。
- [x] 新增 lib/application-progress.ts 及 components/application-progress.tsx，连接 components/applications.tsx；只添加必要 CSS。
- [x] 测试及类型检查通过；浏览器检查桌面、390px、完成/终止/跳阶段状态与原点击编辑行为。

验证：全套 144 项测试通过；录用完成展示微调后重跑 10 项相关测试及类型检查。`scripts/application-progress-browser-check.ts` 使用合成数据与实际投递组件，验证六节点、阶段完成、未记录、北京时间日期、状态即时更新、键盘打开编辑、筛选与移动端无横向溢出。截图已检查。本地 3040 服务已启动并返回 HTTP 200。

本次仅修改本地，不推送或部署。
