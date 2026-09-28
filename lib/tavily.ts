import { z } from "zod";

const resultSchema = z.object({
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      content: z.string(),
    }),
  ),
});

export async function searchTavily(query: string) {
  const key = process.env.TAVILY_API_KEY?.trim();
  if (!key) throw Error("尚未配置 Tavily 搜索密钥");
  if (!query.trim() || query.length > 1000)
    throw Error("联网问题请控制在1000字以内，只填写需要搜索的公开信息");
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      max_results: 5,
      auto_parameters: false,
      include_answer: false,
      include_raw_content: false,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    if (response.status === 401) throw Error("Tavily 密钥无效，请检查配置");
    if ([429, 432, 433].includes(response.status))
      throw Error("Tavily 搜索额度不足或请求过于频繁，请检查用量或稍后重试");
    throw Error(`联网搜索暂不可用（${response.status}），请稍后重试`);
  }
  const data = resultSchema.parse(await response.json());
  const seen = new Set<string>();
  const sources = data.results
    .filter((r) => {
      try {
        const url = new URL(r.url);
        if (
          !["https:", "http:"].includes(url.protocol) ||
          url.username ||
          url.password ||
          !r.content.trim() ||
          seen.has(url.href)
        )
          return false;
        seen.add(url.href);
        return true;
      } catch {
        return false;
      }
    })
    .slice(0, 5)
    .map((r, i) => ({
      id: `web-${i + 1}`,
      label: r.title.slice(0, 300),
      url: r.url,
      snippet: r.content.slice(0, 3000),
    }));
  if (!sources.length)
    throw Error("本次搜索未找到可核对的结果，请换一组关键词");
  return { searchedAt: new Date().toISOString(), sources };
}
