"use client";
import { useState } from "react";
import InterviewView from "./interview";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  ChatCircleText,
  MagnifyingGlass,
  Sparkle,
  UploadSimple,
  Files,
  Check,
  Plus,
  PencilSimple,
} from "@phosphor-icons/react";
import { useWorkspace, api } from "./context";
import { PrepForm, MaterialForm } from "./forms";
import { AddButton, Empty, Modal, Form, Field } from "./ui";
import type { Material, Prep, Interview } from "@/lib/types";
export default function Preparations() {
  const { data, refresh, mutate, notify } = useWorkspace();
  const [tab, setTab] = useState("preps");
  const initialEvent =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("event")
      : null;
  const existingPrep = data.preparations.find(
    (p) => p.eventId === initialEvent && initialEvent,
  );
  const linkedEvent = data.events.find((e) => e.id === initialEvent);
  const linkedApp = data.applications.find(
    (a) => a.id === linkedEvent?.applicationId,
  );
  const [selected, setSelected] = useState<string | undefined>(
    existingPrep?.id,
  );
  const [newPrep, setNewPrep] = useState(!!initialEvent && !existingPrep);
  const [edit, setEdit] = useState<Partial<Material>>();
  const [importing, setImporting] = useState(false);
  const [polish, setPolish] = useState<{
    item: Material;
    content: string;
    feedback: string;
  }>();
  const [reuse, setReuse] = useState<(Material & { reason: string })[]>();
  const [busy, setBusy] = useState("");
  const [q, setQ] = useState("");
  const [sessionId, setSessionId] = useState<string>();
  const [manualSession, setManualSession] = useState(false);
  const prep = data.preparations.find((p) => p.id === selected);
  const session = data.interviews.find((s) => s.id === sessionId);
  const materials = data.materials.filter(
    (m) =>
      (tab === "library" || !selected || m.preparationId === selected) &&
      `${m.title} ${m.content} ${m.tags}`.includes(q),
  );
  async function polishItem(m: Material) {
    setBusy(m.id);
    try {
      const r = await api("/api/ai", {
        action: "polish",
        input: m.content,
        question: m.title,
      });
      setPolish({ item: m, content: r.content, feedback: r.feedback });
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function findReuse() {
    setBusy("reuse");
    try {
      const r = await api("/api/ai", {
        action: "reuse",
        preparationId: selected,
      });
      setReuse(r.items);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function research() {
    setBusy("research");
    try {
      const r = await api("/api/ai", {
        action: "research",
        preparationId: selected,
      });
      await refresh();
      setSessionId(r.id);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  if (session)
    return (
      <InterviewView session={session} onBack={() => setSessionId(undefined)} />
    );
  return (
    <>
      {prep ? (
        <div className="page-heading">
          <div>
            <button
              className="back-link"
              onClick={() => setSelected(undefined)}
            >
              <ArrowLeft size={16} />
              所有面试准备
            </button>
            <h1>
              {prep.company} · {prep.role}
            </h1>
            <p>{prep.round} · 准备充分一点，表达从容一点。</p>
          </div>
          <AddButton onClick={() => setEdit({})}>添加资料</AddButton>
        </div>
      ) : (
        <div className="page-heading">
          <div>
            <h1>
              面试准备 <span className="script">Ready for what's next</span>
            </h1>
            <p>把每一次准备，变成下一次的底气。</p>
          </div>
          <AddButton onClick={() => setNewPrep(true)}>新建面试准备</AddButton>
        </div>
      )}
      {!prep && (
        <div className="sub-tabs">
          <button
            className={tab === "preps" ? "active" : ""}
            onClick={() => setTab("preps")}
          >
            <BookOpen size={17} />
            我的面试准备
          </button>
          <button
            className={tab === "library" ? "active" : ""}
            onClick={() => setTab("library")}
          >
            <Files size={17} />
            资料库 <span>{data.materials.length}</span>
          </button>
        </div>
      )}
      {!prep && tab === "preps" ? (
        <div className="prep-grid">
          {data.preparations.map((p, i) => (
            <button
              className="prep-card paper-panel"
              key={p.id}
              onClick={() => setSelected(p.id)}
            >
              <div className="prep-card-top">
                <span className="index-no">0{i + 1}</span>
                <span className="status-badge">{p.round}</span>
              </div>
              <h2>{p.company}</h2>
              <p>{p.role}</p>
              <div className="prep-card-bottom">
                <span>
                  {
                    data.materials.filter((m) => m.preparationId === p.id)
                      .length
                  }{" "}
                  份准备资料
                </span>
                <ArrowUpRight size={21} />
              </div>
            </button>
          ))}
          <button className="new-prep" onClick={() => setNewPrep(true)}>
            <Plus size={26} />
            <span>为下一次面试做准备</span>
          </button>
        </div>
      ) : (
        <>
          {prep && (
            <section className="prep-assistant paper-panel">
              <div>
                <Sparkle size={25} />
                <h2>让过去的准备，帮你走好下一步。</h2>
                <p>找出能复用的内容，或让模拟面试官带你练习。</p>
              </div>
              <div className="prep-assistant-actions">
                <button
                  className="secondary"
                  disabled={!!busy}
                  onClick={findReuse}
                >
                  {busy === "reuse" ? "正在查找…" : "查找可复用内容"}
                </button>
                <button
                  className="primary"
                  disabled={!!busy}
                  onClick={research}
                >
                  <ChatCircleText size={18} />
                  {busy === "research" ? "正在调研与出题…" : "调研并模拟面试"}
                </button>
              </div>
              <button
                className="text-button"
                onClick={() => setManualSession(true)}
              >
                使用自己的问题开始练习
              </button>
              {!data.services.search && (
                <small>
                  联网调研尚未配置。当前可以手动整理、导入与复用历史资料。
                </small>
              )}
              {prep.jd && (
                <details>
                  <summary>查看岗位描述</summary>
                  <p className="pre-wrap">{prep.jd}</p>
                </details>
              )}
            </section>
          )}
          <div className="materials-toolbar">
            <label className="search-box">
              <MagnifyingGlass size={18} />
              <input
                aria-label="搜索准备资料"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜索自我介绍、问题、标签…"
              />
            </label>
            <button className="secondary" onClick={() => setImporting(true)}>
              <UploadSimple size={17} />
              导入 Word / 文字
            </button>
            {!prep && (
              <button className="secondary" onClick={() => setEdit({})}>
                <Plus size={17} />
                添加资料
              </button>
            )}
          </div>
          <div className="materials-list">
            {materials.map((m) => (
              <article className="material-card paper-panel" key={m.id}>
                <div className="material-head">
                  <span className="status-badge">{m.kind}</span>
                  <small>
                    v{m.version} · {m.source}
                  </small>
                </div>
                <h2>{m.title}</h2>
                <p className="material-body pre-wrap">{m.content}</p>
                {m.tags && (
                  <div className="material-tags">
                    {m.tags
                      .split(/[,， ]+/)
                      .filter(Boolean)
                      .map((t) => (
                        <span key={t}>#{t}</span>
                      ))}
                  </div>
                )}
                <div className="card-actions">
                  <button className="text-button" onClick={() => setEdit(m)}>
                    <PencilSimple size={16} />
                    编辑与历史版本
                  </button>
                  <button
                    className="secondary"
                    disabled={!!busy}
                    onClick={() => polishItem(m)}
                  >
                    <Sparkle size={16} />
                    {busy === m.id ? "正在润色…" : "一键润色"}
                  </button>
                </div>
              </article>
            ))}
          </div>
          {!materials.length && (
            <section className="paper-panel">
              <Empty
                title="从一段自我介绍开始"
                description="导入已有内容，或写下你想准备的第一个问题。"
              />
            </section>
          )}
          {prep &&
            data.interviews.filter((s) => s.preparationId === prep.id).length >
              0 && (
              <section className="paper-panel session-list">
                <h2>模拟面试记录</h2>
                {data.interviews
                  .filter((s) => s.preparationId === prep.id)
                  .map((s, i) => (
                    <button
                      className="secondary"
                      key={s.id}
                      onClick={() => setSessionId(s.id)}
                    >
                      继续第 {i + 1} 次练习
                      <ArrowRightIcon />
                    </button>
                  ))}
              </section>
            )}
        </>
      )}
      {manualSession && (
        <Modal title="用自己的问题练习" onClose={() => setManualSession(false)}>
          <Form
            submit="开始练习"
            onClose={() => setManualSession(false)}
            onSubmit={async (f) => {
              const r = await api("/api/data", {
                action: "interview.create",
                preparationId: selected,
                questions: String(f.get("questions"))
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean),
              });
              await refresh();
              setSessionId(r.id);
            }}
          >
            <Field label="每行一个问题">
              <textarea
                required
                name="questions"
                rows={7}
                placeholder="请介绍一下你自己。
为什么想应聘这个岗位？"
              />
            </Field>
          </Form>
        </Modal>
      )}
      {newPrep && (
        <PrepForm
          item={
            initialEvent
              ? {
                  company: linkedApp?.company,
                  role: linkedApp?.role,
                  applicationId: linkedApp?.id,
                  eventId: initialEvent,
                }
              : undefined
          }
          onClose={() => setNewPrep(false)}
        />
      )}{" "}
      {edit && (
        <MaterialForm
          item={edit}
          prepId={prep?.id}
          onClose={() => setEdit(undefined)}
        />
      )}{" "}
      {importing && (
        <ImportModal prepId={prep?.id} onClose={() => setImporting(false)} />
      )}
      {polish && (
        <Modal
          title="润色建议 · 确认后才会保存"
          onClose={() => setPolish(undefined)}
          wide
        >
          <p className="notice-paper">{polish.feedback}</p>
          <Form
            onClose={() => setPolish(undefined)}
            submit="采用并保存新版本"
            onSubmit={async (f) =>
              mutate({
                action: "material.save",
                id: polish.item.id,
                version: polish.item.version,
                values: { ...polish.item, content: String(f.get("content")) },
              })
            }
          >
            <div className="compare-grid">
              <div>
                <h3>原稿</h3>
                <p className="pre-wrap original-copy">{polish.item.content}</p>
              </div>
              <Field label="建议稿（可继续修改）">
                <textarea
                  name="content"
                  rows={16}
                  defaultValue={polish.content}
                />
              </Field>
            </div>
          </Form>
        </Modal>
      )}
      {reuse && (
        <Modal
          title="找到可复用的准备资料"
          onClose={() => setReuse(undefined)}
          wide
        >
          {reuse.length ? (
            reuse.map((m) => (
              <article className="reuse-item" key={m.id}>
                <span className="status-badge">{m.kind}</span>
                <h3>{m.title}</h3>
                <p className="muted">
                  {m.reason} · {m.source} · v{m.version}
                </p>
                <p className="pre-wrap">{m.content}</p>
                <button
                  className="secondary"
                  onClick={() => {
                    setReuse(undefined);
                    setEdit({
                      title: m.title,
                      content: m.content,
                      kind: m.kind,
                      tags: m.tags,
                      parentId: m.id,
                      source: `复用：${m.title} v${m.version}`,
                    });
                  }}
                >
                  复用并编辑
                  <ArrowUpRight size={15} />
                </button>
              </article>
            ))
          ) : (
            <Empty
              title="还没有找到合适的历史内容"
              description="可以手动搜索资料库，或添加新的准备资料。"
            />
          )}
        </Modal>
      )}
    </>
  );
}
function ArrowRightIcon() {
  return <ArrowUpRight size={16} />;
}
function ImportModal({
  prepId,
  onClose,
}: {
  prepId?: string;
  onClose: () => void;
}) {
  const { mutate, notify } = useWorkspace();
  const [text, setText] = useState("");
  const [source, setSource] = useState("粘贴文字");
  const [importKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [items, setItems] =
    useState<
      { title: string; content: string; kind: string; selected: boolean }[]
    >();
  const [error, setError] = useState("");
  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      const f = new FormData();
      f.set("file", file);
      f.set("mode", "import");
      const r = await fetch("/api/files", { method: "POST", body: f });
      const result = await r.json();
      if (!r.ok) throw Error(result.error);
      setText(result.text);
      setSource(result.name);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="导入已有准备资料" onClose={onClose} wide>
      {!items ? (
        <>
          <Field label="上传 Word DOCX（最大 10 MB）">
            <input
              type="file"
              accept=".docx"
              disabled={busy}
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            />
          </Field>
          <Field label="或粘贴文字 / 核对提取内容">
            <textarea
              rows={12}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="把以前整理的自我介绍、面试问题和回答粘贴到这里…"
            />
          </Field>
          {error && <p className="error">{error}</p>}
          <p className="help">
            导入后先预览，不会直接加入资料库。AI
            分类会把这段文字发送到你配置的模型服务。
          </p>
          <div className="form-footer">
            <button
              className="secondary"
              disabled={!text.trim() || busy}
              onClick={() =>
                setItems([
                  {
                    title: "导入的面试准备",
                    content: text,
                    kind: "其他",
                    selected: true,
                  },
                ])
              }
            >
              作为一份资料整理
            </button>
            <button
              className="primary"
              disabled={!text.trim() || busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const r = await api("/api/ai", {
                    action: "import",
                    input: text,
                  });
                  setItems(
                    r.items.map((i: object) => ({ ...i, selected: true })),
                  );
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "正在处理…" : "助理拆分与分类"}
            </button>
          </div>
        </>
      ) : (
        <Form
          submit="确认选中资料入库"
          onClose={onClose}
          onSubmit={async () => {
            await mutate({
              action: "material.import",
              key: importKey,
              items: items
                .filter((i) => i.selected)
                .map((m) => ({
                  title: m.title,
                  content: m.content,
                  kind: m.kind,
                  source,
                  preparationId: prepId || null,
                })),
            });
            notify("资料已加入资料库");
          }}
        >
          {items.map((m, i) => (
            <div className="import-item" key={i}>
              <label className="check">
                <input
                  type="checkbox"
                  checked={m.selected}
                  onChange={(e) =>
                    setItems(
                      items.map((v, j) =>
                        j === i ? { ...v, selected: e.target.checked } : v,
                      ),
                    )
                  }
                />
                保存这一份
              </label>
              <Field label="标题">
                <input
                  required
                  value={m.title}
                  onChange={(e) =>
                    setItems(
                      items.map((v, j) =>
                        j === i ? { ...v, title: e.target.value } : v,
                      ),
                    )
                  }
                />
              </Field>
              <Field label="正文">
                <textarea
                  rows={6}
                  value={m.content}
                  onChange={(e) =>
                    setItems(
                      items.map((v, j) =>
                        j === i ? { ...v, content: e.target.value } : v,
                      ),
                    )
                  }
                />
              </Field>
            </div>
          ))}
        </Form>
      )}
    </Modal>
  );
}
