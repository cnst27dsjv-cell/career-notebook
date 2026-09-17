import type { Metadata } from "next";
import "@fontsource/pinyon-script/400.css";
import "@fontsource/cormorant-garamond/400.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/italiana/400.css";
import "@fontsource/source-serif-4/400.css";
import "@fontsource/source-serif-4/600.css";
import "./globals.css";
export const metadata: Metadata = {
  title: "求职手账 · 把每一步，写向未来",
  description:
    "属于你的秋招与春招工作台，记录机会、安排日程、认真准备每一场面试。",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
