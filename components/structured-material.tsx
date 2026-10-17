"use client";
import { useState } from "react";
import { libraryTypes, materialFormat } from "@/lib/library-organization";
import type { Material } from "@/lib/types";
import { displayNoteSource } from "@/lib/markdown-library";
import { api, useWorkspace } from "./context";
import { Field, Modal } from "./ui";
export function StructuredMaterial({
  item,
  onSource,
}: {
  item: Material;
  onSource: (id: string) => void;
}) {
  const { refresh } = useWorkspace();
  const [adding, setAdding] = useState(false);
  const [answer, setAnswer] = useState("");
  const [context, setContext] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const structure = item.structure || {};
  const type = materialFormat(item) as keyof typeof libraryTypes;
  return (
    <article className="material-card paper-panel">
      <div className="material-head">
        <span className="status-badge">{libraryTypes[type]}</span>
        <small>
          {item.roleScope || item.category} · v{item.version}
        </small>
      </div>
      <h2>{item.title}</h2>
      {type === "question" ? (
        <div className="answer-versions">
          {(structure.answers || []).map((a, i, all) => (
            <details key={i} open={i === all.length - 1}>
              <summary>
                回答版本 {i + 1} · {a.source} ·{" "}
                {new Date(a.at).toLocaleDateString("zh-CN")}
              </summary>
              <h3>我的回答</h3>
              <p className="pre-wrap">
                {a.answer || "尚未填写，可追加自己的回答。"}
              </p>
              {a.context && (
                <>
                  <h3>背景与相关介绍</h3>
                  <p className="pre-wrap">{a.context}</p>
                </>
              )}
              {a.feedback && (
                <details>
                  <summary>建议 / 点评（非经历事实）</summary>
                  <p className="pre-wrap">{a.feedback}</p>
                </details>
              )}
              {a.documentId && (
                <button
                  className="text-button"
                  onClick={() => onSource(a.documentId!)}
                >
                  查看来源原文 · v{a.documentVersion}
                </button>
              )}
              {a.quote && (
                <details>
                  <summary>入库时的原文片段</summary>
                  <blockquote className="pre-wrap">{a.quote}</blockquote>
                </details>
              )}
            </details>
          ))}
        </div>
      ) : (
        <>
          <h3>{type === "experience" ? "经历事实" : "知识内容"}</h3>
          <p className="pre-wrap">{structure.answer}</p>
          {structure.context && (
            <details>
              <summary>背景与相关介绍</summary>
              <p className="pre-wrap">{structure.context}</p>
            </details>
          )}
          {structure.feedback && (
            <details>
              <summary>建议 / 点评（非经历事实）</summary>
              <p className="pre-wrap">{structure.feedback}</p>
            </details>
          )}
          {structure.documentId && (
            <button
              className="text-button"
              onClick={() => onSource(structure.documentId!)}
            >
              查看来源原文 · v{structure.documentVersion}
            </button>
          )}
          {structure.quote && (
            <details>
              <summary>入库时的原文片段</summary>
              <blockquote className="pre-wrap">{structure.quote}</blockquote>
            </details>
          )}
        </>
      )}
      {type === "question" && (
        <button className="secondary" onClick={() => setAdding(true)}>
          ＋ 追加回答版本
        </button>
      )}
      {adding && (
        <Modal
          title={`追加回答 · ${item.title}`}
          onClose={() => !busy && setAdding(false)}
        >
          <Field label="我的回答">
            <textarea
              rows={6}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
            />
          </Field>
          <Field label="背景与相关介绍">
            <textarea
              rows={3}
              value={context}
              onChange={(e) => setContext(e.target.value)}
            />
          </Field>
          <Field label="建议 / 点评">
            <textarea
              rows={3}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
          </Field>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button
            className="primary"
            disabled={busy || !answer.trim()}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await api("/api/library-organizer", {
                  action: "append",
                  id: item.id,
                  version: item.version,
                  answer,
                  context,
                  feedback,
                });
                await refresh();
                setAdding(false);
                setAnswer("");
                setContext("");
                setFeedback("");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            保存新回答，保留旧版本
          </button>
        </Modal>
      )}
    </article>
  );
}
export function StructuredLibrary({
  onSource,
}: {
  onSource: (id: string) => void;
}) {
  const { data } = useWorkspace();
  const [type, setType] = useState("question");
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const entries = data.materials.filter((m) => materialFormat(m) === type);
  const roles = [...new Set(entries.map((m) => m.roleScope).filter(Boolean))];
  const shown = entries.filter(
    (m) =>
      (!role || m.roleScope === role) &&
      `${m.title} ${m.content}`.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <section className="organized-library">
      <p className="help">
        这里是已经核对入库的条目。整篇导入笔记在「原始文档」中，旧分类中的内容仍保留在「旧资料」。
      </p>
      <div className="sub-tabs">
        {Object.entries(libraryTypes).map(([key, label]) => (
          <button
            key={key}
            className={type === key ? "active" : ""}
            onClick={() => {
              setType(key);
              setRole("");
            }}
          >
            {label} ·{" "}
            {data.materials.filter((m) => materialFormat(m) === key).length}
          </button>
        ))}
      </div>
      <div className="materials-toolbar">
        <input
          aria-label="搜索已整理条目"
          placeholder="搜索问题、回答或经历…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          aria-label="筛选适用岗位"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          <option value="">全部岗位 / 通用</option>
          {roles.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </div>
      <div className="materials-list">
        {shown.map((m) => (
          <StructuredMaterial key={m.id} item={m} onSource={onSource} />
        ))}
      </div>
      {!shown.length && (
        <p className="empty-state">
          暂无这类条目。到「原始文档」逐篇整理后，确认保存到这里。
        </p>
      )}
    </section>
  );
}
export function SourceLibrary({
  onOpen,
  onImport,
  onEdit,
}: {
  onOpen: (m: Material) => void;
  onImport: () => void;
  onEdit: (m: Material) => void;
}) {
  const { data } = useWorkspace();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const documents = data.materials.filter(
    (m) => materialFormat(m) === "document",
  );
  function state(m: Material) {
    return m.structure?.complete
      ? "已整理"
      : m.structure?.items?.length
        ? "整理中"
        : "未整理";
  }
  return (
    <section>
      <div className="materials-toolbar">
        <input
          aria-label="搜索原始文档"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索原始笔记…"
        />
        <select
          aria-label="整理状态"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">全部状态</option>
          {["未整理", "整理中", "已整理"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <button className="secondary" onClick={onImport}>
          导入 Word / 文字
        </button>
      </div>
      <p className="help">
        完整原文保存在这里。逐篇整理，选中部分也可以入库；同一道题可以追加回答版本。
      </p>
      <div className="materials-list">
        {documents
          .filter(
            (m) =>
              (!status || state(m) === status) &&
              `${m.title} ${m.content}`.includes(q),
          )
          .map((m) => (
            <article key={m.id} className="material-card paper-panel">
              <div className="material-head">
                <span className="status-badge">{state(m)}</span>
                <small>
                  {
                    data.materials.filter(
                      (entry) =>
                        entry.parentId === m.id ||
                        entry.structure?.answers?.some(
                          (a) => a.documentId === m.id,
                        ),
                    ).length
                  }{" "}
                  条已入库 · {m.content.length} 字
                </small>
              </div>
              <h2>{m.title}</h2>
              <p className="help organizer-source-label">
                {displayNoteSource(m.source)}
              </p>
              <p className="source-snippet">
                {m.content.slice(0, 160)}
                {m.content.length > 160 ? "…" : ""}
              </p>
              <div className="card-actions">
                <button className="primary" onClick={() => onOpen(m)}>
                  查看原文 / 继续整理
                </button>
                <button className="text-button" onClick={() => onEdit(m)}>
                  编辑原文与历史版本
                </button>
              </div>
            </article>
          ))}
      </div>
      {!documents.length && (
        <p>
          还没有原始文档，可导入 Word、文字或 Obsidian
          笔记。旧资料也可逐篇移到这里整理。
        </p>
      )}
    </section>
  );
}
