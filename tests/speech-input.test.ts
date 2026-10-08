import { describe, expect, it } from "vitest";
import {
  collectFinalTranscript,
  mergeSpeechInput,
  speechErrorMessage,
  type SpeechResultListLike,
} from "../lib/speech-input";

describe("assistant speech input", () => {
  it("keeps existing input when recognition returns no text", () => {
    expect(mergeSpeechInput("已有内容", "   ")).toBe("已有内容");
  });

  it("uses the transcript directly when the composer is empty", () => {
    expect(mergeSpeechInput("", "  帮我安排明天的面试  ")).toBe(
      "帮我安排明天的面试",
    );
  });

  it("appends recognized Chinese and English terms with one separator", () => {
    expect(mergeSpeechInput("我在华泰资管做 ABS。 ", " 负责台账核对 ")).toBe(
      "我在华泰资管做 ABS。 负责台账核对",
    );
  });

  it("collects ordered final segments and ignores interim speech", () => {
    const results = [
      { isFinal: true, 0: { transcript: "第一段" } },
      { isFinal: false, 0: { transcript: "还没说完" } },
      { isFinal: true, 0: { transcript: " second term " } },
    ] as unknown as SpeechResultListLike;

    expect(collectFinalTranscript(results)).toBe("第一段 second term");
  });

  it.each(["not-allowed", "service-not-allowed"])(
    "explains how to recover from %s microphone permission errors",
    (code) => {
      expect(speechErrorMessage(code)).toBe("请允许浏览器使用麦克风后重试");
    },
  );

  it("distinguishes silence from missing microphone hardware", () => {
    expect(speechErrorMessage("no-speech")).toBe("没有识别到语音，请再说一次");
    expect(speechErrorMessage("audio-capture")).toBe("未检测到可用的麦克风");
  });

  it("uses a recoverable message for an unknown service error", () => {
    expect(speechErrorMessage("network")).toBe(
      "语音识别暂时不可用，请稍后重试",
    );
  });
});
