"use client";
import { useMemo, useState } from "react";
import { api, useWorkspace } from "./context";
import { Modal, Field } from "./ui";
import type { Material } from "@/lib/types";
import { displayNoteSource } from "@/lib/markdown-library";
import {
  libraryTypes,
  materialFormat,
  splitSourceSegments,
  sourceSegmentLimit,
  type OrganizationItem,
} from "@/lib/library-organization";

export function SourceImport({
  prepId,
  onClose,
  onSaved,
}: {
  prepId?: string;
  onClose: () => void;
  onSaved: (m: Material) => void;
}) {
  const { refresh } = useWorkspace();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [source, setSource] = useState("粘贴文字");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal title="保存原始文档" onClose={() => !busy && onClose()} wide>
      <p className="help">
        先完整保存原文，再按问题、经历或知识逐条整理。原文不会被拆分覆盖。
      </p>
      <Field label="上传 Word DOCX">
        <input
          type="file"
          accept=".docx"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            setError("");
            try {
              const f = new FormData();
              f.set("file", file);
              f.set("mode", "import");
              const r = await fetch("/api/files", { method: "POST", body: f });
              const v = await r.json();
              if (!r.ok) throw Error(v.error);
              setText(v.text);
              setTitle(file.name.replace(/\.docx$/i, ""));
              setSource(file.name);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
      </Field>
      <Field label="文档名称">
        <input
          value={title}
          maxLength={300}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>
      <Field label="粘贴文字 / 核对完整原文">
        <textarea
          rows={12}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </Field>
      {text.length > 100000 && (
        <p className="error" role="alert">
          原文超过 10 万字，请分成几篇保存。当前输入已完整保留，没有截断。
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="form-footer">
        <button
          className="primary"
          disabled={
            busy || !title.trim() || !text.trim() || text.length > 100000
          }
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const m = await api("/api/library-organizer", {
                action: "create",
                title,
                content: text,
                source,
                preparationId: prepId,
              });
              await refresh();
              onSaved(m);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "正在保存…" : "保存原文并开始整理"}
        </button>
      </div>
    </Modal>
  );
}

export default function LibraryOrganizer({
  document,
  onClose,
}: {
  document: Material;
  onClose: () => void;
}) {
  const { data, refresh } = useWorkspace();
  const [doc, setDoc] = useState(document);
  const [items, setItems] = useState<OrganizationItem[]>(
    document.structure?.items || [],
  );
  const segments = useMemo(
    () => splitSourceSegments(doc.content),
    [doc.content],
  );
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [segment, setSegment] = useState(() => segments[0]);
  const [focus, setFocus] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const splitDisabledReason = busy
    ? "正在处理，请稍候。"
    : dirty
      ? "请先保存整理进度，再继续 AI 拆分。"
      : items.some((i) => !i.savedId)
        ? "请先核对并入库当前候选，或移除不需要的候选，再拆分下一段。"
        : !segment.trim()
          ? "请选择一段原文，或展开下方选项填写本次整理片段。"
          : segment.length > sourceSegmentLimit
            ? "本次片段超过 24000 字，请选择自动分段或缩短片段。"
            : !doc.content.includes(segment)
              ? "本次片段必须是原文中的连续内容，请重新选择或复制。"
              : "";
  const quote = items.find((i) => i.key === focus)?.quote || "";
  const position = quote ? doc.content.indexOf(quote) : -1;
  const questions = data.materials.filter(
    (m) => materialFormat(m) === "question",
  );
  function change(key: string, patch: Partial<OrganizationItem>) {
    setItems((old) => old.map((i) => (i.key === key ? { ...i, ...patch } : i)));
    setDirty(true);
  }
  async function act(action: string) {
    setBusy(action);
    setError("");
    setStatus("");
    try {
      const next: Material = await api("/api/library-organizer", {
        action,
        id: doc.id,
        version: doc.version,
        items,
        segment,
      });
      setDoc(next);
      setItems(next.structure?.items || []);
      setDirty(false);
      setStatus(
        action === "generate"
          ? "已生成候选并保存草稿，请核对后入库。"
          : action === "confirm"
            ? "选中条目已入库；剩余内容可稍后继续整理。"
            : action === "complete"
              ? "已标记整理完成，原文仍完整保留。"
              : "整理进度已保存。",
      );
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <Modal
      title={`整理原始文档 · ${doc.title}`}
      wide
      onClose={() => {
        if (
          !busy &&
          (!dirty ||
            window.confirm("还有未保存的整理修改。放弃这些修改并关闭吗？"))
        )
          onClose();
      }}
    >
      <p className="help">
        左边保留原文，右边整理独立条目。AI
        只生成候选；点击「确认选中条目入库」才会进入练习库。
      </p>
      <div className="organizer-columns">
        <section className="organizer-original">
          <h3>完整原文</h3>
          <small className="organizer-source-label">
            {displayNoteSource(doc.source)} · v{doc.version}
          </small>
          <div className="organizer-source pre-wrap">
            {position >= 0 ? (
              <>
                {doc.content.slice(0, position)}
                <mark>{quote}</mark>
                {doc.content.slice(position + quote.length)}
              </>
            ) : (
              doc.content
            )}
          </div>
          {segments.length > 1 && (
            <div className="organizer-segments">
              <p className="help">
                长文已自动分为 {segments.length}{" "}
                段，每次拆分一段。核对当前候选后，可选择下一段继续。
              </p>
              <Field label="选择整理段落">
                <select
                  value={segmentIndex}
                  disabled={!!busy}
                  onChange={(e) => {
                    const index = Number(e.target.value);
                    setSegmentIndex(index);
                    setSegment(segments[index]);
                    setError("");
                    setStatus("");
                  }}
                >
                  {segments.map((text, index) => (
                    <option key={index} value={index}>
                      第 {index + 1} / {segments.length} 段 · {text.length} 字
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
          <details>
            <summary>分段整理 / 查看本次发送给 AI 的内容</summary>
            <Field label="本次整理片段">
              <textarea
                rows={7}
                value={segment}
                disabled={!!busy}
                onChange={(e) => setSegment(e.target.value)}
                placeholder="从上方复制一段连续原文，每次最多 24000 字"
              />
            </Field>
          </details>
          <p className="help">AI 拆分会将本次片段发送给已配置的文本模型。</p>
          <button
            className="primary"
            disabled={!!splitDisabledReason}
            aria-describedby={
              splitDisabledReason ? "organizer-split-reason" : undefined
            }
            onClick={() => act("generate")}
          >
            {busy === "generate" ? "正在拆分…" : "AI 拆分本次原文"}
          </button>
          {splitDisabledReason && (
            <p id="organizer-split-reason" className="help">
              {splitDisabledReason}
            </p>
          )}
        </section>
        <section className="organizer-candidates">
          <div className="material-head">
            <h3>待核对条目</h3>
            <span>
              {items.filter((i) => i.savedId).length} 已入库 / {items.length} 条
            </span>
          </div>
          {!items.length && (
            <p className="help">
              可让 AI
              拆分，也可以手动添加。一道问题对应一个条目；只有背景介绍的内容可归为经历素材。
            </p>
          )}
          {items.map((item, index) => (
            <article
              key={item.key}
              className="organizer-item"
              onFocus={() => setFocus(item.key)}
            >
              <div className="material-head">
                <label>
                  <input
                    type="checkbox"
                    checked={item.selected}
                    disabled={!!busy || !!item.savedId}
                    onChange={(e) =>
                      change(item.key, { selected: e.target.checked })
                    }
                  />{" "}
                  条目 {index + 1} {item.savedId && "· 已入库"}
                </label>
                {!item.savedId && (
                  <button
                    className="text-button"
                    disabled={!!busy}
                    onClick={() => {
                      setItems(items.filter((i) => i.key !== item.key));
                      setDirty(true);
                    }}
                  >
                    移除候选
                  </button>
                )}
              </div>
              {item.savedId ? (
                <p>{item.title}</p>
              ) : (
                <fieldset disabled={!!busy}>
                  <div className="form-grid">
                    <Field label="内容类型">
                      <select
                        value={item.type}
                        onChange={(e) =>
                          change(item.key, {
                            type: e.target.value as OrganizationItem["type"],
                            targetId: "",
                            targetVersion: undefined,
                          })
                        }
                      >
                        {Object.entries(libraryTypes).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="适用分类">
                      <select
                        value={item.category}
                        onChange={(e) =>
                          change(item.key, {
                            category: e.target
                              .value as OrganizationItem["category"],
                          })
                        }
                      >
                        {["通用问题", "岗位特有", "待确认"].map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <Field label="适用岗位">
                    <input
                      value={item.roleScope}
                      onChange={(e) =>
                        change(item.key, { roleScope: e.target.value })
                      }
                      placeholder="岗位特有条目必填"
                    />
                  </Field>
                  <Field
                    label={item.type === "question" ? "面试问题" : "条目标题"}
                  >
                    <input
                      value={item.title}
                      onChange={(e) =>
                        change(item.key, { title: e.target.value })
                      }
                    />
                  </Field>
                  <Field
                    label={
                      item.type === "question"
                        ? "我的原回答（可留空）"
                        : item.type === "experience"
                          ? "经历事实（背景 / 任务 / 行动 / 结果）"
                          : "知识内容"
                    }
                  >
                    <textarea
                      rows={5}
                      value={item.answer}
                      onChange={(e) =>
                        change(item.key, { answer: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="背景与相关介绍">
                    <textarea
                      rows={3}
                      value={item.context}
                      onChange={(e) =>
                        change(item.key, { context: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="其他智能体的建议 / 点评（不作为经历事实）">
                    <textarea
                      rows={3}
                      value={item.feedback}
                      onChange={(e) =>
                        change(item.key, { feedback: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="原文依据（连续原文，可手动选填）">
                    <textarea
                      rows={3}
                      value={item.quote}
                      onChange={(e) =>
                        change(item.key, { quote: e.target.value })
                      }
                    />
                  </Field>
                  {item.type === "question" && (
                    <Field label="保存方式">
                      <select
                        value={item.targetId}
                        onChange={(e) =>
                          change(item.key, {
                            targetId: e.target.value,
                            targetVersion: questions.find(
                              (q) => q.id === e.target.value,
                            )?.version,
                          })
                        }
                      >
                        <option value="">新建问题</option>
                        {questions.map((q) => (
                          <option key={q.id} value={q.id}>
                            追加回答版本：{q.title}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  <button
                    className="text-button"
                    onClick={() => setFocus(item.key)}
                  >
                    在左侧定位原文依据
                  </button>
                </fieldset>
              )}
            </article>
          ))}
          <button
            className="secondary"
            disabled={!!busy || items.length >= 80}
            onClick={() => {
              setItems([
                ...items,
                {
                  key: crypto.randomUUID(),
                  type: "question",
                  title: "新问题",
                  answer: "",
                  context: "",
                  feedback: "",
                  quote: "",
                  selected: true,
                  category: "通用问题",
                  roleScope: "",
                  targetId: "",
                },
              ]);
              setDirty(true);
            }}
          >
            ＋ 手动添加条目
          </button>
          <p className="help">
            需要合并时，把内容移到同一条目并移除多余候选；需要拆分时，添加条目后分配内容。保存进度后可随时回来继续。
          </p>
        </section>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {status && <p role="status">{status}</p>}
      <div className="form-footer organizer-actions">
        <span>{dirty ? "有未保存修改" : "进度已保存"}</span>
        <button
          className="secondary"
          disabled={!!busy}
          onClick={() => act("draft")}
        >
          保存整理进度
        </button>
        <button
          className="primary"
          disabled={!!busy || !items.some((i) => i.selected && !i.savedId)}
          onClick={() => act("confirm")}
        >
          {busy === "confirm" ? "正在入库…" : "确认选中条目入库"}
        </button>
        <button
          className="secondary"
          disabled={!!busy || items.some((i) => i.selected && !i.savedId)}
          onClick={() => act("complete")}
        >
          标记整理完成
        </button>
      </div>
    </Modal>
  );
}
