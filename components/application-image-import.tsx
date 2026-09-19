"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  ImageSquare,
  Sparkle,
  Trash,
  UploadSimple,
  X,
} from "@phosphor-icons/react";
import type { Data } from "@/lib/types";

export type PendingApplicationImage = {
  clientId: string;
  file: File;
  preview: string;
  status: "pending" | "uploaded" | "failed";
};

export type ApplicationImageFields = {
  company: string;
  role: string;
  city: string;
  batch: string;
  url: string;
  jd: string;
};

const maximumCount = 6;
const maximumSize = 8 * 1024 * 1024;
const maximumTotal = 24 * 1024 * 1024;
const accepted = ["image/png", "image/jpeg", "image/webp"];

async function imageForRecognition(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw Error("浏览器无法处理这张图片");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const type = file.type === "image/webp" ? "image/webp" : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, 0.86),
  );
  if (!blob) throw Error("图片压缩失败，请更换图片后重试");
  return new File(
    [blob],
    file.name.replace(/\.[^.]+$/, type === "image/webp" ? ".webp" : ".jpg"),
    {
      type,
    },
  );
}

export function ApplicationImageImport({
  images,
  existing,
  onChange,
  onRecognized,
  onDeleteExisting,
  onBusyChange,
}: {
  images: PendingApplicationImage[];
  existing: Data["files"];
  onChange: (images: PendingApplicationImage[]) => void;
  onRecognized: (result: {
    fields: ApplicationImageFields;
    confidence: Record<keyof ApplicationImageFields, number>;
    notes: string[];
  }) => void;
  onDeleteExisting: (id: string) => Promise<void>;
  onBusyChange: (busy: boolean) => void;
}) {
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const imagesRef = useRef(images);
  imagesRef.current = images;
  useEffect(
    () => () =>
      imagesRef.current.forEach((image) => URL.revokeObjectURL(image.preview)),
    [],
  );

  const add = (selected: File[]) => {
    setError("");
    if (existing.length + images.length + selected.length > maximumCount) {
      setError("一条投递最多保留 6 张招聘截图");
      return;
    }
    const invalid = selected.find(
      (file) => !accepted.includes(file.type) || file.size > maximumSize,
    );
    if (invalid) {
      setError(
        accepted.includes(invalid.type)
          ? `${invalid.name} 超过单张 8 MB 的限制`
          : `${invalid.name} 仅支持 PNG、JPG、JPEG 或 WebP`,
      );
      return;
    }
    if (
      [...images.map((image) => image.file), ...selected].reduce(
        (sum, file) => sum + file.size,
        0,
      ) > maximumTotal
    ) {
      setError("待上传图片合计不能超过 24 MB");
      return;
    }
    onChange([
      ...images,
      ...selected.map((file) => ({
        clientId: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
        status: "pending" as const,
      })),
    ]);
  };

  const move = (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const remove = (index: number) => {
    URL.revokeObjectURL(images[index].preview);
    onChange(images.filter((_, position) => position !== index));
  };

  const recognize = async () => {
    if (!images.length) return setError("请先选择需要识别的招聘截图");
    setBusy(true);
    onBusyChange(true);
    setError("");
    setNotes([]);
    try {
      const form = new FormData();
      for (const image of images)
        form.append("images", await imageForRecognition(image.file));
      const response = await fetch("/api/ai/application-images", {
        method: "POST",
        body: form,
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "图片识别失败，请重试");
      setNotes(result.notes || []);
      onRecognized(result);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "图片识别失败，请重试",
      );
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  };

  return (
    <section className="application-image-import">
      <div className="application-image-heading">
        <div>
          <span className="eyebrow">AI IMPORT</span>
          <h3>上传招聘截图，让 AI 帮我填写</h3>
          <p>支持多张图片，按当前顺序识别；保存前可修改所有内容。</p>
        </div>
        <label className="secondary image-picker">
          <UploadSimple size={16} />
          选择图片
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            onChange={(event) => {
              add(Array.from(event.target.files || []));
              event.currentTarget.value = "";
            }}
          />
        </label>
      </div>

      {!existing.length && !images.length ? (
        <label
          className="application-image-drop"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            add(Array.from(event.dataTransfer.files));
          }}
        >
          <ImageSquare size={28} />
          <strong>拖入招聘截图</strong>
          <span>最多 6 张 · 单张 8 MB · 合计 24 MB</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            onChange={(event) => add(Array.from(event.target.files || []))}
          />
        </label>
      ) : (
        <div className="application-image-list">
          {existing.map((image) => (
            <article className="application-image-card saved" key={image.id}>
              <img src={`/api/files/${image.id}`} alt={image.name} />
              <span>已保存</span>
              <div>
                <a
                  href={`/api/files/${image.id}`}
                  target="_blank"
                  rel="noreferrer"
                  title="查看原图"
                >
                  <Eye size={15} />
                </a>
                <button
                  type="button"
                  onClick={() =>
                    void onDeleteExisting(image.id).catch((reason) =>
                      setError(
                        reason instanceof Error
                          ? reason.message
                          : "删除图片失败",
                      ),
                    )
                  }
                  title="删除图片"
                >
                  <Trash size={15} />
                </button>
              </div>
            </article>
          ))}
          {images.map((image, index) => (
            <article
              className={`application-image-card ${image.status}`}
              key={image.clientId}
            >
              <img src={image.preview} alt={`待上传招聘截图 ${index + 1}`} />
              <span>
                {image.status === "failed" ? "上传失败" : `第 ${index + 1} 张`}
              </span>
              <div>
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  title="向前移动"
                >
                  <ArrowLeft size={15} />
                </button>
                <button
                  type="button"
                  disabled={index === images.length - 1}
                  onClick={() => move(index, 1)}
                  title="向后移动"
                >
                  <ArrowRight size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => remove(index)}
                  title="移除图片"
                >
                  <X size={15} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {images.length > 0 && (
        <div className="application-image-actions">
          <span>{images.length} 张待处理图片</span>
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() => void recognize()}
          >
            <Sparkle size={16} />
            {busy ? "正在识别…" : "开始识别"}
          </button>
        </div>
      )}
      {notes.length > 0 && (
        <div className="recognition-notes">
          <strong>识别提示</strong>
          {notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
