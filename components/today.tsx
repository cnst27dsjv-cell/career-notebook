"use client";
import { useState } from "react";
import {
  Check,
  ArrowUpRight,
  ArrowRight,
  CheckCircle,
  Clock,
  Paperclip,
} from "@phosphor-icons/react";
import { useWorkspace, dayKey, clock, dateLabel } from "./context";
import { SectionHead, Empty } from "./ui";
import { EventForm, ApplicationForm } from "./forms";
import type { Event, Application } from "@/lib/types";
export default function Today({ navigate }: { navigate: (v: string) => void }) {
  const { data, mutate, notify } = useWorkspace();
  const [edit, setEdit] = useState<Event>();
  const [app, setApp] = useState<Application>();
  const today = dayKey(new Date());
  const startToday = new Date(today + "T00:00:00+08:00").getTime();
  const pending = data.events.filter((e) => e.status === "待完成");
  const todayEvents = data.events
    .filter(
      (e) => e.status !== "已取消" && e.start && dayKey(e.start) === today,
    )
    .sort((a, b) => (a.start || "").localeCompare(b.start || ""));
  const due = pending
    .filter(
      (e) =>
        e.deadline &&
        new Date(e.deadline).getTime() >= startToday &&
        new Date(e.deadline).getTime() < startToday + 7 * 86400000,
    )
    .sort((a, b) => a.deadline!.localeCompare(b.deadline!));
  const overdue = pending.filter(
    (e) => new Date(e.deadline || e.start || "").getTime() < startToday,
  );
  const completed = todayEvents.filter((e) => e.status === "已完成").length;
  async function done(e: Event) {
    try {
      await mutate({
        action: "event.status",
        id: e.id,
        version: e.version,
        status: e.status === "已完成" ? "待完成" : "已完成",
      });
      notify(
        e.status === "已完成" ? "已恢复这项安排" : "又完成了一步，做得不错。",
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : "操作失败");
    }
  }
  const openApp = (e: Event) => {
    const a = data.applications.find((a) => a.id === e.applicationId);
    if (a) setApp(a);
    else setEdit(e);
  };
  const ticket = (e: Event, deadline = false) => {
    const days = Math.max(
      0,
      Math.round(
        (new Date(dayKey(e.deadline!) + "T00:00:00+08:00").getTime() -
          startToday) /
          86400000,
      ),
    );
    return (
      <div
        className={"ticket " + (e.status === "已完成" ? "completed" : "")}
        key={e.id}
      >
        {!deadline && <div className="ticket-time">{clock(e.start)}</div>}
        <div className="ticket-body">
          {deadline && (
            <span className="due-date">
              {dateLabel(e.deadline)} · {clock(e.deadline)} 截止
            </span>
          )}
          <button className="text-title" onClick={() => setEdit(e)}>
            {e.title}
          </button>
          <p>
            {data.applications.find((a) => a.id === e.applicationId)?.role ||
              e.kind}
            <span className="dot">·</span>
            {e.location || e.kind}
          </p>
        </div>
        {deadline && (
          <div className="stamp">
            <strong>{days}</strong>
            <span>天内截止</span>
          </div>
        )}
        <div className="ticket-actions">
          <button onClick={() => done(e)}>
            <Check size={12} />
            {e.status === "已完成" ? "撤销" : "完成"}
          </button>
          <button onClick={() => setEdit(e)}>改期</button>
          <button onClick={() => openApp(e)}>查看岗位</button>
        </div>
      </div>
    );
  };
  return (
    <>
      <div className="welcome">
        <div>
          <p className="eyebrow">YOUR NEXT CHAPTER</p>
          <h1>每一步，都离理想更近。</h1>
          <p>把今天交给行动，把未来交给时间。</p>
        </div>
        <div className="date-note">
          <span className="month">
            {new Date().toLocaleDateString("en", {
              month: "long",
              timeZone: "Asia/Shanghai",
            })}
          </span>
          <strong>
            {new Date().toLocaleDateString("en", {
              day: "2-digit",
              timeZone: "Asia/Shanghai",
            })}
          </strong>
          <span>
            {new Date().toLocaleDateString("zh-CN", {
              weekday: "long",
              timeZone: "Asia/Shanghai",
            })}{" "}
            · 北京时间
          </span>
        </div>
      </div>
      <div className="overview-strip">
        <div>
          <span>正在进行的投递</span>
          <strong>
            {data.applications
              .filter((a) => !a.outcome)
              .length.toString()
              .padStart(2, "0")}
          </strong>
        </div>
        <div>
          <span>今天的安排</span>
          <strong>{todayEvents.length.toString().padStart(2, "0")}</strong>
        </div>
        <div>
          <span>本周待截止</span>
          <strong>{due.length.toString().padStart(2, "0")}</strong>
        </div>
        <div className="progress-note">
          <CheckCircle size={22} />
          <span>
            今日已完成 {completed} / {todayEvents.length}
            <i>
              <b
                style={{
                  width: `${todayEvents.length ? (completed / todayEvents.length) * 100 : 0}%`,
                }}
              />
            </i>
          </span>
        </div>
      </div>
      <div className="today-columns">
        <section className="paper-panel taped">
          <div className="tape" />
          <Paperclip className="paperclip" size={30} />
          <SectionHead en="Today's Schedule" title="今天的安排">
            <span className="small-count">{todayEvents.length} 项</span>
          </SectionHead>
          <div className="ticket-list">
            {todayEvents.length ? (
              todayEvents.map((e) => ticket(e))
            ) : (
              <Empty
                title="今天留一点从容"
                description="暂时没有安排，可以新增日程或准备下一场面试。"
              />
            )}
          </div>
          <button className="panel-link" onClick={() => navigate("calendar")}>
            查看完整日历
            <ArrowRight size={15} />
          </button>
        </section>
        <section className="paper-panel taped">
          <div className="tape" />
          <SectionHead en="Due Soon" title="即将截止，不错过每个机会">
            <Clock size={20} className="muted" />
          </SectionHead>
          <div className="ticket-list">
            {due.length ? (
              due.slice(0, 3).map((e) => ticket(e, true))
            ) : (
              <Empty
                title="暂时没有临近截止的任务"
                description="提前准备，为自己留出余地。"
              />
            )}
          </div>
          <button
            className="panel-link"
            onClick={() => navigate("applications")}
          >
            去看看我的投递
            <ArrowUpRight size={15} />
          </button>
        </section>
      </div>
      <section className="overdue-section">
        <div className="overdue-heading">
          <h2 className="script">
            Overdue<span>✦</span>
          </h2>
          <p>这些安排，等你重新出发</p>
          <div className="seal">
            ONE STEP
            <br />
            AT A TIME
            <br />
            <span>CAREER NOTES</span>
          </div>
        </div>
        <div className="overdue-cards">
          {overdue.length ? (
            overdue.slice(0, 3).map((e) => (
              <article key={e.id} className="overdue-card">
                <span className="outlined-badge">
                  逾期{" "}
                  {Math.max(
                    1,
                    Math.round(
                      (startToday -
                        new Date(
                          dayKey(e.deadline || e.start!) + "T00:00:00+08:00",
                        ).getTime()) /
                        86400000,
                    ),
                  )}{" "}
                  天
                </span>
                <h3>{e.title}</h3>
                <p>
                  {data.applications.find((a) => a.id === e.applicationId)
                    ?.role || e.kind}
                </p>
                <div className="overdue-actions">
                  <button onClick={() => done(e)}>
                    <Check size={14} />
                    完成
                  </button>
                  <button onClick={() => setEdit(e)}>
                    重新安排
                    <ArrowUpRight size={13} />
                  </button>
                </div>
              </article>
            ))
          ) : (
            <div className="no-overdue">
              <CheckCircle size={30} />
              <p>没有逾期事项。保持自己的节奏就好。</p>
            </div>
          )}
        </div>
      </section>
      <footer className="page-footer">
        <span>不必一次走得很远，每天向前一点就好。</span>
        <span className="script">Make room for possibilities.</span>
      </footer>
      {edit && <EventForm item={edit} onClose={() => setEdit(undefined)} />}{" "}
      {app && <ApplicationForm item={app} onClose={() => setApp(undefined)} />}
    </>
  );
}
