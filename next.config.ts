import type { NextConfig } from "next";
const config: NextConfig = {
  turbopack: { root: process.cwd() },
  serverExternalPackages: ["mammoth", "adm-zip", "archiver"],
  devIndicators: false,
};
export default config;
