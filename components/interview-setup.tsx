"use client";
import { useState } from "react";
import type { Interview, Prep } from "@/lib/types";
import { useWorkspace, api } from "./context";
import { Field, Modal } from "./ui";
export default function InterviewSetup({
  prep,
  onClose,
  onCreated,
}: {
  prep: Prep;
  onClose: () => void;
  onCreated: (session: Interview) => void;
}) {
  const { data } = useWorkspace();
  const [selected, setSelected] = useState<string[]>([]);
  const [resume, setResume] = useState(false);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function begin(web: boolean) {
    setBusy(true);
    setError("");
    try {
      onCreated(
        await api("/api/interviews", {
          action: "research",
          preparationId: prep.id,
          materialIds: selected,
          includeResume: resume,
          search: web,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="准备这次练习" onClose={onClose} wide>
      <p>
        为 {prep.company} · {prep.role} · {prep.round}{" "}
        选择资料。只把勾选的正文用于本次出题、追问和复盘。
      </p>
      {prep.resumeId && (
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={resume}
            disabled={busy}
            onChange={(e) => setResume(e.target.checked)}
          />
          读取此准备关联的简历正文
        </label>
      )}
      <Field label={`选择历史练习或 Obsidian 笔记（${selected.length}/8）`}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索题目、经历或笔记正文…"
        />
      </Field>
      <div className="practice-material-picker">
        {data.materials
          .filter((m) => `${m.title} ${m.content}`.includes(search))
          .map((m) => (
            <label className="checkbox-label" key={m.id}>
              <input
                type="checkbox"
                disabled={
                  busy || (!selected.includes(m.id) && selected.length >= 8)
                }
                checked={selected.includes(m.id)}
                onChange={(e) =>
                  setSelected((ids) =>
                    e.target.checked
                      ? [...ids, m.id]
                      : ids.filter((id) => id !== m.id),
                  )
                }
              />
              <span>
                {m.title}
                <small>
                  {" "}
                  · v{m.version} · {m.source}
                </small>
              </span>
            </label>
          ))}
      </div>
      <p className="help">
        本场使用文本模型：{data.services.generalModel || "未配置"}。长资料会截取正文用于本次练习，原文完整保留。联网仅搜索公司、岗位和轮次，不发送你的简历与笔记。
      </p>
      {error && (
        <p role="alert" className="notice-paper">
          {error}
        </p>
      )}
      <div className="card-actions">
        <button className="primary" disabled={busy} onClick={() => begin(true)}>
          {busy ? "正在准备…" : "联网调研并出题"}
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => begin(false)}
        >
          仅根据 JD 和所选资料出题
        </button>
      </div>
    </Modal>
  );
}
