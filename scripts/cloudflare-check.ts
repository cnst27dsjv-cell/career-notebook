import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { request, chromium } from "@playwright/test";
import AdmZip from "adm-zip";
process.env.SEEDING = "true";
const { auth } = await import("../lib/auth");
const { db } = await import("../lib/db");
const email = `cf-qa-${Date.now()}@career.local`;
const password = randomBytes(20).toString("hex");
const { user } = await auth.api.signUpEmail({
  body: { email, password, name: "Cloudflare 验收" },
});
const ctx = await request.newContext({ baseURL: "http://127.0.0.1:3042" });
try {
  assert.equal((await ctx.get("/api/health")).status(), 200);
  assert.equal((await ctx.get("/api/data")).status(), 401);
  const login = await ctx.post("/api/auth/sign-in/email", {
    data: { email, password },
  });
  assert.equal(login.status(), 200, await login.text());
  assert.equal((await ctx.get("/api/data")).status(), 200);
  console.log("PASS Workers 数据库、登录和未登录隔离");
  const zip = new AdmZip();
  zip.addFile(
    "[Content_Types].xml",
    Buffer.from(
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
    ),
  );
  zip.addFile(
    "word/document.xml",
    Buffer.from(
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>云端资料提取验收</w:t></w:r></w:p></w:body></w:document>',
    ),
  );
  const extracted = await ctx.post("/api/files", {
    multipart: {
      mode: "import",
      file: {
        name: "test.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        buffer: zip.toBuffer(),
      },
    },
  });
  assert.equal(extracted.status(), 200, await extracted.text());
  assert.match((await extracted.json()).text, /云端资料提取验收/);
  console.log("PASS Workers DOCX 全文提取");
  const bytes = Buffer.from("%PDF-1.4\nCloudflare test\n%%EOF");
  const uploaded = await ctx.post("/api/files", {
    multipart: {
      series: "云端验收",
      file: { name: "test.pdf", mimeType: "application/pdf", buffer: bytes },
    },
  });
  assert.equal(uploaded.status(), 200, await uploaded.text());
  const data = await (await ctx.get("/api/data")).json();
  const file = data.files[0];
  const downloaded = await ctx.get(`/api/files/${file.id}`);
  assert.deepEqual(await downloaded.body(), bytes);
  const anonymous = await request.newContext({
    baseURL: "http://127.0.0.1:3042",
  });
  try {
    assert.equal((await anonymous.get(`/api/files/${file.id}`)).status(), 401);
  } finally {
    await anonymous.dispose();
  }
  const exported = await ctx.get("/api/export?format=zip");
  assert.equal(exported.status(), 200);
  const backup = new AdmZip(await exported.body());
  assert(backup.getEntry("data.json"));
  assert(backup.getEntries().some((e) => e.entryName.startsWith("files/")));
  console.log("PASS 本地 R2 上传、鉴权下载与 ZIP 导出");
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const browserContext = await browser.newContext({
      storageState: await ctx.storageState(),
      viewport: { width: 375, height: 812 },
    });
    const page = await browserContext.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://127.0.0.1:3042/?view=resumes");
    await page.locator(".notebook-page").waitFor();
    assert.equal(
      await page.locator("body").evaluate((e) => e.scrollWidth > innerWidth),
      false,
    );
    assert.deepEqual(errors, []);
    console.log("PASS Workers 登录后页面渲染及手机宽度");
  } finally {
    await browser.close();
  }
} finally {
  const files = await db.fileAsset.findMany({ where: { userId: user.id } });
  const { execFileSync } = await import("node:child_process");
  for (const file of files) {
    execFileSync(
      process.execPath,
      [
        "node_modules/wrangler/bin/wrangler.js",
        "r2",
        "object",
        "delete",
        `career-notebook-files/${file.key}`,
        "--local",
      ],
      { stdio: "ignore" },
    );
  }
  await db.resume.deleteMany({ where: { userId: user.id } });
  await db.fileAsset.deleteMany({ where: { userId: user.id } });
  await db.user.delete({ where: { id: user.id } });
  await ctx.dispose();
  await db.$disconnect();
}
