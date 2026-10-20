"use client";
import { createContext, useContext } from "react";
import type { Data, Interview } from "@/lib/types";
export const Context = createContext<{
  data: Data;
  refresh: () => Promise<void>;
  acceptInterview?: (session: Interview) => void;
  notify: (s: string) => void;
  mutate: (v: Record<string, unknown>) => Promise<void>;
  mutateOptimistic: (
    v: Record<string, unknown>,
    apply: (current: Data) => Data,
  ) => Promise<unknown>;
}>({} as never);
export const useWorkspace = () => useContext(Context);
export const dayKey = (d: string | Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(d));
export const clock = (d: string | null) =>
  d
    ? new Date(d).toLocaleTimeString("zh-CN", {
        timeZone: "Asia/Shanghai",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "待安排";
export const dateLabel = (d: string | null) =>
  d
    ? new Date(d).toLocaleDateString("zh-CN", {
        timeZone: "Asia/Shanghai",
        month: "long",
        day: "numeric",
      })
    : "未设置";
export const inputDate = (d: string | null | undefined) =>
  d
    ? new Date(new Date(d).getTime() + 8 * 3600000).toISOString().slice(0, 16)
    : "";
export const iso = (v: FormDataEntryValue | null) =>
  v ? new Date(String(v) + "+08:00").toISOString() : null;
export async function api(url: string, values: unknown) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
  if (r.status === 401) throw Error("登录状态已失效，请重新登录后再操作。");
  let result;
  try {
    result = await r.json();
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw Error(
      `服务返回异常（HTTP ${r.status}），暂时无法确认修改是否保存。请保留当前填写内容，核对记录后再重试。`,
    );
  }
  if (!r.ok) throw Error(result.error || "操作失败，请重试");
  return result;
}
