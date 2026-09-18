import { afterEach, expect, it, vi } from "vitest";
import { sendMail } from "../cloudflare/mail";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function configure() {
  vi.stubEnv("MAIL_MODE", "live");
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("SMTP_FROM", "test@example.test");
}
it("does not send when cloud mail is unconfigured", async () => {
  vi.stubEnv("MAIL_MODE", "capture");
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(
    sendMail("recipient@example.test", "subject", "body"),
  ).rejects.toThrow("尚未配置");
  expect(fetch).not.toHaveBeenCalled();
});
it("sends text using HTTPS and the configured private credential", async () => {
  configure();
  const fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  await expect(
    sendMail("recipient@example.test", "subject", "body"),
  ).resolves.toEqual({ accepted: ["recipient@example.test"] });
  expect(JSON.parse(fetch.mock.calls[0][1].body).text).toBe("body");
});
it("marks network interruption as uncertain to prevent automatic duplicate sending", async () => {
  configure();
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
  await expect(
    sendMail("recipient@example.test", "subject", "body"),
  ).rejects.toMatchObject({ code: "ETIMEDOUT" });
});
