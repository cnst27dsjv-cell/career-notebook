import type { PrismaClient } from "@prisma/client";
import { current } from "./context";
export const db = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = current().db;
    const value = Reflect.get(client, property);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
