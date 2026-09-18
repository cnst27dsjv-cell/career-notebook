import { spawn, spawnSync } from "node:child_process";
import { openSync, existsSync } from "node:fs";
import path from "node:path";
process.chdir(path.resolve(import.meta.dirname, ".."));
function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
if (!existsSync(".env")) {
  console.error("请先按照运行说明创建 .env 配置文件。");
  process.exit(1);
}
run("docker", ["compose", "up", "-d"]);
for (let i = 0; i < 30; i++) {
  const result = spawnSync(
    "docker",
    ["compose", "exec", "-T", "db", "pg_isready", "-U", "career"],
    { stdio: "ignore" },
  );
  if (result.status === 0) break;
  await new Promise((r) => setTimeout(r, 1000));
}
run("npx", ["prisma", "migrate", "deploy"]);
let running = false;
try {
  const r = await fetch("http://127.0.0.1:3040/api/health");
  running = (await r.json()).service === "career-notebook";
} catch {}
if (!running) {
  const out = openSync("06_临时文件/web.log", "a");
  const child = spawn("npm", ["run", "dev"], {
    detached: true,
    stdio: ["ignore", out, out],
  });
  child.unref();
}
const { PrismaClient } = await import("@prisma/client");
const { PrismaPg } = await import("@prisma/adapter-pg");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const heartbeat = await db.heartbeat.findUnique({ where: { id: "reminders" } });
await db.$disconnect();
if (!heartbeat || Date.now() - heartbeat.updatedAt.getTime() > 120000) {
  const out = openSync("06_临时文件/worker.log", "a");
  const child = spawn("npm", ["run", "worker"], {
    detached: true,
    stdio: ["ignore", out, out],
  });
  child.unref();
}
for (let i = 0; i < 30; i++) {
  try {
    if ((await fetch("http://127.0.0.1:3040/api/health")).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));
}
spawn("open", ["http://127.0.0.1:3040"], { stdio: "ignore" }).unref();
console.log("求职手账已打开：http://127.0.0.1:3040");
