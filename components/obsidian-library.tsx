"use client";
import { useRef, useState } from "react";
import { useWorkspace, api } from "./context";
import { Modal, Field } from "./ui";
import { noteSource } from "@/lib/markdown-library";
import {
  readLocalNotes,
  readLocalNote,
  writeLocalNote,
  type LocalNote,
  type LocalDirectoryHandle,
} from "@/lib/local-notes";
import type { Material } from "@/lib/types";

type Preview = {
  note: LocalNote;
  content: string;
  existing?: Material;
  vault: string;
};
export default function ObsidianLibrary() {
  const { refresh } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [vault, setVault] = useState("我的面试库");
  const [notes, setNotes] = useState<LocalNote[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [writing, setWriting] = useState<Preview>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const folderSupported =
    typeof window !== "undefined" && "showDirectoryPicker" in window;
  async function connect() {
    setError("");
    setStatus("");
    try {
      const root = await (
        window as unknown as {
          showDirectoryPicker: () => Promise<LocalDirectoryHandle>;
        }
      ).showDirectoryPicker();
      setBusy(true);
      setNotes(await readLocalNotes(root));
      setVault(root.name);
      setSelected([]);
      setPreviews([]);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function preview() {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      setWriting(undefined);
      const response = await fetch("/api/data", { cache: "no-store" });
      if (!response.ok) throw Error("无法核对网站最新版本，请稍后再试");
      const fresh = await response.json();
      const result: Preview[] = [];
      for (const note of notes.filter((n) => selected.includes(n.path))) {
        const content = await readLocalNote(note);
        const source = noteSource(vault, note.path);
        result.push({
          note,
          content,
          vault,
          existing: fresh.materials.find((m: Material) => m.source === source),
        });
      }
      setPreviews(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function importNotes() {
    setBusy(true);
    setError("");
    let done = 0;
    try {
      for (const p of previews) {
        await api("/api/material-notes", {
          vault: p.vault,
          path: p.note.path,
          content: p.content,
          version: p.existing?.version,
        });
        done++;
      }
      await refresh();
      setPreviews([]);
      setSelected([]);
      setStatus(
        `已处理 ${done} 篇笔记。可在「原始文档」中查看、拆分并确认入库。相同内容不会重复创建。`,
      );
    } catch (e) {
      await refresh();
      setError(
        `已处理 ${done} 篇，后续未完成：${(e as Error).message}。请重新预览后继续。`,
      );
    } finally {
      setBusy(false);
    }
  }
  async function writeBack() {
    if (!writing?.note.handle || !writing.existing) return;
    setBusy(true);
    setError("");
    try {
      // Check the account copy again before requesting a local file write.
      const r = await fetch("/api/data");
      if (!r.ok) throw Error("无法核对网站最新版本，请稍后再试");
      const fresh = await r.json();
      const current = fresh.materials.find(
        (m: Material) => m.id === writing.existing!.id,
      );
      if (!current || current.version !== writing.existing.version)
        throw Error("网站笔记已更新，请重新预览后写回");
      await writeLocalNote(
        writing.note.handle,
        writing.content,
        writing.existing.content,
      );
      setStatus(`已写回 ${writing.note.path}，Obsidian 会读取更新后的文件。`);
      setPreviews([]);
      setWriting(undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button className="secondary" onClick={() => setOpen(true)}>
        连接 Obsidian / 导入 Markdown
      </button>
      {open && (
        <Modal
          title="统一管理已有面试笔记"
          wide
          onClose={() => {
            if (!busy) {
              setOpen(false);
              setWriting(undefined);
            }
          }}
        >
          <p>
            无需 Obsidian Sync。选择面试笔记文件夹或 Markdown
            文件，勾选后预览；确认导入才会保存到你的工作台账号。不会自动读取附件或其他笔记的双向链接。
          </p>
          <div className="card-actions">
            <button
              className="secondary"
              disabled={busy || !folderSupported}
              onClick={connect}
            >
              选择本机笔记文件夹
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              选择 Markdown 文件
            </button>
          </div>
          {!folderSupported && (
            <p className="help">
              当前浏览器不支持直接连接文件夹。可用电脑 Chrome 打开本地工作台或
              HTTPS 网站，或使用文件导入。
            </p>
          )}
          <input
            hidden
            ref={input}
            type="file"
            multiple
            accept=".md,text/markdown"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              setNotes(files.map((file) => ({ path: file.name, file })));
              setSelected([]);
              setPreviews([]);
              setError("");
              e.target.value = "";
            }}
          />
          <Field label="笔记库名称（以后导入同一库请保持一致）">
            <input
              value={vault}
              disabled={busy}
              maxLength={100}
              onChange={(e) => {
                setVault(e.target.value);
                setPreviews([]);
              }}
            />
          </Field>
          {!!notes.length && (
            <>
              <p>找到 {notes.length} 篇 Markdown；本次最多选择 30 篇。</p>
              <div className="practice-material-picker">
                {notes.map((n) => (
                  <label className="checkbox-label" key={n.path}>
                    <input
                      type="checkbox"
                      disabled={
                        busy ||
                        (!selected.includes(n.path) && selected.length >= 30)
                      }
                      checked={selected.includes(n.path)}
                      onChange={(e) => {
                        setSelected((ids) =>
                          e.target.checked
                            ? [...ids, n.path]
                            : ids.filter((id) => id !== n.path),
                        );
                        setPreviews([]);
                      }}
                    />
                    {n.path}
                  </label>
                ))}
              </div>
              <button
                className="secondary"
                disabled={busy || !selected.length || !vault.trim()}
                onClick={preview}
              >
                {busy ? "正在处理…" : "预览选中的笔记"}
              </button>
            </>
          )}
          {!!previews.length && (
            <>
              <p className="help">
                原文完整导入，保留
                Markdown、旧智能体的问答和你的回答。分类默认待确认，不会自动把智能体建议认定为你的经历。
              </p>
              {previews.map((p) => (
                <article className="paper-panel" key={p.note.path}>
                  <h3>{p.note.path}</h3>
                  <p>
                    {!p.existing
                      ? "将新增到资料库"
                      : p.existing.content === p.content
                        ? "与网站相同，不会重复导入"
                        : "与网站不同：导入会更新网站版本，旧版保留"}
                  </p>
                  <details>
                    <summary>核对本地原文</summary>
                    <p className="pre-wrap">{p.content}</p>
                  </details>
                  {p.existing && (
                    <details>
                      <summary>核对网站版本 v{p.existing.version}</summary>
                      <p className="pre-wrap">{p.existing.content}</p>
                    </details>
                  )}
                  {p.note.handle &&
                    p.existing &&
                    p.existing.content !== p.content && (
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => setWriting(p)}
                      >
                        将网站版本写回此笔记…
                      </button>
                    )}
                </article>
              ))}
              <button className="primary" disabled={busy} onClick={importNotes}>
                确认导入 / 更新 {previews.length} 篇到工作台
              </button>
            </>
          )}
          {writing && (
            <section className="notice-paper">
              <h3>确认更新本地笔记：{writing.note.path}</h3>
              <p>
                将用上面展示的网站版本替换此文件。若文件在预览后又被修改，会停止写入。请先核对两个版本。
              </p>
              <div className="card-actions">
                <button className="primary" disabled={busy} onClick={writeBack}>
                  确认写回本地笔记
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => setWriting(undefined)}
                >
                  取消
                </button>
              </div>
            </section>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {status && (
            <p className="notice-paper" role="status">
              {status}
            </p>
          )}
          <p className="help">
            连接仅在当前页面保留；刷新或离开后可重新选择文件夹。它不会后台自动同步。已导入的资料保存在工作台账号中，可跨设备使用。
          </p>
        </Modal>
      )}
    </>
  );
}
