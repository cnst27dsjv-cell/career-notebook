import http from "node:http";
import { chmod, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

const host = "127.0.0.1";
const port = 3043;
const token = randomBytes(24).toString("hex");
const target = resolve(process.cwd(), ".env.cloudflare.local");
const escape = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const page = (message = "") => `<!doctype html><html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>配置 Supabase 数据库</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f3ead8;color:#3d3025;font-family:system-ui,sans-serif}
main{width:min(680px,calc(100% - 40px));padding:32px;background:#fffaf0;border:1px solid #d6c4a7;border-radius:8px;box-shadow:0 16px 50px #4e35251a}
h1{margin:0 0 8px;font-size:24px}p,li{color:#705d4a;line-height:1.6}label{display:block;margin:20px 0 8px;font-weight:700}
input{box-sizing:border-box;width:100%;padding:12px;border:1px solid #bda98b;border-radius:5px;background:white;font-size:15px}
button{width:100%;margin-top:20px;padding:12px;border:0;border-radius:5px;background:#7c1020;color:white;font-size:16px;cursor:pointer}
.message{color:#7c1020;font-weight:700}.note{font-size:13px}code{background:#eee3d1;padding:2px 5px;border-radius:3px}
</style></head><body><main><h1>配置 Supabase 数据库</h1>
<p>在 Supabase 项目顶部点击 <b>Connect</b>，展开 <b>Connection String</b>。复制两条 URI，并把其中的 <code>[YOUR-PASSWORD]</code> 替换成创建项目时保存的数据库密码。</p>
<ol><li>Transaction pooler：端口通常为 6543，给 Cloudflare Workers 使用。</li><li>Session pooler：端口通常为 5432，给 Prisma 数据库迁移使用。</li></ol>
<p class="note">内容只保存到这台电脑的私有文件，不会显示在提交记录中。</p>
${message ? `<p class="message">${escape(message)}</p>` : ""}
<form method="post"><input type="hidden" name="token" value="${token}">
<label for="runtime">Transaction pooler URI</label><input id="runtime" name="runtime" type="password" required autocomplete="off" placeholder="postgresql://...:6543/postgres">
<label for="direct">Session pooler URI</label><input id="direct" name="direct" type="password" required autocomplete="off" placeholder="postgresql://...:5432/postgres">
<button type="submit">安全保存到本机</button></form></main></body></html>`;

function valid(raw, port) {
  try {
    const url = new URL(raw);
    return (
      ["postgres:", "postgresql:"].includes(url.protocol) &&
      url.hostname.endsWith(".supabase.com") &&
      url.port === String(port) &&
      Boolean(url.username && url.password)
    );
  } catch {
    return false;
  }
}

const server = http.createServer(async (request, response) => {
  if (request.method === "GET") {
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(page());
    return;
  }
  if (request.method !== "POST") {
    response.writeHead(405).end();
    return;
  }
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 20000) {
      response.writeHead(413).end();
      return;
    }
  }
  const form = new URLSearchParams(body);
  const runtime = form.get("runtime")?.trim() || "";
  const direct = form.get("direct")?.trim() || "";
  if (
    form.get("token") !== token ||
    !valid(runtime, 6543) ||
    !valid(direct, 5432)
  ) {
    response.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    response.end(
      page(
        "连接地址格式不正确，请确认分别复制了 6543 和 5432 的完整 URI，并替换密码占位符。",
      ),
    );
    return;
  }
  await writeFile(
    target,
    `DATABASE_URL=${JSON.stringify(runtime)}\nDIRECT_URL=${JSON.stringify(direct)}\n`,
    { mode: 0o600 },
  );
  await chmod(target, 0o600);
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(page("保存成功，可以关闭这个页面并回到 Codex。"));
  setTimeout(() => server.close(), 500);
});
server.listen(port, host, () =>
  console.log(`Supabase 私密配置页：http://${host}:${port}`),
);
