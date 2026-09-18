/** Cloud deployment uses Resend's HTTPS API; SMTP remains available locally. */
export async function sendMail(to: string, subject: string, text: string) {
  if (
    process.env.MAIL_MODE !== "live" ||
    !process.env.RESEND_API_KEY ||
    !process.env.SMTP_FROM
  )
    throw new Error("尚未配置云端邮件服务");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.SMTP_FROM,
      to: [to],
      subject,
      text,
    }),
    signal: AbortSignal.timeout(20000),
  }).catch(() => {
    throw Object.assign(new Error("邮件请求中断，无法确定是否已发出"), {
      code: "ETIMEDOUT",
    });
  });
  if (!response.ok)
    throw Object.assign(new Error(`邮件服务返回 ${response.status}`), {
      responseCode:
        response.status >= 500 || response.status === 429 ? 450 : 550,
    });
  return { accepted: [to] };
}
