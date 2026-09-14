import nodemailer from "nodemailer";
export function transporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
    connectionTimeout: 10000,
    socketTimeout: 20000,
  });
}
export async function sendMail(to: string, subject: string, text: string) {
  if (!process.env.SMTP_HOST) throw new Error("尚未配置发件服务");
  if (
    process.env.MAIL_MODE !== "live" &&
    !["127.0.0.1", "localhost", "mail"].includes(process.env.SMTP_HOST)
  )
    throw new Error("测试模式仅允许本地邮件捕获服务");
  return transporter().sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    text,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
}
