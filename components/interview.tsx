"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Sparkle } from "@phosphor-icons/react";
import { useWorkspace, api } from "./context";
import { Field, Form } from "./ui";
import type { Interview } from "@/lib/types";
export default function InterviewView({
  session,
  onBack,
}: {
  session: Interview;
  onBack: () => void;
}) {
  const { refresh, notify } = useWorkspace();
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState(session.turns[0]?.answer || "");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const latest = useRef(session);
  latest.current = session;
  const pending = useRef(Promise.resolve());
  const turn = session.turns[index];
  const question = session.questions[index];
  function persist(i: number, content: string) {
    const task = pending.current
      .catch(() => {})
      .then(async () => {
        const current = latest.current;
        if ((current.turns[i]?.answer || "") === content) return;
        setSaving(true);
        try {
          const result = await api("/api/data", {
            action: "interview.answer",
            id: current.id,
            index: i,
            answer: content,
            version: current.version,
          });
          const turns = [...current.turns];
          turns[i] = { answer: content };
          latest.current = { ...current, version: result.version, turns };
          await refresh();
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
      () => void persist(index, answer).catch((e) => notify(e.message)),
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
  async function go(next: number) {
    try {
      await persist(index, answer);
      setIndex(next);
      setAnswer(latest.current.turns[next]?.answer || "");
    } catch (e) {
      notify((e as Error).message);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <button
            className="back-link"
            onClick={async () => {
              try {
                await persist(index, answer);
                onBack();
              } catch (e) {
                notify((e as Error).message);
              }
            }}
          >
            <ArrowLeft size={16} />
            返回面试准备
          </button>
          <h1>
            模拟面试 <span className="script">Let's practice</span>
          </h1>
          <p>先真实地表达，再一起把回答打磨好。</p>
        </div>
        <span>
          第 {index + 1} / {session.questions.length} 题
        </span>
      </div>
      <section className="paper-panel interview-question">
        <span className="status-badge">
          {question.sourceIds.length
            ? "参考公开资料"
            : question.basis === "用户自定义练习题"
              ? "自定义练习题"
              : "推测练习题"}
        </span>
        <h2>{question.question}</h2>
        <p className="muted">{question.basis}</p>
        {session.sources
          .filter((s) => question.sourceIds.includes(s.id))
          .map((s) => (
            <a
              className="source-link"
              key={s.id}
              href={s.url}
              target="_blank"
              rel="noreferrer"
            >
              {s.title} ↗
              <small>
                {s.kind} · 发布：{s.published} · 检索：
                {new Date(s.retrievedAt).toLocaleDateString("zh-CN")}
              </small>
            </a>
          ))}
        <Field label="你的回答（停止输入 1 秒后自动保存草稿）">
          <textarea
            rows={8}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="像面对面交流一样，把你的回答写下来。"
          />
        </Field>
        <p className="help" role="status">
          {saving
            ? "正在保存…"
            : answer === (turn?.answer || "")
              ? "回答草稿已保存"
              : "有尚未保存的修改"}
        </p>
        <div className="card-actions">
          <button
            className="secondary"
            disabled={busy || saving}
            onClick={() =>
              persist(index, answer)
                .then(() => notify("回答草稿已保存"))
                .catch((e) => notify(e.message))
            }
          >
            保存回答
          </button>
          <button
            className="primary"
            disabled={busy || !answer.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await persist(index, answer);
                await api("/api/ai", {
                  action: "feedback",
                  id: session.id,
                  index,
                });
                await refresh();
              } catch (e) {
                notify((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Sparkle size={17} />
            {busy ? "正在整理…" : "反馈并生成逐字稿"}
          </button>
        </div>
        {turn?.suggestion && (
          <div className="feedback">
            <h3>回答反馈</h3>
            <p>{turn.feedback}</p>
            {turn.confirmed ? (
              <>
                <span className="status-badge">已确认保存到资料库</span>
                <p className="pre-wrap">{turn.suggestion}</p>
              </>
            ) : (
              <Form
                submit="确认保存到资料库"
                onSubmit={async (f) => {
                  await api("/api/data", {
                    action: "interview.confirm",
                    id: session.id,
                    index,
                    version: latest.current.version,
                    content: String(f.get("content")),
                  });
                  await refresh();
                  notify("逐字稿已保存，后续面试可以复用。");
                }}
              >
                <Field label="逐字稿建议（可继续修改）">
                  <textarea
                    key={index + "-" + turn.suggestion}
                    rows={8}
                    name="content"
                    defaultValue={turn.suggestion}
                  />
                </Field>
              </Form>
            )}
          </div>
        )}
        <div className="pagination">
          <button
            className="secondary"
            disabled={index === 0 || busy || saving}
            onClick={() => go(index - 1)}
          >
            上一题
          </button>
          <button
            className="secondary"
            disabled={index === session.questions.length - 1 || busy || saving}
            onClick={() => go(index + 1)}
          >
            下一题 / 跳过
          </button>
        </div>
      </section>
    </>
  );
}
