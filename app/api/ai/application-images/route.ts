import { userFor, failure } from "@/lib/http";
import {
  parseApplicationImageRecognition,
  readApplicationImage,
  validateApplicationImageBatch,
} from "@/lib/application-images";
import { generateWithImages } from "@/lib/model";

export async function POST(request: Request) {
  try {
    await userFor(request);
    const form = await request.formData();
    const files = form
      .getAll("images")
      .filter((value): value is File => value instanceof File);
    validateApplicationImageBatch(files);
    const images = await Promise.all(files.map(readApplicationImage));
    const result = parseApplicationImageRecognition(
      await generateWithImages(
        "请把按顺序提供的多张招聘截图视为同一条岗位信息。只提取截图明确出现的内容，无法确认的字段返回空字符串。fields只能包含company、role、city、batch、url、jd。JD应按图片顺序保留岗位职责、任职要求、加分项等正文，删除导航、状态栏和重复段落。confidence为各字段0到1的可信度。notes必须是字符串数组，列出缺失、模糊或相互冲突的信息；无提示时返回空数组。返回{fields,confidence,notes}。",
        { imageCount: images.length },
        images.map(({ buffer, mime }) => ({ data: buffer, mime })),
      ),
    );
    return Response.json(result);
  } catch (error) {
    return failure(error);
  }
}
