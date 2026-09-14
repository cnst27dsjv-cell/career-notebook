"use client";
import { useState } from "react";
import {
  PaperPlaneTilt,
  Sparkle,
  ArrowRight,
  NotePencil,
} from "@phosphor-icons/react";
import { api } from "./context";
import { EventForm, ApplicationForm } from "./forms";
import { Field } from "./ui";
import type { Event, Application } from "@/lib/types";
type Result = {
  title: string;
  kind: string;
  start: string | null;
  deadline: string | null;
  notes: string;
  missing: string[];
  slots: string[];
};
export default function Assistant() {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState("schedule");
  const [appDraft, setAppDraft] = useState<{
    application: Application;
    before: Application;
    missing: string[];
  }>();
  const [appEdit, setAppEdit] = useState<Application>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result>();
  const [edit, setEdit] = useState<Partial<Event>>();
  return (
    <div className="assistant-page">
      <div className="assistant-intro">
        <span className="assistant-emblem">
          <Sparkle size={32} weight="duotone" />
        </span>
        <p className="script">A little help, a little clarity.</p>
        <h1>把繁琐的整理，交给我。</h1>
        <p>
          粘贴招聘邮件或通知正文，我会提取安排，
          <br />
          再由你确认每一个重要细节。
        </p>
      </div>
      <div className="assistant-prompts">
        <button
          onClick={() => setInput("请帮我整理下面这封测评邮件的安排：\n")}
        >
          <NotePencil size={20} />
          <span>整理一封测评邮件</span>
          <ArrowRight size={16} />
        </button>
        <button
          onClick={() => setInput("请帮我提取以下面试通知的时间和注意事项：\n")}
        >
          <NotePencil size={20} />
          <span>安排一场面试</span>
          <ArrowRight size={16} />
        </button>
      </div>
      <div className="sub-tabs">
        <button
          className={mode === "schedule" ? "active" : ""}
          onClick={() => setMode("schedule")}
        >
          整理日程
        </button>
        <button
          className={mode === "application" ? "active" : ""}
          onClick={() => setMode("application")}
        >
          更新投递进度
        </button>
      </div>
      <form
        className="assistant-composer"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            if (mode === "application") {
              setAppDraft(await api("/api/ai", { action: mode, input }));
              setResult(undefined);
            } else {
              setResult(await api("/api/ai", { action: mode, input }));
              setAppDraft(undefined);
            }
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <textarea
          required
          aria-label="给助理的内容"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="把邮件或招聘通知正文粘贴在这里…"
          rows={5}
        />
        <div>
          <small>使用你提交的文本及匹配的岗位信息 · 确认后保存</small>
          <button className="primary" disabled={busy || !input.trim()}>
            {busy
              ? "正在整理…"
              : mode === "application"
                ? "生成更新草稿"
                : "整理安排"}
            <PaperPlaneTilt size={17} />
          </button>
        </div>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {appDraft && (
        <section className="paper-panel assistant-result">
          <span className="status-badge">投递更新草稿</span>
          <h2>
            {appDraft.application.company} · {appDraft.application.role}
          </h2>
          <p>
            {appDraft.before.stage} · {appDraft.before.stageStatus} →{" "}
            {appDraft.application.stage} · {appDraft.application.stageStatus}
          </p>
          {appDraft.missing.length > 0 && (
            <p className="error">{appDraft.missing.join("、")}</p>
          )}
          <button
            className="primary"
            onClick={() => setAppEdit(appDraft.application)}
          >
            核对并更新投递
          </button>
        </section>
      )}
      {appEdit && (
        <ApplicationForm item={appEdit} onClose={() => setAppEdit(undefined)} />
      )}
      {result && (
        <section className="paper-panel assistant-result">
          <span className="status-badge">待确认草稿</span>
          <h2>{result.title}</h2>
          <p>
            执行：{result.start || "需要补充"}
            <br />
            截止：{result.deadline || "未提取到"}
          </p>
          <p>{result.notes}</p>
          {result.missing.length > 0 && (
            <p className="error">请核对：{result.missing.join("、")}</p>
          )}
          {result.slots.length > 0 && (
            <Field label="推荐空闲时段">
              <select
                onChange={(e) =>
                  setResult({ ...result, start: e.target.value })
                }
              >
                <option value="">选择执行时间</option>
                {result.slots.map((s) => (
                  <option key={s} value={s}>
                    {new Date(s).toLocaleString("zh-CN", {
                      timeZone: "Asia/Shanghai",
                    })}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <button
            className="primary"
            onClick={() =>
              setEdit({
                title: result.title,
                kind: result.kind,
                start: result.start,
                deadline: result.deadline,
                notes: result.notes,
              })
            }
          >
            核对并添加日程
            <ArrowRight size={17} />
          </button>
        </section>
      )}
    </div>
  );
}
