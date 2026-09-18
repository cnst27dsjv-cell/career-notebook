import { db } from "@/lib/db";
import { sendMail } from "@/lib/mail";
import type { NotificationJob } from "@prisma/client";
const stamp = (d: Date | null) =>
  d ? d.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) : "未设置";
export async function tick() {
  await db.heartbeat.upsert({
    where: { id: "reminders" },
    create: { id: "reminders" },
    update: { updatedAt: new Date() },
  });
  await db.notificationJob.updateMany({
    where: { state: "sending", leaseUntil: { lt: new Date() } },
    data: {
      state: "unknown",
      lastError: "发送进程中断，无法确定是否已发出；请检查收件箱",
    },
  });
  const jobs = await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      NotificationJob[]
    >`SELECT * FROM "NotificationJob" WHERE state='pending' AND "scheduledAt"<=NOW() ORDER BY "scheduledAt" LIMIT 10 FOR UPDATE SKIP LOCKED`;
    for (const row of rows)
      await tx.notificationJob.update({
        where: { id: row.id },
        data: { state: "sending", leaseUntil: new Date(Date.now() + 60000) },
      });
    return rows;
  });
  for (const job of jobs) {
    const event = await db.event.findFirst({
      where: { id: job.eventId, userId: job.userId },
    });
    if (
      !event ||
      event.status !== "待完成" ||
      event.version !== job.eventVersion
    ) {
      await db.notificationJob.update({
        where: { id: job.id },
        data: { state: "cancelled" },
      });
      continue;
    }
    if ((event.deadline ?? event.start)!.getTime() < Date.now()) {
      await db.notificationJob.update({
        where: { id: job.id },
        data: { state: "expired", lastError: "关键时间已过，未补发过期提醒" },
      });
      continue;
    }
    const settings = await db.settings.findUnique({
      where: { userId: job.userId },
    });
    if (!settings?.emailVerified) {
      await db.notificationJob.update({
        where: { id: job.id },
        data: { state: "failed", lastError: "收件邮箱尚未验证" },
      });
      continue;
    }
    try {
      const fresh = await db.notificationJob.findUnique({
        where: { id: job.id },
      });
      if (fresh?.state !== "sending") continue;
      await sendMail(
        settings.email,
        `求职手账提醒 · ${event.title}`,
        `${event.title}\n执行时间：${stamp(event.start)}\n截止时间：${stamp(event.deadline)}\n以上均为北京时间\n${process.env.APP_URL}/?view=calendar\n\n完成后请回到工作台勾选已完成。`,
      );
      await db.notificationJob.update({
        where: { id: job.id },
        data: { state: "accepted", acceptedAt: new Date(), leaseUntil: null },
      });
    } catch (error) {
      const e = error as {
        code?: string;
        responseCode?: number;
        message?: string;
      };
      const uncertain = ["ETIMEDOUT", "ECONNRESET"].includes(e.code || "");
      const attempts = job.attempts + 1;
      const retry =
        !uncertain &&
        attempts <= 3 &&
        !(e.responseCode && e.responseCode >= 500);
      await db.notificationJob.update({
        where: { id: job.id },
        data: {
          attempts,
          state: uncertain ? "unknown" : retry ? "pending" : "failed",
          lastError: e.message || "邮件发送失败",
          leaseUntil: null,
          ...(retry
            ? {
                scheduledAt: new Date(
                  Date.now() + [1, 5, 15][attempts - 1] * 60000,
                ),
              }
            : {}),
        },
      });
    }
  }
}
