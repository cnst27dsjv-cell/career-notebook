import { db } from "../lib/db";
import { tick } from "../lib/reminders";
let stopped = false;
process.on("SIGTERM", () => {
  stopped = true;
});
process.on("SIGINT", () => {
  stopped = true;
});
console.log("提醒服务已启动；当前模式：" + (process.env.MAIL_MODE || "未配置"));
while (!stopped) {
  try {
    await tick();
  } catch (e) {
    console.error("提醒扫描失败", e instanceof Error ? e.message : "未知错误");
  }
  await new Promise((r) => setTimeout(r, 30000));
}
await db.$disconnect();
