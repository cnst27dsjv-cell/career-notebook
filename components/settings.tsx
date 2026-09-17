"use client";
import { useState } from "react";
import {
  EnvelopeSimple,
  CheckCircle,
  Download,
  ArrowSquareOut,
} from "@phosphor-icons/react";
import { useWorkspace, api } from "./context";
import { Form, Field } from "./ui";
export default function Settings() {
  const { data, mutate, notify } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [connectionBusy, setConnectionBusy] = useState<
    "model" | "search" | null
  >(null);
  const testConnection = async (target: "model" | "search") => {
    setConnectionBusy(target);
    try {
      const result = await api("/api/ai", { action: "connection", target });
      notify(
        target === "model"
          ? "AI 连接成功，测试未包含个人资料。"
          : `联网搜索成功，取得 ${result.sourceCount} 个来源。`,
      );
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setConnectionBusy(null);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            偏好设置 <span className="script">Make it yours</span>
          </h1>
          <p>让这本手账，慢慢适应你的节奏。</p>
        </div>
      </div>
      <div className="settings-grid">
        <section className="paper-panel">
          <h2>
            <EnvelopeSimple size={21} />
            提醒与时间
          </h2>
          <Form
            submit="保存偏好"
            onSubmit={async (f) => {
              await mutate({
                action: "settings.save",
                values: {
                  email: String(f.get("email")),
                  availabilityConfirmed: f.get("confirmed") === "on",
                  availability: {
                    weekdays: [
                      Number(f.get("weekdayStart")),
                      Number(f.get("weekdayEnd")),
                    ],
                    weekends: [
                      Number(f.get("weekendStart")),
                      Number(f.get("weekendEnd")),
                    ],
                  },
                },
              });
              notify("偏好已保存");
            }}
          >
            <Field label="提醒收件邮箱">
              <input
                type="email"
                name="email"
                defaultValue={data.settings.email}
                placeholder="你的 QQ 邮箱"
              />
            </Field>
            <p className="help">
              {data.settings.emailVerified
                ? "邮箱已验证。"
                : "邮箱尚未验证，保存后发送测试邮件完成验证。"}
            </p>
            <button
              className="secondary"
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api("/api/data", { action: "mail.test" });
                  notify(
                    data.services.mailMode === "capture"
                      ? "测试邮件已发送到本地邮件收件箱。"
                      : "验证邮件已发送，请检查收件箱。",
                  );
                } catch (e) {
                  notify((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "正在发送…" : "发送测试 / 验证邮件"}
            </button>
            <h3>可用于准备的时间</h3>
            <div className="form-grid">
              <Field label="工作日开始（小时）">
                <input
                  type="number"
                  min="0"
                  max="23"
                  name="weekdayStart"
                  defaultValue={data.settings.availability.weekdays[0]}
                />
              </Field>
              <Field label="工作日结束（小时）">
                <input
                  type="number"
                  min="1"
                  max="24"
                  name="weekdayEnd"
                  defaultValue={data.settings.availability.weekdays[1]}
                />
              </Field>
              <Field label="周末开始（小时）">
                <input
                  type="number"
                  min="0"
                  max="23"
                  name="weekendStart"
                  defaultValue={data.settings.availability.weekends[0]}
                />
              </Field>
              <Field label="周末结束（小时）">
                <input
                  type="number"
                  min="1"
                  max="24"
                  name="weekendEnd"
                  defaultValue={data.settings.availability.weekends[1]}
                />
              </Field>
            </div>
            <label className="check">
              <input
                type="checkbox"
                name="confirmed"
                defaultChecked={data.settings.availabilityConfirmed}
              />
              已确认时段，允许助理推荐空闲时间
            </label>
          </Form>
        </section>
        <div>
          <section className="paper-panel service-panel">
            <h2>服务连接</h2>
            <div>
              <span>日程后台</span>
              <b>
                {data.services.worker &&
                Date.now() - Date.parse(data.services.worker) < 120000
                  ? "运行中"
                  : "尚未启动或已离线"}
              </b>
            </div>
            <div>
              <span>邮件提醒</span>
              <b>
                {data.services.mailMode === "live"
                  ? "真实发送"
                  : "本地测试收件箱"}
              </b>
            </div>
            <div>
              <span>AI 助理</span>
              <b>
                {data.services.model
                  ? data.services.generalModel
                  : "待填写密钥"}
              </b>
            </div>
            <div>
              <span>中文润色</span>
              <b>{data.services.polishModel || "跟随默认模型"}</b>
            </div>
            <div>
              <span>联网调研</span>
              <b>
                {data.services.search
                  ? data.services.searchModel
                  : "待填写密钥"}
              </b>
            </div>
            <div className="service-test-actions">
              <button
                className="secondary"
                type="button"
                disabled={connectionBusy !== null || !data.services.model}
                onClick={() => testConnection("model")}
              >
                {connectionBusy === "model" ? "正在测试…" : "测试 AI 连接"}
              </button>
              <button
                className="secondary"
                type="button"
                disabled={connectionBusy !== null || !data.services.search}
                onClick={() => testConnection("search")}
              >
                {connectionBusy === "search"
                  ? "正在搜索…"
                  : "测试联网搜索"}
              </button>
            </div>
            {data.services.mailMode === "capture" && (
              <a
                className="text-button"
                href="http://localhost:8026"
                target="_blank"
                rel="noreferrer"
              >
                打开测试收件箱
                <ArrowSquareOut size={16} />
              </a>
            )}
            <p className="help">
              测试只发送公开的固定文字，但仍会消耗少量模型额度。模型密钥配置在服务器环境中；QQ 邮箱自动同步、微信提醒将在后续版本接入。
            </p>
          </section>
          <section className="paper-panel export-panel">
            <h2>把资料带走</h2>
            <p className="muted">随时导出你的记录，保留一份自己的备份。</p>
            <a className="secondary" href="/api/export?format=zip">
              <Download size={17} />
              导出全部资料与原文件
            </a>
          </section>
        </div>
      </div>
      <section className="paper-panel notification-history">
        <h2>提醒记录</h2>
        {data.jobs.length ? (
          data.jobs.slice(0, 12).map((j) => (
            <div key={j.id}>
              <span>
                {data.events.find((e) => e.id === j.eventId)?.title ||
                  "已删除日程"}
              </span>
              <small>
                {new Date(j.scheduledAt).toLocaleString("zh-CN", {
                  timeZone: "Asia/Shanghai",
                })}
              </small>
              <span className="status-badge">
                {
                  (
                    {
                      pending: "待发送",
                      sending: "发送中",
                      accepted: "邮件服务器已接受",
                      failed: "失败",
                      unknown: "结果不确定",
                      cancelled: "已取消",
                      expired: "已过期",
                    } as Record<string, string>
                  )[j.state]
                }
              </span>
              {j.lastError && <small className="error">{j.lastError}</small>}
            </div>
          ))
        ) : (
          <p className="muted">设置日程提醒后，发送状态会记录在这里。</p>
        )}
      </section>
    </>
  );
}
