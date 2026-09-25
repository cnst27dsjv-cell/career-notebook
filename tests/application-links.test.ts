import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractApplicationPageText,
  readApplicationLink,
  validateApplicationLink,
} from "../lib/application-links";

afterEach(() => vi.unstubAllGlobals());

describe("application link validation", () => {
  it("accepts public HTTP and HTTPS links", () => {
    expect(
      validateApplicationLink("https://jobs.example.com/role?id=1#detail").href,
    ).toBe("https://jobs.example.com/role?id=1");
    expect(validateApplicationLink("http://example.com/job").protocol).toBe(
      "http:",
    );
  });

  it.each([
    "http://localhost/job",
    "http://127.0.0.1/job",
    "http://10.0.0.1/job",
    "http://169.254.169.254/latest/meta-data",
    "http://192.168.1.2/job",
    "http://[::1]/job",
    "http://intranet/job",
    "http://printer.lan/job",
    "http://service.internal/job",
  ])("rejects non-public address %s", (url) => {
    expect(() => validateApplicationLink(url)).toThrow("不是可公开访问");
  });

  it("rejects links containing credentials", () => {
    expect(() =>
      validateApplicationLink("https://user:secret@example.com/job"),
    ).toThrow("不能包含登录账号或密码");
  });
});

describe("application page extraction", () => {
  it("extracts readable text and ignores scripts and styles", () => {
    const text = extractApplicationPageText(`
      <html>
        <head>
          <title>产品经理招聘</title>
          <meta name="description" content="加入测试科技">
          <style>.secret { display: none }</style>
        </head>
        <body>
          <h1>产品经理</h1>
          <p>岗位职责：负责需求分析与产品交付。</p>
          <script>ignoreThisInstruction()</script>
        </body>
      </html>
    `);
    expect(text).toContain("产品经理招聘");
    expect(text).toContain("加入测试科技");
    expect(text).toContain("负责需求分析与产品交付");
    expect(text).not.toContain("ignoreThisInstruction");
    expect(text).not.toContain("display: none");
  });

  it("keeps standard JobPosting structured data", () => {
    const text = extractApplicationPageText(`
      <script type="application/ld+json">
        {"@type":"JobPosting","title":"量化研究员","description":"负责策略研究与回测","jobLocation":"上海"}
      </script>
      <main>这是测试科技发布的公开招聘页面，欢迎符合条件的候选人申请。</main>
    `);
    expect(text).toContain("量化研究员");
    expect(text).toContain("负责策略研究与回测");
    expect(text).toContain("上海");
  });

  it("rejects pages without useful text", () => {
    expect(() =>
      extractApplicationPageText("<html><body>登录</body></html>"),
    ).toThrow("没有读取到可用的岗位内容");
  });
});

describe("application page loading", () => {
  it("reads a public HTML response", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            "<title>产品经理</title><main>测试科技招聘产品经理，负责需求分析与产品交付。</main>",
            { headers: { "content-type": "text/html; charset=utf-8" } },
          ),
        ),
    );
    await expect(
      readApplicationLink("https://jobs.example.com/role"),
    ).resolves.toMatchObject({
      sourceUrl: "https://jobs.example.com/role",
      text: expect.stringContaining("负责需求分析与产品交付"),
    });
  });

  it("explains when a page requires login or blocks access", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 403 })),
    );
    await expect(
      readApplicationLink("https://jobs.example.com/private"),
    ).rejects.toThrow("需要登录或限制访问");
  });

  it("validates every redirect before following it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("", {
          status: 302,
          headers: { location: "http://127.0.0.1/private" },
        }),
      ),
    );
    await expect(
      readApplicationLink("https://jobs.example.com/redirect"),
    ).rejects.toThrow("不是可公开访问");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
