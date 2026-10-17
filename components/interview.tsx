"use client";
import { materialFormat } from "@/lib/library-organization";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "@phosphor-icons/react";
import { useWorkspace, api } from "./context";
import { Field, Form } from "./ui";
import type { Interview } from "@/lib/types";
import { interviewMarkdown } from "@/lib/interview-practice";

export default function InterviewView({
  session: initial,
  onBack,
}: {
  session: Interview;
  onBack: () => void;
}) {
  const { data, refresh, notify, acceptInterview } = useWorkspace();
  const [session, setSession] = useState(initial);
  const latest = useRef(initial);
  const [index, setIndex] = useState(
    Math.min(
      initial.state?.index || 0,
      Math.max(initial.questions.length - 1, 0),
    ),
  );
  const [answer, setAnswer] = useState(
    initial.turns[initial.state?.index || 0]?.answer || "",
  );
  const [questions, setQuestions] = useState(initial.questions);
  const [busy, setBusy] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [target, setTarget] = useState("");
  const pending = useRef(Promise.resolve());
  const draft = useRef({ index, answer });
  draft.current = { index, answer };
  useEffect(
    () => () => {
      const last = draft.current;
      void persist(last.index, last.answer).catch((e) =>
        notify(`回答保存失败：${e.message}`),
      );
    },
    [],
  );

  function accept(value: Interview) {
    latest.current = value;
    setSession(value);
    acceptInterview?.(value);
    return value;
  }
  async function request(action: string, values: Record<string, unknown> = {}) {
    const s = latest.current;
    return accept(
      await api("/api/interviews", {
        action,
        id: s.id,
        version: s.version,
        ...values,
      }),
    );
  }
  function persist(i: number, value: string) {
    const task = pending.current
      .catch(() => {})
      .then(async () => {
        if ((latest.current.turns[i]?.answer || "") === value) return;
        setSaving(true);
        try {
          await request("answer", { index: i, answer: value });
        } finally {
          setSaving(false);
        }
      });
    pending.current = task;
    return task;
  }
  useEffect(() => {
    if (answer === (latest.current.turns[index]?.answer || "")) return;
    const timer = setTimeout(
      () => void persist(index, answer).catch((e) => setError(e.message)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [answer, index]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (answer !== (latest.current.turns[index]?.answer || "")) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [answer, index]);
  async function run(action: string, values: Record<string, unknown> = {}) {
    setBusy(action);
    setError("");
    try {
      await persist(index, answer);
      const result = await request(action, values);
      if (action === "followup" || action === "progress") {
        const next = result.state?.index || 0;
        setIndex(next);
        setAnswer(result.turns[next]?.answer || "");
        setTarget("");
      }
      if (action === "regenerate") setQuestions(result.questions);
      if (action === "confirm") {
        await refresh();
        notify("已保存到练习资料库，旧版本保留。");
      }
      return result;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const turn = session.turns[index];
  const question = session.questions[index];
  const setup = session.state?.started === false;
  const disabled = !!busy || saving;
  function download() {
    const url = URL.createObjectURL(
      new Blob([interviewMarkdown(session)], {
        type: "text/markdown;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `面试练习-${session.id}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <button
            className="back-link"
            disabled={disabled}
            onClick={async () => {
              setBusy("back");
              try {
                await persist(index, answer);
                await refresh();
                onBack();
              } catch (e) {
                setError((e as Error).message);
                setBusy("");
              }
            }}
          >
            <ArrowLeft size={16} />
            返回面试准备
          </button>
          <h1>
            模拟面试 <span className="script">Let's practice</span>
          </h1>
          <p>
            {setup
              ? "先核对资料和题目，再开始练习。"
              : "回答、追问和复盘都会保留，可以随时回来继续。"}
          </p>
        </div>
        <button
          className="secondary"
          disabled={disabled || answer !== (turn?.answer || "")}
          onClick={download}
        >
          导出 Markdown / Obsidian
        </button>
      </div>
      {error && (
        <p className="notice-paper" role="alert">
          {error}（当前输入仍保留）
        </p>
      )}
      {session.state?.context && (
        <details className="paper-panel">
          <summary>本场使用的个人材料</summary>
          <p>
            {session.state.context.resume
              ? `简历：${session.state.context.resume.name}${session.state.context.resume.truncated ? "（节选）" : ""}`
              : "未读取简历正文"}
          </p>
          {session.state.context.materials.map((m) => (
            <p key={m.id}>
              {m.title} · v{m.version}
              {m.truncated ? "（节选）" : ""}
            </p>
          ))}
          <p className="help">
            使用的是开始练习时的资料快照，之后的笔记修改不会改写本场历史。
          </p>
        </details>
      )}
      {(setup || session.sources.length > 0) && (
        <details className="paper-panel" open={setup}>
          <summary>调研结果与来源（{session.sources.length}）</summary>
          {!session.sources.length && (
            <p>没有公开来源；仅依据岗位与个人材料生成的题目属于推测练习题。</p>
          )}
          {session.sources.map((s) => (
            <article key={s.id}>
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.title} ↗
              </a>
              <p className="pre-wrap">{s.description}</p>
              <small>
                {s.kind} · 检索：
                {new Date(s.retrievedAt).toLocaleString("zh-CN")} · 发布日期：
                {s.published}
              </small>
            </article>
          ))}
        </details>
      )}
      {setup ? (
        <section className="paper-panel">
          {(session.state?.researchError || session.state?.generationError) && (
            <p role="alert" className="notice-paper">
              {session.state.researchError || session.state.generationError}
              。已保存的资料仍保留，可以重试或手动填写题目。
            </p>
          )}
          <div className="card-actions">
            <button
              className="secondary"
              disabled={disabled}
              onClick={() => run("regenerate", { search: true })}
            >
              重新调研并出题
            </button>
            <button
              className="secondary"
              disabled={disabled}
              onClick={() => run("regenerate", { search: false })}
            >
              使用已保存资料重新出题
            </button>
          </div>
          {questions.map((q, i) => (
            <Field key={i} label={`第 ${i + 1} 题 · ${q.basis}`}>
              <textarea
                value={q.question}
                disabled={disabled}
                onChange={(e) =>
                  setQuestions((all) =>
                    all.map((v, n) =>
                      n === i ? { ...v, question: e.target.value } : v,
                    ),
                  )
                }
              />
              <button
                className="text-button"
                disabled={disabled}
                onClick={() =>
                  setQuestions((all) => all.filter((_, n) => n !== i))
                }
              >
                移除这道题
              </button>
            </Field>
          ))}
          <button
            className="secondary"
            disabled={disabled || questions.length >= 30}
            onClick={() =>
              setQuestions((all) => [
                ...all,
                { question: "", sourceIds: [], basis: "用户自定义练习题" },
              ])
            }
          >
            添加自己的问题
          </button>
          <button
            className="primary"
            disabled={
              disabled ||
              !questions.length ||
              questions.some((q) => !q.question.trim())
            }
            onClick={() => run("start", { questions })}
          >
            {busy ? "正在处理…" : "确认题目，开始练习"}
          </button>
        </section>
      ) : question ? (
        <section className="paper-panel interview-question">
          <span className="status-badge">
            第 {index + 1} / {session.questions.length} 题 ·{" "}
            {question.sourceIds.length ? "参考公开摘要" : "自定义或推测练习题"}
          </span>
          <h2>{question.question}</h2>
          <p className="muted">{question.basis}</p>
          <Field label="你的回答（停止输入 1 秒后自动保存）">
            <textarea
              rows={8}
              value={answer}
              disabled={!!busy}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="像面对面交流一样，把你的回答写下来。"
            />
          </Field>
          <p role="status" className="help">
            {saving
              ? "正在保存…"
              : answer === (turn?.answer || "")
                ? "回答已保存"
                : "有尚未保存的修改"}
          </p>
          <div className="card-actions">
            <button
              className="secondary"
              disabled={disabled}
              onClick={() => run("progress", { index })}
            >
              保存回答
            </button>
            <button
              className="primary"
              disabled={disabled || !answer.trim()}
              onClick={() => run("feedback", { index })}
            >
              {busy === "feedback" ? "正在整理反馈…" : "反馈并生成建议稿"}
            </button>
            <button
              className="secondary"
              disabled={disabled || !answer.trim()}
              onClick={() => run("followup", { index })}
            >
              {busy === "followup" ? "正在生成追问…" : "围绕我的回答追问"}
            </button>
          </div>
          {turn?.feedback && (
            <div className="feedback">
              <h3>回答反馈</h3>
              <p className="pre-wrap">{turn.feedback}</p>
              {turn.confirmed ? (
                <>
                  <span className="status-badge">已保存到资料库</span>
                  <p className="pre-wrap">{turn.suggestion}</p>
                </>
              ) : (
                <Form
                  disabled={disabled}
                  submit="确认保存到练习库"
                  onSubmit={async (f) => {
                    const material = data.materials.find(
                      (m) => m.id === target,
                    );
                    const result = await run("confirm", {
                      index,
                      content: String(f.get("content")),
                      ...(material
                        ? {
                            materialId: material.id,
                            materialVersion: material.version,
                          }
                        : {}),
                    });
                    if (!result) throw Error("保存未完成，请查看提示并重试");
                  }}
                >
                  <Field label="建议稿（可以修改后保存）">
                    <textarea
                      disabled={disabled}
                      key={`${index}-${turn.suggestion}`}
                      rows={8}
                      name="content"
                      defaultValue={turn.suggestion}
                    />
                  </Field>
                  <Field label="保存方式">
                    <select
                      disabled={disabled}
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                    >
                      <option value="">新建练习条目</option>
                      {data.materials.filter((m) => ["question", "legacy"].includes(materialFormat(m))).map((m) => (
                        <option key={m.id} value={m.id}>
                          {materialFormat(m) === "question"
                            ? "追加回答版本："
                            : "更新："}
                          {m.title}（v{m.version}）
                        </option>
                      ))}
                    </select>
                  </Field>
                  {target && (
                    <details>
                      <summary>核对将更新的原文（旧版本会保留）</summary>
                      <p className="pre-wrap">
                        {data.materials.find((m) => m.id === target)?.content}
                      </p>
                    </details>
                  )}
                </Form>
              )}
            </div>
          )}
          {!!turn?.history?.length && (
            <details>
              <summary>此前的回答和反馈（{turn.history.length}）</summary>
              {turn.history.map((h, i) => (
                <article key={i}>
                  <small>{new Date(h.at).toLocaleString("zh-CN")}</small>
                  <p className="pre-wrap">{h.answer}</p>
                  <p className="pre-wrap">{h.feedback}</p>
                  <p className="pre-wrap">{h.suggestion}</p>
                </article>
              ))}
            </details>
          )}
          <div className="pagination">
            <button
              className="secondary"
              disabled={disabled || index === 0}
              onClick={() => run("progress", { index: index - 1 })}
            >
              上一题
            </button>
            <button
              className="secondary"
              disabled={disabled || index === session.questions.length - 1}
              onClick={() => run("progress", { index: index + 1 })}
            >
              下一题 / 跳过
            </button>
            <button
              className="primary"
              disabled={
                disabled ||
                (!answer.trim() && !session.turns.some((t) => t?.answer))
              }
              onClick={() => run("finish")}
            >
              {busy === "finish" ? "正在整场复盘…" : "结束并生成整场复盘"}
            </button>
          </div>
        </section>
      ) : (
        <section className="paper-panel">
          暂无题目，请返回面试准备重新开始。
        </section>
      )}
      {session.state?.review && (
        <section className="paper-panel">
          <h2>整场复盘</h2>
          <p className="pre-wrap">{session.state.review}</p>
          <p className="help">
            本次记录已保存。建议稿需要逐题确认后才会更新正式练习库。
          </p>
        </section>
      )}
    </>
  );
}
