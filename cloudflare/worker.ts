import handler from "vinext/server/fetch-handler";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { context } from "./context";
import { tick } from "../lib/reminders";
import type { FileBucket } from "../lib/storage";

type Env = { DATABASE_URL: string; FILES: FileBucket };
async function run<T>(env: Env, action: () => Promise<T>) {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL, max: 1 }),
  });
  try {
    return await context.run({ db, files: env.FILES }, action);
  } finally {
    await db.$disconnect();
  }
}
export default {
  fetch(request: Request, env: Env, ctx: unknown) {
    return run(env, () => handler.fetch(request, env, ctx));
  },
  scheduled(_event: unknown, env: Env) {
    if (process.env.MAIL_MODE !== "live" || !process.env.RESEND_API_KEY) {
      console.warn("云端邮件服务尚未配置，本次提醒扫描已跳过");
      return Promise.resolve();
    }
    return run(env, () => tick());
  },
};
