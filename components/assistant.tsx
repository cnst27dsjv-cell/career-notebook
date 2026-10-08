"use client";
import { useEffect, useRef, useState } from "react";
import {
  PaperPlaneTilt,
  Microphone,
  Plus,
  ArrowClockwise,
  Check,
  PencilSimple,
  Paperclip,
  X,
} from "@phosphor-icons/react";
import { Modal } from "./ui";
import {
  ApplicationImageImport,
  type PendingApplicationImage,
} from "./application-image-import";
import { api, useWorkspace } from "./context";
import {
  actionLabels,
  fieldLabels,
  type AssistantPlan,
} from "@/lib/assistant-schema";
import {
  AssistantFilePicker,
  type AssistantFile,
} from "./assistant-file-picker";

import { useSpeechRecognition } from "./use-speech-recognition";
import { mergeSpeechInput } from "@/lib/speech-input";

type Conversation = { id: string; title: string };
type Message = {
  id: string;
  role: string;
  content: string;
  state: string;
  clientId: string;
  webSearch?: boolean;
  attachments: AssistantFile[];
  createdAt: string;
};
type Draft = {
  id: string;
  messageId: string;
  status: string;
  confirmed: boolean;
  revision: number;
  planHash: string;
  result: AssistantPlan;
  receipt: { id: string; action: string }[] | null;
  expiresAt: string | null;
};
type Chat = {
  conversations: Conversation[];
  conversation: Conversation | null;
  messages: Message[];
  drafts: Draft[];
};
const empty: Chat = {
  conversations: [],
  conversation: null,
  messages: [],
  drafts: [],
};
const shortcuts = [
  "帮我整理今天的日程和即将截止的任务",
  "看看有哪些逾期任务，帮我排一下优先级",
  "我收到面试通知，帮我安排面试和准备时间",
  "结合已有投递和资料，帮我准备面试",
];
export default function Assistant() {
  const { refresh } = useWorkspace();
  const [chat, setChat] = useState<Chat>(empty);
  const [input, setInput] = useState("");
  const [webSearch, setWebSearch] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [fileOpen, setFileOpen] = useState(false);
  const [attachments, setAttachments] = useState<AssistantFile[]>([]);
  const [importBusy, setImportBusy] = useState(false);
  const [images, setImages] = useState<PendingApplicationImage[]>([]);
  const [importUrl, setImportUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState<{
    input: string;
    clientId: string;
    webSearch?: boolean;
    attachmentIds: string[];
  }>();
  const [approved, setApproved] = useState<Record<string, boolean>>({});
  const bottom = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const voice = useSpeechRecognition({
    onTranscript: (text) => {
      setInput((current) => mergeSpeechInput(current, text));
      composer.current?.focus();
    },
  });
  useEffect(() => {
    if (busy) voice.cancel();
  }, [busy, voice.cancel]);
  async function load(id?: string) {
    const response = await fetch(
      `/api/assistant${id ? `?id=${encodeURIComponent(id)}` : ""}`,
    );
    const result = await response.json();
    if (!response.ok) throw Error(result.error || "对话加载失败");
    result.drafts = result.drafts.map((d: Draft) => ({
      ...d,
      status:
        d.status === "ready" &&
        d.expiresAt &&
        Date.parse(d.expiresAt) < Date.now()
          ? "expired"
          : d.status,
    }));
    setChat(result);
    return result as Chat;
  }
  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [chat.messages.length, busy]);
  // A reload during generation recovers the response without submitting the message again.
  useEffect(() => {
    if (!chat.messages.some((m) => m.state === "pending") || busy) return;
    const timer = setInterval(() => {
      load(chat.conversation?.id).catch(() => {});
    }, 4000);
    return () => clearInterval(timer);
  }, [chat.messages, chat.conversation?.id, busy]);
  async function send(repeat?: {
    input: string;
    clientId: string;
    webSearch?: boolean;
    attachmentIds: string[];
  }) {
    const text = repeat?.input || input.trim();
    if (!text || busy || voice.listening || text.length > 12000) return;
    voice.cancel();
    const request = repeat || {
      input: text,
      clientId: crypto.randomUUID(),
      webSearch,
      attachmentIds: attachments.map((file) => file.id),
    };
    const requestAttachments = repeat
      ? chat.messages.find((message) => message.clientId === repeat.clientId)
          ?.attachments || []
      : attachments;
    setBusy(true);
    setError("");
    setRetry(request);
    let id = chat.conversation?.id;
    try {
      if (!id) id = (await api("/api/assistant", { action: "new" })).id;
      const promise = api("/api/assistant", {
        action: "send",
        conversationId: id,
        ...request,
      });
      setInput("");
      setAttachments([]);
      setChat((c) => ({
        ...c,
        conversation: {
          id: id!,
          title: c.conversation?.title || text.slice(0, 32),
        },
        messages: c.messages.some((m) => m.clientId === request.clientId)
          ? c.messages
          : [
              ...c.messages,
              {
                id: request.clientId,
                clientId: request.clientId,
                webSearch: request.webSearch,
                attachments: requestAttachments,
                role: "user",
                content: text,
                state: "pending",
                createdAt: new Date().toISOString(),
              },
            ],
      }));
      await promise;
      setRetry(undefined);
      await load(id);
    } catch (e) {
      setError((e as Error).message);
      setAttachments(requestAttachments);
      if (id) await load(id).catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  async function draftAction(draft: Draft, action: "confirm" | "reject") {
    setBusy(true);
    setError("");
    try {
      await api("/api/assistant", {
        action,
        id: draft.id,
        revision: draft.revision,
        planHash: draft.planHash,
        allowWarnings: approved[draft.id] || false,
      });
      await load(chat.conversation?.id);
      if (action === "confirm") await refresh();
    } catch (e) {
      setError((e as Error).message);
      await load(chat.conversation?.id).catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  const referenceLabels = new Map(
    chat.drafts.flatMap((d) =>
      d.result.sources.map((s) => [s.id, s.label] as const),
    ),
  );
  const display = (key: string, value: unknown): string => {
    if (value === null || value === undefined || value === "") return "未设置";
    if (Array.isArray(value))
      return value.length ? value.map((v) => display(key, v)).join("、") : "无";
    const str = String(value);
    if (
      ["start", "end", "deadline", "appliedAt", "absoluteReminders"].includes(
        key,
      ) &&
      !Number.isNaN(Date.parse(str))
    )
      return new Date(str).toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        hour12: false,
      });
    if (str.startsWith("$")) {
      const a = chat.drafts
        .flatMap((d) => d.result.actions)
        .find((a) => `$${a.key}` === str);
      return a
        ? `本组新建：${String(a.values.title || a.values.company || actionLabels[a.action])}`
        : "本组关联记录";
    }
    return referenceLabels.get(str) || str;
  };
  return (
    <section className="assistant-envelope" aria-label="求职助理">
      {importOpen && (
        <Modal
          title="从招聘截图或链接整理"
          wide
          onClose={() => {
            if (!importBusy) {
              setImportOpen(false);
              setImages([]);
            }
          }}
        >
          <p className="muted">
            先提取到输入框，核对后发送。这里只识别文字，原图不会作为投递附件保存。
          </p>
          <ApplicationImageImport
            images={images}
            existing={[]}
            onChange={setImages}
            url={importUrl}
            onUrlChange={setImportUrl}
            onBusyChange={setImportBusy}
            onDeleteExisting={async () => {}}
            onRecognized={(result) => {
              const text = Object.entries(result.fields)
                .filter(([, value]) => value)
                .map(([key, value]) => `${fieldLabels[key] || key}：${value}`)
                .join("\n");
              if (text.length > 11000) {
                setError("识别内容较长，请在投递页导入，或分段粘贴到对话。");
                return;
              }
              setInput(
                `请根据以下识别的招聘信息生成投递草稿，内容仍需核对：\n${text}\n${result.notes.join("；")}`,
              );
              setImportOpen(false);
              setImages([]);
            }}
          />
        </Modal>
      )}
      {fileOpen && (
        <Modal title="给助理添加文件" wide onClose={() => setFileOpen(false)}>
          <AssistantFilePicker
            selected={attachments}
            onConfirm={(files) => {
              setAttachments(files);
              setFileOpen(false);
              composer.current?.focus();
            }}
          />
        </Modal>
      )}
      <div className="assistant-letter">
        <span className="letter-pin" aria-hidden="true" />
        <span className="letter-clip" aria-hidden="true" />
        <header className="letter-heading">
          <h1>AI Assistant</h1>
          <p>智 能 求 职 助 理</p>
          <div className="letter-divider" aria-hidden="true">
            ✦ ❖ ✦
          </div>
        </header>
        <div className="assistant-toolbar">
          <label>
            <span className="sr-only">选择历史对话</span>
            <select
              aria-label="历史对话"
              disabled={busy || loading}
              value={chat.conversation?.id || ""}
              onChange={async (e) => {
                voice.cancel();
                setLoading(true);
                setError("");
                setRetry(undefined);
                try {
                  await load(e.target.value);
                  setAttachments([]);
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setLoading(false);
                }
              }}
            >
              {!chat.conversation && <option value="">开始一段对话</option>}
              {chat.conversations.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="letter-text-button"
            disabled={busy}
            onClick={async () => {
              voice.cancel();
              setBusy(true);
              setError("");
              try {
                const c = await api("/api/assistant", { action: "new" });
                await load(c.id);
                setInput("");
                setAttachments([]);
                setRetry(undefined);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Plus size={15} />
            新对话
          </button>
        </div>
        <div
          className="assistant-chat"
          role="log"
          aria-label="对话记录"
          aria-live="polite"
          aria-busy={busy || loading}
        >
          {!chat.messages.length && (
            <div className="letter-message from-assistant">
              <span className="assistant-stamp" aria-hidden="true">
                Ai
              </span>
              <div>
                <div className="letter-bubble">
                  {loading
                    ? "正在取回你的对话…"
                    : "把求职中的安排和想法告诉我。我可以查日程、整理投递，也能把面试和准备一起安排好。所有修改都会先给你核对。"}
                </div>
                <small>你的求职助理 · 从一件事开始</small>
              </div>
            </div>
          )}
          {chat.messages.map((m) => (
            <div
              key={m.id}
              className={`letter-message ${m.role === "user" ? "from-user" : "from-assistant"}`}
            >
              {m.role !== "user" && (
                <span className="assistant-stamp" aria-hidden="true">
                  Ai
                </span>
              )}
              <div className="letter-message-content">
                {!!m.attachments?.length && (
                  <div className="assistant-message-files">
                    {m.attachments.map((file) => (
                      <span key={file.id}>
                        <Paperclip size={13} />
                        {file.name}
                      </span>
                    ))}
                  </div>
                )}
                <div className="letter-bubble">{m.content}</div>
                <small>
                  {m.role === "user" ? "你" : "AI Assistant"} ·{" "}
                  {new Date(m.createdAt).toLocaleTimeString("zh-CN", {
                    timeZone: "Asia/Shanghai",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </small>
                {(m.state === "failed" ||
                  (m.state === "pending" &&
                    Date.now() - Date.parse(m.createdAt) > 120000)) && (
                  <button
                    className="letter-text-button"
                    disabled={busy}
                    onClick={() =>
                      send({
                        input: m.content,
                        clientId: m.clientId,
                        webSearch: m.webSearch,
                        attachmentIds: (m.attachments || []).map(
                          (file) => file.id,
                        ),
                      })
                    }
                  >
                    <ArrowClockwise size={14} />
                    重新整理这条消息
                  </button>
                )}
                {chat.drafts
                  .filter((d) => d.messageId === m.id)
                  .map((d) => (
                    <div key={d.id} className="assistant-action-sheet">
                      {d.result.actions.length > 0 && (
                        <>
                          <div className="action-sheet-title">
                            <span>
                              {d.confirmed
                                ? "已保存"
                                : d.status === "ready"
                                  ? "待你确认"
                                  : d.status === "rejected"
                                    ? "已放弃"
                                    : d.status === "expired"
                                      ? "草稿已过期，请补充消息重新整理"
                                      : "已由新草稿替代"}
                            </span>
                            <strong>
                              {d.result.actions.length} 项关联操作
                            </strong>
                          </div>
                          {d.result.actions.map((a, i) => (
                            <details
                              key={a.key}
                              open={d.status === "ready"}
                              className="assistant-action-detail"
                            >
                              <summary>
                                {i + 1}. {a.id ? "更新" : "新增"} ·{" "}
                                {actionLabels[a.action]}
                                <span>
                                  {String(
                                    a.values.title ||
                                      a.values.company ||
                                      a.status ||
                                      "",
                                  )}
                                </span>
                              </summary>
                              <p>{a.reason}</p>
                              <dl>
                                {Object.entries(a.values)
                                  .filter(
                                    ([key, v]) =>
                                      !a.before ||
                                      JSON.stringify(a.before[key]) !==
                                        JSON.stringify(v),
                                  )
                                  .map(([key, v]) => (
                                    <div key={key}>
                                      <dt>{fieldLabels[key] || key}</dt>
                                      <dd>
                                        {a.before && (
                                          <del>
                                            {display(key, a.before[key])}
                                          </del>
                                        )}
                                        <span>{display(key, v)}</span>
                                      </dd>
                                    </div>
                                  ))}
                                {a.status && (
                                  <div>
                                    <dt>状态</dt>
                                    <dd>
                                      <del>
                                        {display("status", a.before?.status)}
                                      </del>
                                      <span>{a.status}</span>
                                    </dd>
                                  </div>
                                )}
                              </dl>
                              {a.action.startsWith("event") && (
                                <p className="action-consequence">
                                  关联投递阶段会按日程同步；完成或取消后，尚未发送的提醒会取消。
                                </p>
                              )}
                            </details>
                          ))}
                          {d.result.missing.length > 0 && (
                            <div className="action-missing">
                              <strong>还需要你补充</strong>
                              {d.result.missing.map((x) => (
                                <p key={x}>{x}</p>
                              ))}
                            </div>
                          )}
                          {d.result.warnings.length > 0 && (
                            <div className="action-warnings">
                              {d.result.warnings.map((x) => (
                                <p key={x}>{x}</p>
                              ))}
                              {d.status === "ready" && (
                                <label>
                                  <input
                                    type="checkbox"
                                    checked={!!approved[d.id]}
                                    onChange={(e) =>
                                      setApproved((a) => ({
                                        ...a,
                                        [d.id]: e.target.checked,
                                      }))
                                    }
                                  />
                                  我已核对以上提示，仍要继续
                                </label>
                              )}
                            </div>
                          )}
                          {d.status === "ready" && (
                            <div className="action-buttons">
                              <button
                                className="primary"
                                disabled={
                                  busy ||
                                  !!d.result.missing.length ||
                                  (!!d.result.warnings.length &&
                                    !approved[d.id])
                                }
                                onClick={() => draftAction(d, "confirm")}
                              >
                                <Check size={16} />
                                确认执行
                              </button>
                              <button
                                className="secondary"
                                disabled={busy}
                                onClick={() => {
                                  voice.cancel();
                                  setInput("请修改刚才的草稿：");
                                  composer.current?.focus();
                                }}
                              >
                                <PencilSimple size={15} />
                                修改 / 补充
                              </button>
                              <button
                                className="letter-text-button"
                                disabled={busy}
                                onClick={() => draftAction(d, "reject")}
                              >
                                <X size={15} />
                                放弃
                              </button>
                            </div>
                          )}
                          {d.confirmed && d.receipt && (
                            <div className="action-receipts">
                              {d.receipt.map((r, i) => (
                                <a
                                  key={r.id}
                                  href={`/?view=${r.action.startsWith("application") ? "applications" : r.action.startsWith("event") ? "calendar" : "preparations"}&record=${encodeURIComponent(r.id)}`}
                                >
                                  查看
                                  {
                                    actionLabels[
                                      r.action as keyof typeof actionLabels
                                    ]
                                  }{" "}
                                  {i + 1} ↗
                                </a>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                      {d.result.webSearch && (
                        <details className="assistant-sources" open>
                          <summary>
                            联网来源 · 搜索摘要 ·{" "}
                            {new Date(
                              d.result.webSearch.searchedAt,
                            ).toLocaleString("zh-CN")}
                          </summary>
                          <ol>
                            {d.result.webSearch.sources.map((source) => (
                              <li key={source.id}>
                                <a
                                  href={source.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {source.label || source.url} ↗
                                </a>
                              </li>
                            ))}
                          </ol>
                        </details>
                      )}
                      {!!d.result.sources.length && (
                        <details className="assistant-sources">
                          <summary>
                            本次参考了 {d.result.sources.length} 项资料
                          </summary>
                          <ul>
                            {d.result.sources.map((s) => (
                              <li key={s.id}>{s.label}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          ))}
          {busy && (
            <p className="assistant-working" role="status">
              正在整理，请稍候…
            </p>
          )}
          <div ref={bottom} />
        </div>
        {error && (
          <div className="assistant-error" role="alert">
            <p>{error}</p>
            <button
              className="letter-text-button"
              disabled={busy}
              onClick={() =>
                retry
                  ? send(retry)
                  : load(chat.conversation?.id)
                      .then(() => setError(""))
                      .catch((e) => setError(e.message))
              }
            >
              <ArrowClockwise size={15} />
              {retry ? "重试原消息" : "重新加载 / 核对结果"}
            </button>
          </div>
        )}
        <div className="letter-import">
          <label className="assistant-web-toggle">
            <input
              type="checkbox"
              checked={webSearch}
              disabled={busy}
              onChange={(e) => setWebSearch(e.target.checked)}
            />{" "}
            联网搜索
          </label>
          <button
            className="letter-text-button"
            disabled={busy}
            onClick={() => {
              voice.cancel();
              setImportOpen(true);
            }}
          >
            ＋ 招聘截图 / 链接
          </button>
          <button
            className="letter-text-button"
            disabled={busy}
            onClick={() => {
              voice.cancel();
              setFileOpen(true);
            }}
          >
            <Paperclip size={15} />
            文件
          </button>
        </div>
        {webSearch && (
          <p className="assistant-web-note">
            会将本次问题发送给 Tavily 搜索，请只填写公开信息；每次发送搜索一次。
          </p>
        )}
        <div className="letter-shortcuts">
          {["今日安排", "逾期任务", "安排面试", "准备面试"].map((label, i) => (
            <button
              key={label}
              disabled={busy}
              onClick={() => {
                voice.cancel();
                setInput(shortcuts[i]);
                composer.current?.focus();
              }}
            >
              <span aria-hidden="true">✦</span>
              {label}
            </button>
          ))}
        </div>
        {!!attachments.length && (
          <div className="assistant-composer-files" aria-label="待发送文件">
            {attachments.map((file) => (
              <span key={file.id}>
                <Paperclip size={13} />
                {file.name}
                <button
                  type="button"
                  aria-label={`移除 ${file.name}`}
                  disabled={busy}
                  onClick={() =>
                    setAttachments((items) =>
                      items.filter((item) => item.id !== file.id),
                    )
                  }
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        <form
          className="letter-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <PencilSimple size={20} aria-hidden="true" />
          <textarea
            ref={composer}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-label="给求职助理的消息"
            placeholder="在此写下你的问题，或粘贴面试通知…"
            rows={2}
            maxLength={12000}
            disabled={busy}
          />
          {voice.supported && (
            <button
              type="button"
              className="assistant-microphone"
              aria-label={voice.listening ? "停止语音输入" : "开始语音输入"}
              aria-pressed={voice.listening}
              title={voice.listening ? "停止语音输入" : "开始语音输入"}
              disabled={busy || loading || voice.stopping}
              onClick={voice.listening ? voice.stop : voice.start}
            >
              <Microphone size={22} weight={voice.listening ? "fill" : "regular"} />
            </button>
          )}
          <button
            type="submit"
            aria-label="发送消息"
            disabled={busy || voice.listening || input.length > 12000 || !input.trim()}
          >
            <PaperPlaneTilt size={24} weight="fill" />
          </button>
        </form>
        <div className="assistant-voice-note" role="status" aria-live="polite">
          {voice.error || (voice.supported === false
            ? "当前浏览器不支持语音输入，可使用系统键盘的麦克风。"
            : voice.listening
              ? voice.stopping ? "正在整理最后一句，请稍候…" : "正在聆听… 再点麦克风结束，核对文字后发送。"
              : voice.supported ? "语音由浏览器识别，可能使用在线服务；本站不保存录音。" : "")}
        </div>
        {input.length > 12000 && (
          <p className="assistant-voice-note" role="alert">文字超过 12000 字，请删减后发送；已识别内容保留在输入框中。</p>
        )}
        <p className="letter-footnote">
          会使用相关投递、日程与资料节选 · 选中的文件可读取正文 ·
          修改经你确认后保存
        </p>
      </div>
    </section>
  );
}
