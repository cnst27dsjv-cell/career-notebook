export async function readRecognitionResponse(response: Response) {
  if (response.status === 401)
    throw Error(
      "登录状态已失效，请重新登录后再识别。当前图片和填写内容已保留。",
    );
  let result;
  try {
    result = await response.json();
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw Error(
      `识别服务返回异常（HTTP ${response.status}），当前图片和填写内容已保留，请稍后重试。`,
    );
  }
  if (!response.ok) throw Error(result.error || "识别失败，请重试");
  return result;
}
