import { AsyncLocalStorage } from "node:async_hooks";
import type { PrismaClient } from "@prisma/client";
import type { FileBucket } from "../lib/storage";
export const context = new AsyncLocalStorage<{
  db: PrismaClient;
  files: FileBucket;
}>();
export function current() {
  const value = context.getStore();
  if (!value) throw new Error("Cloudflare request context is unavailable");
  return value;
}
