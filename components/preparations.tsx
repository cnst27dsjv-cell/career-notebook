"use client";
import { useState } from "react";
import InterviewView from "./interview";
import InterviewSetup from "./interview-setup";
import ObsidianLibrary from "./obsidian-library";
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
import LibraryOrganizer, { SourceImport } from "./library-organizer";
import { SourceLibrary, StructuredLibrary, StructuredMaterial } from "./structured-material";
import { materialFormat } from "@/lib/library-organization";
export default function Preparations() {
  const { data, refresh, mutate, notify, acceptInterview } = useWorkspace();
  const [tab, setTab] = useState("preps");
  const [organizing, setOrganizing] = useState<Material>();
  const libraryMaterials = data.materials.filter((m) => materialFormat(m) === "legacy");
  function openSource(id: string) {
    const doc = data.materials.find((m) => m.id === id);
    if (doc) setOrganizing(doc); else notify("来源原文已归档或不存在；仍可查看入库时保存的原文片段。");
  }
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
    existingPrep?.id ||
      (typeof window !== "undefined"
        ? data.preparations.find(
            (p) =>
              p.id ===
              new URLSearchParams(window.location.search).get("record"),
          )?.id
        : undefined),
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
  const [setup, setSetup] = useState(false);
  const [createdSession, setCreatedSession] = useState<Interview>();
  const [sessionId, setSessionId] = useState<string>();
  const [manualSession, setManualSession] = useState(false);
  const prep = data.preparations.find((p) => p.id === selected);
  const session =
    createdSession || data.interviews.find((s) => s.id === sessionId);
  const roleNames = [
    ...new Set([
      ...(data.materialRoles || []).map((role) => role.name),
      ...libraryMaterials
        .filter((material) => material.category === "岗位特有")
        .map((material) => material.roleScope)
        .filter(Boolean),
    ]),
  ];
  const selectedRole = libraryScope.startsWith("role:")
    ? libraryScope.slice(5)
    : "";
  const scopedMaterials = libraryMaterials.filter((material) => {
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
  if (session)
    return (
      <InterviewView
        key={session.id}
        session={session}
        onBack={() => {
          setSessionId(undefined);
          setCreatedSession(undefined);
        }}
      />
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
            旧资料 <span>{libraryMaterials.length}</span>
          </button>
          <button className={tab === "documents" ? "active" : ""} onClick={() => setTab("documents")}>原始文档 <span>{data.materials.filter((m) => materialFormat(m) === "document").length}</span></button>
          <button className={tab === "organized" ? "active" : ""} onClick={() => setTab("organized")}>练习库</button>
        </div>
      )}
      <div className="materials-toolbar">
        <ObsidianLibrary />
      </div>
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
      ) : !prep && tab === "documents" ? (
        <SourceLibrary onOpen={setOrganizing} onImport={() => setImporting(true)} onEdit={setEdit} />
      ) : !prep && tab === "organized" ? (
        <StructuredLibrary onSource={openSource} />
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
                  onClick={() => setSetup(true)}
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
                      libraryMaterials.filter(
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
                    libraryMaterials.filter((m) => m.category === "通用问题")
                      .length
                  }
                  onClick={() => setLibraryScope("general")}
                />
                <LibraryFolder
                  title="待确认"
                  description="需要核对分类的原文"
                  count={
                    libraryMaterials.filter((m) => m.category === "待确认").length
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
                {materials.map((m) => ["question", "experience", "knowledge"].includes(materialFormat(m)) ? <StructuredMaterial key={m.id} item={m} onSource={openSource} /> : (
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
                      <button className="secondary" disabled={!!busy} onClick={async () => {
                        setBusy(m.id);
                        try {
                          const doc = materialFormat(m) === "document" ? m : await api("/api/library-organizer", { action: "promote", id: m.id, version: m.version });
                          await refresh(); setOrganizing(doc);
                        } catch (e) { notify((e as Error).message); } finally { setBusy(""); }
                      }}>{materialFormat(m) === "document" ? "整理原始文档" : "移至原始文档并拆分"}</button>
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
      {organizing && <LibraryOrganizer key={organizing.id} document={organizing} onClose={() => setOrganizing(undefined)} />}
      {setup && prep && (
        <InterviewSetup
          prep={prep}
          onClose={() => setSetup(false)}
          onCreated={(s) => {
            setSetup(false);
            acceptInterview?.(s);
            setCreatedSession(s);
          }}
        />
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
        <SourceImport prepId={prep?.id} onClose={() => setImporting(false)} onSaved={(m) => { setImporting(false); setOrganizing(m); setTab("documents"); }} />
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
                  disabled={!!busy}
                  onClick={async () => {
                    if (materialFormat(m) !== "legacy") {
                      setBusy(m.id);
                      try { await api("/api/library-organizer", { action: "reuse", id: m.id, version: m.version, preparationId: selected }); await refresh(); setReuse(undefined); notify("已复用到本次准备，保留回答版本与来源。"); } catch (e) { notify((e as Error).message); } finally { setBusy(""); }
                      return;
                    }
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
                  {materialFormat(m) === "legacy" ? "复用并编辑" : "复用到本次准备"}
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
