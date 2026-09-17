import http from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

const host = "127.0.0.1";
const port = 3041;
const token = randomBytes(24).toString("hex");
const envPath = resolve(process.cwd(), ".env");

const page = (message = "") => `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>配置求职手账 AI</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f3ead8;color:#3d3025;font-family:system-ui,sans-serif}
main{width:min(420px,calc(100% - 40px));padding:32px;background:#fffaf0;border:1px solid #d6c4a7;border-radius:8px;box-shadow:0 16px 50px #4e35251a}
h1{margin:0 0 8px;font-size:24px}p{color:#705d4a;line-height:1.6}label{display:block;margin:22px 0 8px;font-weight:700}
input{box-sizing:border-box;width:100%;padding:12px;border:1px solid #bda98b;border-radius:5px;background:white;font-size:16px}
button{width:100%;margin-top:16px;padding:12px;border:0;border-radius:5px;background:#7c1020;color:white;font-size:16px;cursor:pointer}
.message{color:#7c1020;font-weight:700}.note{font-size:13px}
</style></head><body><main><h1>配置 AI 密钥</h1><p>密钥只会保存到这台电脑上的求职手账配置，不会显示或发送到聊天。</p>
${message ? `<p class="message">${message}</p>` : ""}
<form method="post"><input type="hidden" name="token" value="${token}"><label for="key">AI API Key</label>
<input id="key" name="key" type="password" required autocomplete="off" autofocus placeholder="在这里粘贴密钥">
<button type="submit">保存到本机</button></form><p class="note">服务地址和模型名请在私有 .env 文件中配置。保存后可以关闭本页。</p></main></body></html>`;

const server = http.createServer(async (request, response) => {
  if (request.method === "GET") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
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
  const key = form.get("key")?.trim() || "";
  if (form.get("token") !== token || key.length < 10) {
    response.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    response.end(page("密钥为空或格式不正确，请重新填写。"));
    return;
  }
  const env = await readFile(envPath, "utf8");
  const next = env.replace(/^MODEL_API_KEY=.*$/m, `MODEL_API_KEY=${JSON.stringify(key)}`);
  await writeFile(envPath, next, { mode: 0o600 });
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  response.end(page("保存成功，可以关闭这个页面。"));
  setTimeout(() => server.close(), 500);
});

server.listen(port, host, () => {
  console.log(`AI 密钥配置页已启动：http://${host}:${port}`);
});
