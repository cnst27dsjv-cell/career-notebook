import { describe, expect, it } from "vitest";
import {
  readApplicationImage,
  validateApplicationImageBatch,
} from "../lib/application-images";

const png = (name = "jd.png") =>
  new File([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0])], name, {
    type: "image/png",
  });

describe("application image validation", () => {
  it("accepts an image whose extension, MIME type and signature agree", async () => {
    await expect(readApplicationImage(png())).resolves.toMatchObject({
      extension: ".png",
      mime: "image/png",
    });
  });

  it("rejects a renamed non-image", async () => {
    const fake = new File(["not an image"], "jd.png", { type: "image/png" });
    await expect(readApplicationImage(fake)).rejects.toThrow("不是有效的图片");
  });

  it("limits one import to six images", () => {
    expect(() =>
      validateApplicationImageBatch(Array.from({ length: 7 }, () => png())),
    ).toThrow("最多识别 6 张");
  });
});
