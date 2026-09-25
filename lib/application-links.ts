const maximumResponseBytes = 1024 * 1024;
const maximumRedirects = 3;

const blockedHostnames = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
]);

function isBlockedIpv4(hostname: string) {
  const parts = hostname.split(".");
  if (
    parts.length !== 4 ||
    parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)
  )
    return false;
  const [first, second] = parts.map(Number);
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

export function validateApplicationLink(value: string) {
  const input = value.trim();
  if (!input) throw Error("请先粘贴招聘链接");
  if (input.length > 2048) throw Error("招聘链接过长，请检查后重试");
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw Error("招聘链接格式不正确，请输入完整的 http 或 https 地址");
  }
  if (!["http:", "https:"].includes(url.protocol))
    throw Error("招聘链接仅支持 http 或 https 地址");
  if (url.username || url.password)
    throw Error("招聘链接不能包含登录账号或密码");
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    !hostname ||
    blockedHostnames.has(hostname) ||
    !hostname.includes(".") ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".home") ||
    hostname.endsWith(".lan") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.includes(":") ||
    isBlockedIpv4(hostname)
  )
    throw Error("该地址不是可公开访问的招聘网页");
  url.hash = "";
  return url;
}

function decodeHtml(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    hellip: "…",
    ldquo: "“",
    lsquo: "‘",
    lt: "<",
    mdash: "—",
    nbsp: " ",
    quot: '"',
    rdquo: "”",
    rsquo: "’",
  };
  return value.replace(
    /&(#x[\da-f]+|#\d+|[a-z]+);/gi,
    (entity, code: string) => {
      if (code[0] !== "#") return named[code.toLowerCase()] ?? entity;
      const value = Number.parseInt(
        code.slice(code[1]?.toLowerCase() === "x" ? 2 : 1),
        code[1]?.toLowerCase() === "x" ? 16 : 10,
      );
      return Number.isFinite(value) && value > 0 && value <= 0x10ffff
        ? String.fromCodePoint(value)
        : entity;
    },
  );
}

const textOfJson = (value: unknown): string[] => {
  if (typeof value === "string") return [value];
  if (typeof value === "number") return [String(value)];
  if (Array.isArray(value)) return value.flatMap(textOfJson);
  if (value && typeof value === "object")
    return Object.values(value as Record<string, unknown>).flatMap(textOfJson);
  return [];
};

function structuredJobText(html: string) {
  const parts: string[] = [];
  const pattern =
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    try {
      const value = JSON.parse(decodeHtml(match[1]).trim());
      const records = Array.isArray(value) ? value : [value];
      for (const record of records) {
        if (
          record &&
          typeof record === "object" &&
          JSON.stringify(record).includes("JobPosting")
        )
          parts.push(...textOfJson(record));
      }
    } catch {
      // Invalid third-party structured data is ignored in favor of visible text.
    }
  }
  return parts.join("\n");
}

export function extractApplicationPageText(html: string) {
  const title = decodeHtml(
    html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "",
  );
  const description = decodeHtml(
    html.match(
      /<meta\b[^>]*(?:name|property)\s*=\s*["'](?:description|og:description)["'][^>]*content\s*=\s*["']([^"']*)["'][^>]*>/i,
    )?.[1] || "",
  );
  const structured = structuredJobText(html);
  const visible = decodeHtml(
    html
      .replace(
        /<(script|style|noscript|svg|canvas)\b[^>]*>[\s\S]*?<\/\1>/gi,
        " ",
      )
      .replace(/<!--([\s\S]*?)-->/g, " ")
      .replace(
        /<(br|\/p|\/div|\/li|\/section|\/article|\/h[1-6])\b[^>]*>/gi,
        "\n",
      )
      .replace(/<[^>]+>/g, " "),
  );
  const text = [title, description, structured, visible]
    .join("\n")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim()
    .slice(0, 100000);
  if (text.length < 30)
    throw Error(
      "没有读取到可用的岗位内容。该页面可能需要登录，请手动填写或上传截图",
    );
  return text;
}

async function responseText(response: Response) {
  const length = Number(response.headers.get("content-length") || 0);
  if (length > maximumResponseBytes)
    throw Error("招聘网页内容过大，请改为上传截图");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximumResponseBytes) {
      await reader.cancel();
      throw Error("招聘网页内容过大，请改为上传截图");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

export async function readApplicationLink(value: string) {
  const original = validateApplicationLink(value);
  let current = original;
  for (let redirects = 0; redirects <= maximumRedirects; redirects += 1) {
    let response: Response;
    try {
      response = await fetch(current, {
        headers: {
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
          "User-Agent": "CareerNotebook/1.0 (+https://career-notebook.cn)",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      throw Error("招聘网页连接超时或无法访问，请手动填写或上传截图");
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirects === maximumRedirects)
        throw Error("招聘网页跳转次数过多，请手动填写或上传截图");
      current = validateApplicationLink(new URL(location, current).toString());
      continue;
    }
    if ([401, 403].includes(response.status))
      throw Error("该招聘页面需要登录或限制访问，请手动填写或上传截图");
    if (!response.ok)
      throw Error(`招聘网页暂时无法访问（${response.status}），请稍后重试`);
    const contentType = response.headers.get("content-type") || "";
    if (
      !/(?:text\/html|application\/xhtml\+xml|text\/plain)/i.test(contentType)
    )
      throw Error("该链接不是可读取的招聘网页，请手动填写或上传截图");
    const body = await responseText(response);
    return {
      sourceUrl: value.trim(),
      finalUrl: current.toString(),
      text:
        /text\/plain/i.test(contentType) && body.trim().length >= 30
          ? body.trim().slice(0, 100000)
          : extractApplicationPageText(body),
    };
  }
  throw Error("招聘网页无法访问，请手动填写或上传截图");
}
