"use client";
import { useEffect, useRef, useState } from "react";
import { FileText, Trash, UploadSimple } from "@phosphor-icons/react";

export type AssistantFile = {
  id: string;
  name: string;
  mime: string;
  size: number;
  purpose: string;
  reusable: boolean;
  extractionStatus: string;
  extractionError: string;
  series?: string;
  number?: number;
  current?: boolean;
  target?: string;
};

type Catalog = { resumes: AssistantFile[]; files: AssistantFile[] };

export function AssistantFilePicker({
  selected,
  onConfirm,
}: {
  selected: AssistantFile[];
  onConfirm: (files: AssistantFile[]) => void;
}) {
  const [catalog, setCatalog] = useState<Catalog>({ resumes: [], files: [] });
  const [draft, setDraft] = useState(selected);
  const [reusable, setReusable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState<string[]>([]);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function load() {
    const response = await fetch("/api/assistant/files");
    const result = await response.json();
    if (!response.ok) throw Error(result.error || "文件列表加载失败");
    setCatalog(result);
  }
  useEffect(() => {
    load().catch((reason) => setError(reason.message));
  }, []);

  async function ready(file: AssistantFile) {
    if (file.extractionStatus === "ready") return file;
    setPreparing((items) => [...items, file.id]);
    try {
      const response = await fetch("/api/assistant/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: file.id }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "文件解析失败");
      setCatalog((current) => ({
        resumes: current.resumes.map((item) =>
          item.id === file.id ? { ...item, ...result } : item,
        ),
        files: current.files.map((item) =>
          item.id === file.id ? { ...item, ...result } : item,
        ),
      }));
      return { ...file, ...result } as AssistantFile;
    } finally {
      setPreparing((items) => items.filter((id) => id !== file.id));
    }
  }

  async function toggle(file: AssistantFile) {
    setError("");
    if (draft.some((item) => item.id === file.id)) {
      setDraft((items) => items.filter((item) => item.id !== file.id));
      return;
    }
    if (draft.length >= 5) {
      setError("每条消息最多选择 5 个文件");
      return;
    }
    try {
      const prepared = await ready(file);
      setDraft((items) => [...items, prepared]);
    } catch (reason) {
      setError((reason as Error).message);
      await load().catch(() => {});
    }
  }

  async function upload(files: File[]) {
    if (!files.length) return;
    if (draft.length + files.length > 5) {
      setError("每条消息最多选择 5 个文件");
      return;
    }
    setBusy(true);
    setError("");
    const uploaded: AssistantFile[] = [];
    try {
      for (const file of files) {
        const form = new FormData();
        form.set("file", file);
        form.set("reusable", String(reusable));
        const response = await fetch("/api/assistant/files", {
          method: "POST",
          body: form,
        });
        const result = await response.json();
        if (!response.ok)
          throw Error(`${file.name}：${result.error || "上传失败"}`);
        uploaded.push(result);
      }
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      if (uploaded.length)
        setDraft((items) => [
          ...items,
          ...uploaded.filter(
            (file) => !items.some((item) => item.id === file.id),
          ),
        ]);
      await load().catch(() => {});
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function removeReusable(file: AssistantFile) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/assistant/files?id=${encodeURIComponent(file.id)}`,
        { method: "DELETE" },
      );
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "删除失败");
      setDraft((items) => items.filter((item) => item.id !== file.id));
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const row = (file: AssistantFile, label: string, deletable = false) => {
    const checked = draft.some((item) => item.id === file.id);
    const isPreparing = preparing.includes(file.id);
    return (
      <div className="assistant-file-row" key={file.id}>
        <button
          type="button"
          className={checked ? "selected" : ""}
          disabled={busy || isPreparing}
          onClick={() => void toggle(file)}
        >
          <FileText size={20} />
          <span>
            <strong>{label}</strong>
            <small>
              {file.name} · {Math.max(1, Math.round(file.size / 1024))} KB
            </small>
            <small>
              {isPreparing
                ? "正在读取正文…"
                : file.extractionStatus === "ready"
                  ? "正文可用"
                  : file.extractionStatus === "failed"
                    ? file.extractionError || "解析失败，可点击重试"
                    : "首次选择时读取正文"}
            </small>
          </span>
          <b aria-hidden="true">{checked ? "✓" : "+"}</b>
        </button>
        {deletable && (
          <button
            type="button"
            className="assistant-file-delete"
            aria-label={`删除 ${file.name}`}
            disabled={busy}
            onClick={() => void removeReusable(file)}
          >
            <Trash size={17} />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="assistant-file-picker">
      <p className="muted">
        只有你选中的文件会供助理读取。PDF
        需包含可复制文字，扫描件请使用招聘截图入口。
      </p>
      <button
        type="button"
        className="assistant-file-upload"
        disabled={busy}
        onClick={() => input.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void upload(Array.from(event.dataTransfer.files));
        }}
      >
        <UploadSimple size={24} />
        <span>{busy ? "正在读取文件…" : "选择或拖入 PDF、DOCX、TXT"}</span>
      </button>
      <input
        ref={input}
        hidden
        multiple
        type="file"
        accept=".pdf,.docx,.txt"
        onChange={(event) => void upload(Array.from(event.target.files || []))}
      />
      <label className="assistant-file-reusable">
        <input
          type="checkbox"
          checked={reusable}
          disabled={busy}
          onChange={(event) => setReusable(event.target.checked)}
        />
        新上传的文件以后也能在其他对话中选择
      </label>
      {error && <p className="assistant-file-error">{error}</p>}
      {!!catalog.resumes.length && (
        <section>
          <h3>已有简历</h3>
          {catalog.resumes.map((file) =>
            row(
              file,
              `${file.series} v${file.number}${file.current ? " · 当前版" : ""}`,
            ),
          )}
        </section>
      )}
      {!!catalog.files.length && (
        <section>
          <h3>可跨对话使用</h3>
          {catalog.files.map((file) => row(file, file.name, true))}
        </section>
      )}
      <div className="assistant-file-actions">
        <span>已选择 {draft.length} / 5</span>
        <button
          type="button"
          className="primary"
          disabled={busy || preparing.length > 0}
          onClick={() => onConfirm(draft)}
        >
          使用这些文件
        </button>
      </div>
    </div>
  );
}
