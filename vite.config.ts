import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
const root = fileURLToPath(new URL(".", import.meta.url));
const adapters: Record<string, string> = {
  "lib/db": "cloudflare/db.ts",
  "lib/mail": "cloudflare/mail.ts",
  "lib/extract": "cloudflare/extract.ts",
  "lib/runtime-storage": "cloudflare/storage.ts",
};
export default defineConfig({
  plugins: [
    {
      name: "career-cloud-adapters",
      enforce: "pre",
      resolveId(source, importer) {
        if (source === "@prisma/client")
          return path.resolve(root, "node_modules/.prisma/client/wasm.js");
        const resolved = source.startsWith("@/")
          ? path.resolve(root, source.slice(2))
          : source.startsWith(".") && importer
            ? path.resolve(path.dirname(importer), source)
            : source;
        const relative = path.relative(root, resolved).replace(/\.ts$/, "");
        if (adapters[relative]) return path.resolve(root, adapters[relative]);
      },
    },
    vinext(),
    cloudflare({
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
    }),
  ],
});
