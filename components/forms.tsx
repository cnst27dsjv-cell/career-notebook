"use client";
import { useEffect, useState } from "react";
import type { Application, Data, Event, Material, Prep } from "@/lib/types";
import { kinds, stages, outcomes } from "@/lib/types";
import { api, useWorkspace, inputDate, iso } from "./context";
import { Modal, Form, Field } from "./ui";
import { materialKindsForCategory } from "@/lib/material-import";
import {
  ApplicationImageImport,
  type ApplicationImageFields,
  type PendingApplicationImage,
} from "./application-image-import";
import { eventKindForApplicationStage } from "@/lib/application-stage";
const val = (f: FormData, key: string) => String(f.get(key) || "");
type ApplicationScheduleDraft = {
  start: string;
  end: string;
  deadline: string;
  location: string;
  reminderHours: number[];
  customHours: string;
  absoluteReminder: string;
  allowConflict: boolean;
};
const scheduleDraft = (event?: Event): ApplicationScheduleDraft => ({
  start: inputDate(event?.start),
  end: inputDate(event?.end),
  deadline: inputDate(event?.deadline),
  location: event?.location || "",
  reminderHours: event?.reminderHours.filter((hour) =>
    [24, 2, 0.5].includes(hour),
  ) || [24],
  customHours: String(
    event?.reminderHours.find((hour) => ![24, 2, 0.5].includes(hour)) || "",
  ),
  absoluteReminder: inputDate(event?.absoluteReminders[0]),
  allowConflict: false,
});
export function ApplicationForm({
  item,
  onClose,
}: {
  item?: Application;
  onClose: () => void;
}) {
  const { data, refresh, notify } = useWorkspace();
  const [stage, setStage] = useState(item?.stage || "待投递");
  const applicationId = item?.id;
  const initialEventKind = eventKindForApplicationStage(stage);
  const initialSchedule = data.events.find(
    (event) =>
      event.applicationId === applicationId &&
      event.kind === initialEventKind &&
      event.status === "待完成",
  );
  const [schedule, setSchedule] = useState<ApplicationScheduleDraft>(() =>
    scheduleDraft(initialSchedule),
  );
  const [draft, setDraft] = useState<ApplicationImageFields>({
    company: item?.company || "",
    role: item?.role || "",
    city: item?.city || "",
    batch: item?.batch || "2027 届秋招",
    url: item?.url || "",
    jd: item?.jd || "",
  });
  const [images, setImages] = useState<PendingApplicationImage[]>([]);
  const [conflicts, setConflicts] = useState<
    {
      field: keyof ApplicationImageFields;
      current: string;
      suggested: string;
    }[]
  >([]);
  const [highlighted, setHighlighted] = useState<
    (keyof ApplicationImageFields)[]
  >([]);
  const [recognizing, setRecognizing] = useState(false);
  const [persisted, setPersisted] = useState<{ id: string; version: number }>();
  const labels: Record<keyof ApplicationImageFields, string> = {
    company: "公司",
    role: "岗位",
    city: "城市",
    batch: "招聘批次",
    url: "职位链接",
    jd: "岗位描述（JD）",
  };
  const linkedApplicationId = persisted?.id || item?.id;
  const eventKind = eventKindForApplicationStage(stage);
  const linkedSchedule = data.events.find(
    (event) =>
      event.applicationId === linkedApplicationId &&
      event.kind === eventKind &&
      event.status === "待完成",
  );
  const hasSchedule = Boolean(schedule.start || schedule.deadline);
  const automaticStatus =
    stage === "已投递"
      ? "等待结果"
      : hasSchedule
        ? "待完成"
        : item?.stage === stage && item.stageStatus === "等待结果"
          ? "等待结果"
          : "待安排";
  const otherPendingEvent = data.events.find(
    (event) =>
      event.applicationId === linkedApplicationId &&
      event.status === "待完成" &&
      event.kind !== eventKind,
  );
  const changeStage = (next: string) => {
    setStage(next);
    const nextKind = eventKindForApplicationStage(next);
    const nextEvent = data.events.find(
      (event) =>
        event.applicationId === linkedApplicationId &&
        event.kind === nextKind &&
        event.status === "待完成",
    );
    setSchedule(scheduleDraft(nextEvent));
  };
  const existingImages = data.files
    .filter(
      (file) =>
        file.applicationId === (persisted?.id || item?.id) &&
        file.purpose === "application-image",
    )
    .sort((a, b) => a.sortOrder - b.sortOrder);
  useEffect(() => {
    if (!highlighted.length) return;
    const timer = setTimeout(() => setHighlighted([]), 2800);
    return () => clearTimeout(timer);
  }, [highlighted]);
  const field = (name: keyof ApplicationImageFields) => ({
    value: draft[name],
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => setDraft((current) => ({ ...current, [name]: event.target.value })),
    className: highlighted.includes(name) ? "ai-filled" : undefined,
  });
  const applyRecognition = ({ fields }: { fields: ApplicationImageFields }) => {
    const next = { ...draft };
    const filled: (keyof ApplicationImageFields)[] = [];
    const clashes: typeof conflicts = [];
    (Object.keys(fields) as (keyof ApplicationImageFields)[]).forEach(
      (name) => {
        const suggested = fields[name].trim();
        if (!suggested || suggested === draft[name].trim()) return;
        if (draft[name].trim())
          clashes.push({ field: name, current: draft[name], suggested });
        else {
          next[name] = suggested;
          filled.push(name);
        }
      },
    );
    setDraft(next);
    setHighlighted(filled);
    setConflicts(clashes);
  };
  return (
    <Modal
      title={item ? "投递详情 · " + item.company : "记录一份新机会"}
      onClose={onClose}
      wide
    >
      <Form
        onClose={onClose}
        disabled={recognizing}
        onSubmit={async (f) => {
          const reminderHours = [
            ...schedule.reminderHours,
            ...(schedule.customHours ? [Number(schedule.customHours)] : []),
          ];
          const schedulePayload = eventKind
            ? hasSchedule
              ? {
                  mode: "upsert",
                  start: iso(schedule.start),
                  end: iso(schedule.end),
                  deadline: iso(schedule.deadline),
                  location: schedule.location,
                  reminderHours: [...new Set(reminderHours)],
                  absoluteReminders: schedule.absoluteReminder
                    ? [iso(schedule.absoluteReminder)]
                    : [],
                  allowConflict: schedule.allowConflict,
                }
              : linkedSchedule
                ? { mode: "remove" }
                : undefined
            : undefined;
          const saved = (await api("/api/data", {
            action: "application.save",
            id: persisted?.id || item?.id,
            version: persisted?.version ?? item?.version,
            schedule: schedulePayload,
            values: {
              company: draft.company,
              role: draft.role,
              city: draft.city,
              batch: draft.batch,
              stage,
              outcome: val(f, "outcome"),
              appliedAt: iso(f.get("appliedAt")),
              url: draft.url,
              jd: draft.jd,
              notes: val(f, "notes"),
              resumeId: val(f, "resumeId") || null,
            },
          })) as { id: string; version: number };
          setPersisted(saved);
          const pending = images.filter((image) => image.status !== "uploaded");
          const results = await Promise.allSettled(
            pending.map(async (image, index) => {
              const upload = new FormData();
              upload.set("applicationId", saved.id);
              upload.set("sortOrder", String(existingImages.length + index));
              upload.set("clientId", image.clientId);
              upload.set("file", image.file);
              const response = await fetch("/api/application-images", {
                method: "POST",
                body: upload,
              });
              const result = await response.json();
              if (!response.ok)
                throw Error(result.error || `${image.file.name} 上传失败`);
              return { clientId: image.clientId, id: String(result.id) };
            }),
          );
          const uploaded = new Map(
            results
              .filter(
                (
                  result,
                ): result is PromiseFulfilledResult<{
                  clientId: string;
                  id: string;
                }> => result.status === "fulfilled",
              )
              .map((result) => [result.value.clientId, result.value.id]),
          );
          images
            .filter((image) => uploaded.has(image.clientId))
            .forEach((image) => URL.revokeObjectURL(image.preview));
          setImages((current) =>
            current.flatMap((image) =>
              uploaded.has(image.clientId)
                ? []
                : pending.some(
                      (candidate) => candidate.clientId === image.clientId,
                    )
                  ? [{ ...image, status: "failed" as const }]
                  : [image],
            ),
          );
          const failed = results.find((result) => result.status === "rejected");
          void refresh().catch(() =>
            notify("已保存，但页面刷新失败，请手动重试。"),
          );
          if (failed?.status === "rejected")
            throw failed.reason instanceof Error
              ? failed.reason
              : Error("部分图片上传失败，请重试");
        }}
      >
        <ApplicationImageImport
          images={images}
          existing={existingImages}
          onChange={setImages}
          onRecognized={applyRecognition}
          onBusyChange={setRecognizing}
          url={draft.url}
          onUrlChange={(url) => setDraft((current) => ({ ...current, url }))}
          onDeleteExisting={async (id) => {
            const response = await fetch(`/api/application-images/${id}`, {
              method: "DELETE",
            });
            const result = await response.json();
            if (!response.ok) throw Error(result.error || "删除图片失败");
            await refresh();
          }}
        />
        {conflicts.length > 0 && (
          <section className="recognition-conflicts">
            <strong>这些字段已有内容，请选择是否采用识别结果</strong>
            {conflicts.map((conflict) => (
              <article key={conflict.field}>
                <div>
                  <b>{labels[conflict.field]}</b>
                  <span>当前：{conflict.current}</span>
                  <span>识别：{conflict.suggested}</span>
                </div>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setDraft((current) => ({
                      ...current,
                      [conflict.field]: conflict.suggested,
                    }));
                    setHighlighted((current) => [...current, conflict.field]);
                    setConflicts((current) =>
                      current.filter((item) => item.field !== conflict.field),
                    );
                  }}
                >
                  采用识别结果
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    setConflicts((current) =>
                      current.filter((item) => item.field !== conflict.field),
                    )
                  }
                >
                  保留当前内容
                </button>
              </article>
            ))}
          </section>
        )}
        <div className="form-grid">
          <Field label="公司">
            <input
              required
              name="company"
              {...field("company")}
              placeholder="例如：字节跳动"
            />
          </Field>
          <Field label="岗位">
            <input
              required
              name="role"
              {...field("role")}
              placeholder="例如：产品经理"
            />
          </Field>
          <Field label="城市">
            <input name="city" {...field("city")} placeholder="例如：上海" />
          </Field>
          <Field label="招聘批次">
            <input required name="batch" {...field("batch")} />
          </Field>
          <Field label="当前阶段">
            <select
              name="stage"
              value={stage}
              onChange={(event) => changeStage(event.target.value)}
            >
              {stages.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          {stage !== "Offer" && (
            <Field label="阶段状态（自动）">
              <div className={`automatic-stage-status status-${automaticStatus}`}>
                <strong>{automaticStatus}</strong>
                <span>
                  {automaticStatus === "待安排"
                    ? "尚未设置日程"
                    : automaticStatus === "待完成"
                      ? "已关联日历安排"
                      : "等待招聘方后续结果"}
                </span>
              </div>
            </Field>
          )}
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
        {eventKind && (
          <section className="application-schedule">
            <div className="application-schedule-heading">
              <div>
                <span className="eyebrow">CALENDAR</span>
                <h3>安排{eventKind}时间</h3>
              </div>
              <p>填写执行时间或截止时间后，将自动加入日历并启用提醒。</p>
            </div>
            {otherPendingEvent && (
              <p className="schedule-warning">
                之前的“{otherPendingEvent.title}”仍在日历中，请记得处理。
              </p>
            )}
            <div className="form-grid">
              <Field label="执行开始（北京时间）">
                <input
                  type="datetime-local"
                  value={schedule.start}
                  onChange={(event) =>
                    setSchedule((current) => ({
                      ...current,
                      start: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="执行结束">
                <input
                  type="datetime-local"
                  value={schedule.end}
                  onChange={(event) =>
                    setSchedule((current) => ({
                      ...current,
                      end: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="截止时间">
                <input
                  type="datetime-local"
                  value={schedule.deadline}
                  onChange={(event) =>
                    setSchedule((current) => ({
                      ...current,
                      deadline: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="地点 / 会议链接">
                <input
                  value={schedule.location}
                  onChange={(event) =>
                    setSchedule((current) => ({
                      ...current,
                      location: event.target.value,
                    }))
                  }
                  placeholder={eventKind === "面试" ? "会议链接或面试地点" : "可选"}
                />
              </Field>
            </div>
            <fieldset className="checks">
              <legend>提前提醒</legend>
              {[
                [24, "1 天前"],
                [2, "2 小时前"],
                [0.5, "30 分钟前"],
              ].map(([hours, label]) => (
                <label key={hours}>
                  <input
                    type="checkbox"
                    checked={schedule.reminderHours.includes(Number(hours))}
                    onChange={(event) =>
                      setSchedule((current) => ({
                        ...current,
                        reminderHours: event.target.checked
                          ? [...current.reminderHours, Number(hours)]
                          : current.reminderHours.filter(
                              (value) => value !== Number(hours),
                            ),
                      }))
                    }
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            <div className="form-grid">
              <Field label="额外提前提醒（小时）">
                <input
                  type="number"
                  min="0"
                  max="720"
                  step="0.5"
                  value={schedule.customHours}
                  onChange={(event) =>
                    setSchedule((current) => ({
                      ...current,
                      customHours: event.target.value,
                    }))
                  }
                  placeholder="例如：6"
                />
              </Field>
              <Field label="或指定提醒时间（北京时间）">
                <input
                  type="datetime-local"
                  value={schedule.absoluteReminder}
                  onChange={(event) =>
                    setSchedule((current) => ({
                      ...current,
                      absoluteReminder: event.target.value,
                    }))
                  }
                />
              </Field>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={schedule.allowConflict}
                onChange={(event) =>
                  setSchedule((current) => ({
                    ...current,
                    allowConflict: event.target.checked,
                  }))
                }
              />
              允许与已有日程冲突
            </label>
          </section>
        )}
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
            {...field("url")}
            placeholder="https://…"
          />
        </Field>
        <Field label="岗位描述（JD）">
          <textarea
            name="jd"
            {...field("jd")}
            rows={6}
            placeholder="粘贴完整岗位职责、任职要求与加分项……"
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
  const { data, mutateOptimistic, notify } = useWorkspace();
  const applyEvent = (event: Event) => (current: Data): Data => ({
    ...current,
    events: current.events.some((item) => item.id === event.id)
      ? current.events.map((item) => (item.id === event.id ? event : item))
      : [...current.events, event],
  });
  const removeEvent = (id: string) => (current: Data): Data => ({
    ...current,
    events: current.events.filter((event) => event.id !== id),
  });
  const updateEventStatus = (id: string, status: string) =>
    (current: Data): Data => ({
      ...current,
      events: current.events.map((event) =>
        event.id === id
          ? { ...event, status, version: event.version + 1 }
          : event,
      ),
    });
  return (
    <Modal title={item?.id ? "调整日程" : "写下一项安排"} onClose={onClose}>
      <Form
        onClose={onClose}
        closeOnSubmitStart
        onError={notify}
        onSubmit={async (f) => {
          const values = {
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
              ...(val(f, "customHours") ? [Number(val(f, "customHours"))] : []),
            ],
            absoluteReminders: f
              .getAll("absoluteReminder")
              .filter(Boolean)
              .map((v) => iso(v))
              .filter((v): v is string => Boolean(v)),
          };
          const event: Event = {
            id: item?.id || `optimistic-${crypto.randomUUID()}`,
            applicationId: values.applicationId,
            title: values.title,
            kind: values.kind,
            start: values.start,
            end: values.end,
            deadline: values.deadline,
            status: item?.status || "待完成",
            location: values.location,
            notes: values.notes,
            reminderHours: values.reminderHours,
            absoluteReminders: values.absoluteReminders,
            version: (item?.version || 0) + 1,
          };
          await mutateOptimistic(
            {
              action: "event.save",
              id: item?.id,
              version: item?.version,
              allowConflict: f.get("allowConflict") === "on",
              values,
            },
            applyEvent(event),
          );
        }}
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
              const eventId = item.id!;
              const status = item.status === "已完成" ? "待完成" : "已完成";
              onClose();
              try {
                await mutateOptimistic(
                  {
                    action: "event.status",
                    id: eventId,
                    version: item.version,
                    status,
                  },
                  updateEventStatus(eventId, status),
                );
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
              const eventId = item.id!;
              onClose();
              try {
                await mutateOptimistic(
                  { action: "event.delete", id: eventId },
                  removeEvent(eventId),
                );
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
            version: item?.version,
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
