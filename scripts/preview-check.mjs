import { chromium } from "@playwright/test";
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://127.0.0.1:3040");
await page.getByRole("button", { name: "先看看示例手账" }).click();
await page.getByRole("heading", { name: "每一步，都离理想更近。" }).waitFor();
await page.screenshot({ path: "06_临时文件/desktop.png", fullPage: true });
console.log("Desktop", await page.title(), "errors", errors);
await page.setViewportSize({ width: 375, height: 812 });
await page.screenshot({ path: "06_临时文件/mobile.png", fullPage: true });
console.log(
  "mobile widths",
  await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    viewport: innerWidth,
  })),
);
await browser.close();
