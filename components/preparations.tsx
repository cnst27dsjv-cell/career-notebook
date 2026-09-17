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
import {
  materialCategories,
  materialKindsForCategory,
} from "@/lib/material-import";
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
    questions: string[];
  }>();
  const [polishSupplement, setPolishSupplement] = useState("");
  const [reuse, setReuse] = useState<(Material & { reason: string })[]>();
  const [busy, setBusy] = useState("");
  const [q, setQ] = useState("");
  const [libraryScope, setLibraryScope] = useState("");
  const [libraryKind, setLibraryKind] = useState("");
  const [newRole, setNewRole] = useState(false);
  const [sessionId, setSessionId] = useState<string>();
  const [manualSession, setManualSession] = useState(false);
  const prep = data.preparations.find((p) => p.id === selected);
  const session = data.interviews.find((s) => s.id === sessionId);
  const roleNames = [
    ...new Set([
      ...(data.materialRoles || []).map((role) => role.name),
      ...data.materials
        .filter((material) => material.category === "岗位特有")
        .map((material) => material.roleScope)
        .filter(Boolean),
    ]),
  ];
  const selectedRole = libraryScope.startsWith("role:")
    ? libraryScope.slice(5)
    : "";
  const scopedMaterials = data.materials.filter((material) => {
    if (libraryScope === "general") return material.category === "通用问题";
    if (libraryScope === "pending") return material.category === "待确认";
    if (selectedRole)
      return (
        material.category === "岗位特有" && material.roleScope === selectedRole
      );
    return false;
  });
  const availableKinds = [...new Set(scopedMaterials.map((item) => item.kind))];
  const scopeTitle = selectedRole
    ? selectedRole
    : libraryScope === "general"
      ? "通用"
      : libraryScope === "pending"
        ? "待确认"
        : "";
  const orderedKinds = (
    libraryScope === "general"
      ? ["个性问题", "行为面试", "其他通用问题"]
      : ["自我介绍", "求职动机", "岗位相关专业问题与知识点", "Case", "其他"]
  ).filter((kind) => availableKinds.includes(kind));
  const showMaterialItems =
    !!prep || (!!libraryScope && (libraryScope === "pending" || !!libraryKind));
  const materials = data.materials.filter((m) => {
    const inContext = prep
      ? m.preparationId === selected
      : tab === "library" &&
        !!libraryScope &&
        (libraryScope === "pending" || !!libraryKind) &&
        scopedMaterials.some((item) => item.id === m.id) &&
        (!libraryKind || m.kind === libraryKind);
    return inContext && `${m.title} ${m.content} ${m.tags}`.includes(q);
  });
  async function polishItem(m: Material, supplement = "") {
    setBusy(supplement ? "polish-followup" : m.id);
    try {
      const r = await api("/api/ai", {
        action: "polish",
        input: m.content,
        question: m.title,
        supplement,
      });
      setPolish({
        item: m,
        content: r.content,
        feedback: r.feedback,
        questions: r.questions || [],
      });
      if (!supplement) setPolishSupplement("");
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
            onClick={() => {
              setTab("preps");
              setLibraryScope("");
              setLibraryKind("");
            }}
          >
            <BookOpen size={17} />
            我的面试准备
          </button>
          <button
            className={tab === "library" ? "active" : ""}
            onClick={() => {
              setTab("library");
              setLibraryScope("");
              setLibraryKind("");
            }}
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
          {!prep && libraryScope && (
            <nav className="library-breadcrumb" aria-label="资料库当前位置">
              <button
                onClick={() => {
                  setLibraryScope("");
                  setLibraryKind("");
                  setQ("");
                }}
              >
                资料库
              </button>
              <span>›</span>
              {libraryKind ? (
                <>
                  <button
                    onClick={() => {
                      setLibraryKind("");
                      setQ("");
                    }}
                  >
                    {scopeTitle}
                  </button>
                  <span>›</span>
                  <strong>{libraryKind}</strong>
                </>
              ) : (
                <strong>{scopeTitle}</strong>
              )}
            </nav>
          )}
          {!prep && !libraryScope ? (
            <>
              <div className="materials-toolbar library-home-actions">
                <button
                  className="secondary"
                  onClick={() => setImporting(true)}
                >
                  <UploadSimple size={17} />
                  导入 Word / 文字
                </button>
                <button className="secondary" onClick={() => setEdit({})}>
                  <Plus size={17} />
                  添加资料
                </button>
                <button className="secondary" onClick={() => setNewRole(true)}>
                  <Plus size={17} />
                  新建岗位分类
                </button>
              </div>
              <div className="library-folder-grid">
                {roleNames.map((role) => (
                  <LibraryFolder
                    key={role}
                    title={role}
                    description="岗位特有资料"
                    count={
                      data.materials.filter(
                        (m) =>
                          m.category === "岗位特有" && m.roleScope === role,
                      ).length
                    }
                    onClick={() => setLibraryScope(`role:${role}`)}
                  />
                ))}
                <LibraryFolder
                  title="通用"
                  description="个性与行为面试等通用资料"
                  count={
                    data.materials.filter((m) => m.category === "通用问题")
                      .length
                  }
                  onClick={() => setLibraryScope("general")}
                />
                <LibraryFolder
                  title="待确认"
                  description="需要核对分类的原文"
                  count={
                    data.materials.filter((m) => m.category === "待确认").length
                  }
                  onClick={() => setLibraryScope("pending")}
                />
              </div>
            </>
          ) : !prep && !showMaterialItems ? (
            <>
              <div className="library-folder-grid secondary-level">
                {orderedKinds.map((kind) => (
                  <LibraryFolder
                    key={kind}
                    title={kind}
                    description={scopeTitle}
                    count={
                      scopedMaterials.filter((m) => m.kind === kind).length
                    }
                    onClick={() => setLibraryKind(kind)}
                  />
                ))}
              </div>
              {!orderedKinds.length && (
                <section className="paper-panel">
                  <Empty
                    title="这个岗位还没有资料"
                    description="可以导入 Word，或手动添加第一份资料。"
                  />
                </section>
              )}
              <div className="materials-toolbar library-home-actions">
                <button
                  className="secondary"
                  onClick={() => setImporting(true)}
                >
                  <UploadSimple size={17} />
                  导入资料
                </button>
                <button
                  className="secondary"
                  onClick={() =>
                    setEdit({
                      roleScope: selectedRole,
                      category:
                        libraryScope === "general" ? "通用问题" : "岗位特有",
                    })
                  }
                >
                  <Plus size={17} />
                  添加资料
                </button>
              </div>
            </>
          ) : (
            <>
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
                <button
                  className="secondary"
                  onClick={() => setImporting(true)}
                >
                  <UploadSimple size={17} />
                  导入 Word / 文字
                </button>
                {!prep && (
                  <button
                    className="secondary"
                    onClick={() =>
                      setEdit({
                        roleScope: selectedRole,
                        kind: libraryKind,
                        category:
                          libraryScope === "general"
                            ? "通用问题"
                            : libraryScope === "pending"
                              ? "待确认"
                              : "岗位特有",
                      })
                    }
                  >
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
                        {m.roleScope ? `${m.roleScope} · ` : ""}v{m.version} ·{" "}
                        {m.source}
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
                      <button
                        className="text-button"
                        onClick={() => setEdit(m)}
                      >
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
                    title="这里还没有资料"
                    description="导入已有内容，或添加第一份资料。"
                  />
                </section>
              )}
            </>
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
          {!!polish.questions.length && (
            <section className="polish-followup">
              <h3>补充这些信息后，润色会更完整</h3>
              <ul>
                {polish.questions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
              <Field label="补充事实（不会直接保存）">
                <textarea
                  rows={3}
                  value={polishSupplement}
                  onChange={(event) => setPolishSupplement(event.target.value)}
                  placeholder="按照上面的问题补充真实经历、理解或理由……"
                />
              </Field>
              <button
                type="button"
                className="secondary"
                disabled={
                  !polishSupplement.trim() || busy === "polish-followup"
                }
                onClick={() => polishItem(polish.item, polishSupplement.trim())}
              >
                {busy === "polish-followup"
                  ? "正在重新润色…"
                  : "结合补充内容重新润色"}
              </button>
            </section>
          )}
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
                  key={polish.content}
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
                <span className="status-badge">
                  {m.category} · {m.kind}
                </span>
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
                      category: m.category,
                      kind: m.kind,
                      roleScope: m.roleScope,
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
      {newRole && (
        <Modal title="新建岗位分类" onClose={() => setNewRole(false)}>
          <Form
            submit="创建岗位分类"
            onClose={() => setNewRole(false)}
            onSubmit={async (form) => {
              const name = String(form.get("name") || "").trim();
              await mutate({ action: "materialRole.save", name });
              setLibraryScope(`role:${name}`);
            }}
          >
            <Field label="岗位名称">
              <input
                required
                name="name"
                maxLength={60}
                placeholder="例如：战略分析"
              />
            </Field>
          </Form>
        </Modal>
      )}
    </>
  );
}
function LibraryFolder({
  title,
  description,
  count,
  onClick,
}: {
  title: string;
  description: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button className="library-folder paper-panel" onClick={onClick}>
      <span className="library-folder-icon">
        <Files size={24} />
      </span>
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <span className="library-folder-count">{count} 份</span>
      <ArrowUpRight size={20} />
    </button>
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
  const { data, mutate, notify } = useWorkspace();
  const [text, setText] = useState("");
  const [source, setSource] = useState("粘贴文字");
  const [importKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<
    {
      sourceIndex: number;
      title: string;
      content: string;
      category: string;
      kind: string;
      roleScope: string;
      confidence: number;
      selected: boolean;
    }[]
  >();
  const [coverage, setCoverage] = useState<{
    complete: boolean;
    sourceCount: number;
    classifiedCount: number;
    pendingCount: number;
    inputChars: number;
    outputChars: number;
  }>();
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
                    sourceIndex: 0,
                    title: "导入的面试准备",
                    content: text,
                    category: "待确认",
                    kind: "边界或分类待确认",
                    roleScope: "",
                    confidence: 0,
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
                  setCoverage(r.coverage);
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
                  category: m.category,
                  kind: m.kind,
                  roleScope: m.roleScope,
                  source,
                  preparationId: prepId || null,
                })),
            });
            notify("资料已加入资料库");
          }}
        >
          {coverage && (
            <div
              className={`import-summary ${coverage.complete ? "complete" : "error"}`}
            >
              <strong>
                {coverage.complete
                  ? "已覆盖全部原文"
                  : "原文覆盖不完整，请勿直接入库"}
              </strong>
              <span>
                共 {coverage.sourceCount} 段 · 已分类 {coverage.classifiedCount}{" "}
                段 · 待确认 {coverage.pendingCount} 段
              </span>
            </div>
          )}
          <datalist id="import-material-role-options">
            {(data.materialRoles || []).map((role) => (
              <option key={role.id} value={role.name} />
            ))}
          </datalist>
          {items.map((m, i) => (
            <div
              className={`import-item ${m.category === "待确认" ? "pending" : ""}`}
              key={m.sourceIndex}
            >
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
              <div className="form-grid import-classification">
                <Field label="一级类目">
                  <select
                    value={m.category}
                    onChange={(e) => {
                      const category = e.target.value;
                      const kinds = materialKindsForCategory(category);
                      setItems(
                        items.map((v, j) =>
                          j === i
                            ? {
                                ...v,
                                category,
                                kind: kinds.includes(v.kind)
                                  ? v.kind
                                  : kinds[0],
                                roleScope:
                                  category === "通用问题" ? "" : v.roleScope,
                              }
                            : v,
                        ),
                      );
                    }}
                  >
                    {materialCategories.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </Field>
                <Field label="二级类目">
                  <select
                    value={m.kind}
                    onChange={(e) =>
                      setItems(
                        items.map((v, j) =>
                          j === i ? { ...v, kind: e.target.value } : v,
                        ),
                      )
                    }
                  >
                    {materialKindsForCategory(m.category).map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </Field>
                <Field label="适用岗位">
                  <input
                    value={m.roleScope}
                    list="import-material-role-options"
                    required={m.category === "岗位特有"}
                    disabled={m.category === "通用问题"}
                    placeholder={
                      m.category === "岗位特有"
                        ? "例如：私募基金运营"
                        : "通用问题不需要填写"
                    }
                    onChange={(e) =>
                      setItems(
                        items.map((v, j) =>
                          j === i ? { ...v, roleScope: e.target.value } : v,
                        ),
                      )
                    }
                  />
                </Field>
              </div>
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
