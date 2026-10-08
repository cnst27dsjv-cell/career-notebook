export type SpeechResultListLike = ArrayLike<{
  isFinal: boolean;
  0: { transcript: string };
}>;

export function mergeSpeechInput(current: string, transcript: string): string {
  const text = transcript.trim();
  if (!text) return current;
  return current.trimEnd() ? `${current.trimEnd()} ${text}` : text;
}

export function collectFinalTranscript(results: SpeechResultListLike): string {
  return Array.from(results)
    .filter((result) => result.isFinal)
    .map((result) => result[0].transcript.trim())
    .filter(Boolean)
    .join(" ");
}

export function speechErrorMessage(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "请允许浏览器使用麦克风后重试";
    case "no-speech":
      return "没有识别到语音，请再说一次";
    case "audio-capture":
      return "未检测到可用的麦克风";
    default:
      return "语音识别暂时不可用，请稍后重试";
  }
}
