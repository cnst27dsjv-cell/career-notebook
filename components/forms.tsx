"use client";
import { useState } from "react";
import type { Application, Event, Material, Prep } from "@/lib/types";
import { kinds, stages, outcomes } from "@/lib/types";
import { useWorkspace, inputDate, iso } from "./context";
import { Modal, Form, Field } from "./ui";
import { materialKindsForCategory } from "@/lib/material-import";
const val = (f: FormData, key: string) => String(f.get(key) || "");
export function ApplicationForm({
  item,
  onClose,
}: {
  item?: Application;
  onClose: () => void;
}) {
  const { data, mutate } = useWorkspace();
  return (
    <Modal
      title={item ? "投递详情 · " + item.company : "记录一份新机会"}
      onClose={onClose}
    >
      <Form
        onClose={onClose}
        onSubmit={async (f) =>
          mutate({
            action: "application.save",
            id: item?.id,
            version: item?.version,
            values: {
              company: val(f, "company"),
              role: val(f, "role"),
              city: val(f, "city"),
              batch: val(f, "batch"),
              stage: val(f, "stage"),
              stageStatus: val(f, "stageStatus"),
              outcome: val(f, "outcome"),
              appliedAt: iso(f.get("appliedAt")),
              url: val(f, "url"),
              notes: val(f, "notes"),
              resumeId: val(f, "resumeId") || null,
            },
          })
        }
      >
        <div className="form-grid">
          <Field label="公司">
            <input
              required
              name="company"
              defaultValue={item?.company}
              placeholder="例如：字节跳动"
            />
          </Field>
          <Field label="岗位">
            <input
              required
              name="role"
              defaultValue={item?.role}
              placeholder="例如：产品经理"
            />
          </Field>
          <Field label="城市">
            <input
              name="city"
              defaultValue={item?.city}
              placeholder="例如：上海"
            />
          </Field>
          <Field label="招聘批次">
            <input
              required
              name="batch"
              defaultValue={item?.batch || "2027 届秋招"}
            />
          </Field>
          <Field label="当前阶段">
            <select name="stage" defaultValue={item?.stage || "待投递"}>
              {stages.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="阶段状态">
            <select
              name="stageStatus"
              defaultValue={item?.stageStatus || "待安排"}
            >
              {["待安排", "待完成", "等待结果"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="投递时间（北京时间）">
            <input
              type="datetime-local"
              name="appliedAt"
              defaultValue={inputDate(item?.appliedAt)}
            />
          </Field>
          <Field label="终止结果">
            <select name="outcome" defaultValue={item?.outcome || ""}>
              <option value="">仍在进行</option>
              {outcomes.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="实际使用的简历版本">
          <select name="resumeId" defaultValue={item?.resumeId || ""}>
            <option value="">暂未关联简历</option>
            {data.resumes.map((r) => (
              <option value={r.id} key={r.id}>
                {r.series} · v{r.number}
              </option>
            ))}
          </select>
        </Field>
        <Field label="职位链接">
          <input
            type="url"
            name="url"
            defaultValue={item?.url}
            placeholder="https://…"
          />
        </Field>
        <Field label="备注与下一步">
          <textarea name="notes" defaultValue={item?.notes} rows={3} />
        </Field>
        {item && (
          <details className="history">
            <summary>查看阶段历史 · {item.history.length} 条</summary>
            {item.history
              .slice()
              .reverse()
              .map((h, i) => (
                <p key={i}>
                  {new Date(h.at).toLocaleDateString("zh-CN", {
                    timeZone: "Asia/Shanghai",
                  })}{" "}
                  · {h.from} → {h.to}
                </p>
              ))}
          </details>
        )}
      </Form>
    </Modal>
  );
}
export function EventForm({
  item,
  onClose,
}: {
  item?: Partial<Event>;
  onClose: () => void;
}) {
  const { data, mutate, notify } = useWorkspace();
  return (
    <Modal title={item?.id ? "调整日程" : "写下一项安排"} onClose={onClose}>
      <Form
        onClose={onClose}
        onSubmit={async (f) =>
          mutate({
            action: "event.save",
            id: item?.id,
            version: item?.version,
            allowConflict: f.get("allowConflict") === "on",
            values: {
              title: val(f, "title"),
              kind: val(f, "kind"),
              applicationId: val(f, "applicationId") || null,
              start: iso(f.get("start")),
              end: iso(f.get("end")),
              deadline: iso(f.get("deadline")),
              location: val(f, "location"),
              notes: val(f, "notes"),
              reminderHours: [
                ...f.getAll("reminderHours").map(Number),
                ...(val(f, "customHours")
                  ? [Number(val(f, "customHours"))]
                  : []),
              ],
              absoluteReminders: f
                .getAll("absoluteReminder")
                .filter(Boolean)
                .map((v) => iso(v)),
            },
          })
        }
      >
        <Field label="日程名称">
          <input
            required
            name="title"
            defaultValue={item?.title}
            placeholder="例如：产品经理一面"
          />
        </Field>
        <div className="form-grid">
          <Field label="类型">
            <select name="kind" defaultValue={item?.kind || "面试"}>
              {kinds.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </Field>
          <Field label="关联投递">
            <select
              name="applicationId"
              defaultValue={item?.applicationId || ""}
            >
              <option value="">不关联岗位</option>
              {data.applications.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.company} · {a.role}
                </option>
              ))}
            </select>
          </Field>
          <Field label="执行开始（北京时间）">
            <input
              type="datetime-local"
              name="start"
              defaultValue={inputDate(item?.start)}
            />
          </Field>
          <Field label="执行结束">
            <input
              type="datetime-local"
              name="end"
              defaultValue={inputDate(item?.end)}
            />
          </Field>
        </div>
        <Field label="截止时间（可与执行时间不同）">
          <input
            type="datetime-local"
            name="deadline"
            defaultValue={inputDate(item?.deadline)}
          />
        </Field>
        <Field label="地点 / 会议链接">
          <input name="location" defaultValue={item?.location} />
        </Field>
        <fieldset className="checks">
          <legend>提前提醒</legend>
          {[
            [24, "1 天前"],
            [2, "2 小时前"],
            [0.5, "30 分钟前"],
          ].map(([n, label]) => (
            <label key={n}>
              <input
                name="reminderHours"
                type="checkbox"
                value={n}
                defaultChecked={(item?.reminderHours || [24]).includes(
                  Number(n),
                )}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <div className="form-grid">
          <Field label="额外提前提醒（小时）">
            <input
              name="customHours"
              type="number"
              min="0"
              max="720"
              step="0.5"
              placeholder="例如：6"
              defaultValue={item?.reminderHours?.find(
                (h) => ![24, 2, 0.5].includes(h),
              )}
            />
          </Field>
          <Field label="或指定提醒时间（北京时间）">
            <input
              name="absoluteReminder"
              type="datetime-local"
              defaultValue={inputDate(item?.absoluteReminders?.[0])}
            />
          </Field>
        </div>
        <p className="help">
          默认提前 1
          天；若该时间已过去，可选择更短提前量或指定未来时刻。邮件需在设置中验证收件邮箱。
        </p>
        <label className="check">
          <input name="allowConflict" type="checkbox" />
          允许与已有日程冲突
        </label>
        <Field label="备注">
          <textarea name="notes" defaultValue={item?.notes} rows={3} />
        </Field>
      </Form>
      {item?.id && (
        <div className="card-actions">
          <button
            className="secondary"
            onClick={async () => {
              try {
                await mutate({
                  action: "event.status",
                  id: item.id,
                  version: item.version,
                  status: item.status === "已完成" ? "待完成" : "已完成",
                });
                onClose();
              } catch (e) {
                notify((e as Error).message);
              }
            }}
          >
            {item.status === "已完成" ? "撤销完成" : "标记已完成"}
          </button>
          {item.kind === "面试" && (
            <a
              className="secondary"
              href={"/?view=preparations&event=" + item.id}
            >
              面试准备
            </a>
          )}
          <button
            className="text-button"
            onClick={async () => {
              if (!window.confirm("删除这项日程？尚未发送的提醒将取消。"))
                return;
              try {
                await mutate({ action: "event.delete", id: item.id });
                onClose();
              } catch (e) {
                notify((e as Error).message);
              }
            }}
          >
            删除日程
          </button>
        </div>
      )}
    </Modal>
  );
}
export function PrepForm({
  item,
  onClose,
}: {
  item?: Partial<Prep>;
  onClose: () => void;
}) {
  const { data, mutate } = useWorkspace();
  return (
    <Modal title="新建面试准备" onClose={onClose}>
      <Form
        onClose={onClose}
        onSubmit={async (f) =>
          mutate({
            action: "preparation.save",
            id: item?.id,
            values: {
              company: val(f, "company"),
              role: val(f, "role"),
              round: val(f, "round"),
              jd: val(f, "jd"),
              applicationId: val(f, "applicationId") || null,
              eventId: val(f, "eventId") || null,
              resumeId: val(f, "resumeId") || null,
            },
          })
        }
      >
        <div className="form-grid">
          <Field label="公司">
            <input required name="company" defaultValue={item?.company} />
          </Field>
          <Field label="岗位">
            <input required name="role" defaultValue={item?.role} />
          </Field>
          <Field label="面试轮次">
            <input name="round" defaultValue={item?.round || "一面"} />
          </Field>
          <Field label="关联投递">
            <select
              name="applicationId"
              defaultValue={item?.applicationId || ""}
            >
              <option value="">暂不关联</option>
              {data.applications.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.company} · {a.role}
                </option>
              ))}
            </select>
          </Field>
          <Field label="面试日程">
            <select name="eventId" defaultValue={item?.eventId || ""}>
              <option value="">暂不关联</option>
              {data.events
                .filter((e) => e.kind === "面试")
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="本次简历">
            <select name="resumeId" defaultValue={item?.resumeId || ""}>
              <option value="">暂不关联</option>
              {data.resumes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.series} v{r.number}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="岗位描述 / JD">
          <textarea
            rows={6}
            name="jd"
            defaultValue={item?.jd}
            placeholder="粘贴岗位职责和要求，让助理找到更适合复用的内容。"
          />
        </Field>
      </Form>
    </Modal>
  );
}
export function MaterialForm({
  item,
  prepId,
  onClose,
}: {
  item?: Partial<Material>;
  prepId?: string;
  onClose: () => void;
}) {
  const { data, mutate } = useWorkspace();
  const [category, setCategory] = useState(item?.category || "待确认");
  const kindOptions = materialKindsForCategory(category);
  const [kind, setKind] = useState(
    item?.kind && kindOptions.includes(item.kind) ? item.kind : kindOptions[0],
  );
  return (
    <Modal
      title={item?.id ? "编辑准备资料" : "添加准备资料"}
      onClose={onClose}
      wide
    >
      <Form
        onClose={onClose}
        onSubmit={async (f) =>
          mutate({
            action: "material.save",
            id: item?.id,
            version: item?.version,
            values: {
              title: val(f, "title"),
              content: val(f, "content"),
              category: val(f, "category"),
              kind: val(f, "kind"),
              roleScope: val(f, "roleScope"),
              tags: val(f, "tags"),
              preparationId: prepId || item?.preparationId || null,
              parentId: item?.parentId || null,
              source: item?.source || "手动整理",
            },
          })
        }
      >
        <div className="form-grid">
          <Field label="标题 / 面试问题">
            <input required name="title" defaultValue={item?.title} />
          </Field>
          <Field label="一级类目">
            <select
              name="category"
              value={category}
              onChange={(event) => {
                const next = event.target.value;
                setCategory(next);
                const nextKinds = materialKindsForCategory(next);
                if (!nextKinds.includes(kind)) setKind(nextKinds[0]);
              }}
            >
              {["岗位特有", "通用问题", "待确认"].map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </Field>
          <Field label="二级类目">
            <select
              name="kind"
              value={kind}
              onChange={(event) => setKind(event.target.value)}
            >
              {kindOptions.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </Field>
          <Field label="适用岗位">
            <input
              name="roleScope"
              list="material-role-options"
              required={category === "岗位特有"}
              disabled={category === "通用问题"}
              defaultValue={item?.roleScope}
              placeholder={
                category === "岗位特有"
                  ? "例如：私募基金运营"
                  : "通用问题不需要填写"
              }
            />
            <datalist id="material-role-options">
              {(data.materialRoles || []).map((role) => (
                <option key={role.id} value={role.name} />
              ))}
            </datalist>
          </Field>
        </div>
        <Field label="逐字稿 / 正文">
          <textarea
            rows={12}
            required
            name="content"
            defaultValue={item?.content}
            placeholder="粘贴你已经整理的内容，或者从这里开始写。"
          />
        </Field>
        <Field label="标签">
          <input
            name="tags"
            defaultValue={item?.tags}
            placeholder="例如：产品经理 用户研究 项目复盘"
          />
        </Field>
        {item?.revisions && item.revisions.length > 0 && (
          <details className="history">
            <summary>历史版本 · {item.revisions.length} 份</summary>
            {item.revisions.map((r, i) => (
              <div key={i}>
                <small>{r.at}</small>
                <p className="pre-wrap">{r.content}</p>
              </div>
            ))}
          </details>
        )}
      </Form>
    </Modal>
  );
}
