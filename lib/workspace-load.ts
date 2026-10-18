import type { Data } from "./types";

// Keep the deadline active until the body has arrived, not just the headers.
export async function loadWorkspaceData(
  initial: boolean,
): Promise<Data | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    try {
      const response = await fetch(
        initial ? "/api/data?scope=core" : "/api/data",
        {
          cache: "no-store",
          signal: controller.signal,
        },
      );
      if (response.status === 401) return null;
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "加载失败");
      return result;
    } catch (error) {
      const disconnected = error instanceof TypeError;
      if (attempt === 0 && (controller.signal.aborted || disconnected))
        continue;
      if (controller.signal.aborted)
        throw new Error("加载超时，已自动重试。请检查网络后重新加载。");
      if (disconnected)
        throw new Error("网络连接中断，已自动重试。请检查网络后重新加载。");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  return null;
}
