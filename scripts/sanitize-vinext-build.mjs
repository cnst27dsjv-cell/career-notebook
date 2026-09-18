import { rm } from "node:fs/promises";
import { resolve } from "node:path";

await rm(resolve("dist/server/.dev.vars"), { force: true });
console.log("已移除构建目录中的本地环境变量文件");
