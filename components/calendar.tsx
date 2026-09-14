"use client";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import zh from "@fullcalendar/core/locales/zh-cn";
import { useState } from "react";
import { useWorkspace } from "./context";
import { EventForm } from "./forms";
import { AddButton } from "./ui";
import type { Event } from "@/lib/types";
export default function Calendar() {
  const { data, mutate, notify } = useWorkspace();
  const [edit, setEdit] = useState<Partial<Event>>();
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            日程日历 <span className="script">A little planning</span>
          </h1>
          <p>给重要的机会留出时间。所有时间均为北京时间。</p>
        </div>
        <AddButton onClick={() => setEdit({})}>新增日程</AddButton>
      </div>
      <section className="paper-panel calendar-panel">
        <FullCalendar
          plugins={[
            dayGridPlugin,
            timeGridPlugin,
            listPlugin,
            interactionPlugin,
          ]}
          locale={zh}
          initialView={
            typeof window !== "undefined" && window.innerWidth < 768
              ? "listWeek"
              : "dayGridMonth"
          }
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,listWeek",
          }}
          buttonText={{ today: "今天", month: "月", week: "周", list: "列表" }}
          height="auto"
          firstDay={1}
          timeZone="UTC"
          eventTimeFormat={{
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }}
          events={data.events
            .filter((e) => e.status !== "已取消")
            .map((e) => ({
              id: e.id,
              title:
                (e.status === "已完成" ? "✓ " : "") +
                (e.start ? "" : "截止 · ") +
                e.title,
              start: new Date(
                new Date(e.start || e.deadline!).getTime() + 8 * 3600000,
              ).toISOString(),
              end: e.end
                ? new Date(
                    new Date(e.end).getTime() + 8 * 3600000,
                  ).toISOString()
                : undefined,
              allDay: !e.start,
              color: e.status === "已完成" ? "#8a8a76" : "#751727",
            }))}
          eventClick={(info) =>
            setEdit(data.events.find((e) => e.id === info.event.id))
          }
          dateClick={(info) =>
            setEdit({
              start: new Date(
                info.dateStr.slice(0, 10) + "T09:00:00+08:00",
              ).toISOString(),
            })
          }
        />
      </section>
      {edit && (
        <>
          <EventForm item={edit} onClose={() => setEdit(undefined)} />
        </>
      )}
    </>
  );
}
