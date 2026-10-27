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
  const hotjobUrl =
    "https://wecruit.hotjob.cn/SU6419745cbef57c635fe10142/pb/posDetail.html?postId=228649&postType=campus";

  it("reads Hotjob public job details instead of the JavaScript page shell", async () => {
    const request = vi.fn().mockResolvedValue(
      Response.json({
        state: "200",
        data: {
          postName: "投资银行债券业务岗",
          company: "华泰联合证券有限责任公司",
          workPlaceStr: "北京市、南京市、上海市、深圳市",
          projectName: "2026年秋招（总部）",
          workContent: "参与境内外债券项目执行。\n维护客户关系。",
          serviceCondition: "2027年应届毕业生，硕士研究生及以上学历。",
          endDate: "2026-11-01 23:59:59",
          deliveryCount: 123,
        },
      }),
    );
    vi.stubGlobal("fetch", request);
    const page = await readApplicationLink(hotjobUrl);
    expect(page.sourceUrl).toBe(hotjobUrl);
    expect(page.finalUrl).toBe(hotjobUrl);
    for (const expected of [
      "投资银行债券业务岗",
      "华泰联合证券有限责任公司",
      "北京市、南京市、上海市、深圳市",
      "2026年秋招（总部）",
      "维护客户关系。",
      "2027年应届毕业生",
      "2026-11-01 23:59:59",
    ])
      expect(page.text).toContain(expected);
    expect(page.text).not.toContain("123");
    expect(request).toHaveBeenCalledTimes(1);
    const [url, options] = request.mock.calls[0];
    expect(String(url)).toBe(
      "https://wecruit.hotjob.cn/wecruit/positionInfo/listPositionDetail/SU6419745cbef57c635fe10142?iSaJAx=isAjax&request_locale=zh_CN",
    );
    expect(options.method).toBe("POST");
    expect(options.redirect).toBe("manual");
    expect(options.body.toString()).toBe("postId=228649&recruitType=1");
  });

  it.each([
    { state: "1017", data: null },
    {
      state: "200",
      data: { postName: "职位", workContent: "", serviceCondition: "" },
    },
  ])(
    "reports unavailable Hotjob details without treating them as a job",
    async (payload) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(payload)));
      await expect(readApplicationLink(hotjobUrl)).rejects.toThrow(
        "未读取到岗位正文",
      );
    },
  );

  it("does not follow Hotjob API redirects to a login or private address", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("", {
          status: 302,
          headers: { location: "http://127.0.0.1/private" },
        }),
      ),
    );
    await expect(readApplicationLink(hotjobUrl)).rejects.toThrow(
      "需要登录或限制访问",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

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
