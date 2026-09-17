"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  CalendarBlank,
  Suitcase,
  Files,
  Sparkle,
  GearSix,
  Plus,
  SignOut,
  House,
  ArrowRight,
  X,
  Notebook,
  SpeakerHigh,
  SpeakerSlash,
} from "@phosphor-icons/react";
import { Context, api } from "./context";
import type { Data } from "@/lib/types";
import Today from "./today";
import Applications from "./applications";
import Calendar from "./calendar";
import Resumes from "./resumes";
import Preparations from "./preparations";
import Settings from "./settings";
import Assistant from "./assistant";
import { EventForm } from "./forms";
import { usePageSound } from "./use-page-sound";
const tabs = [
  { id: "today", label: "今日", en: "Today", icon: House },
  { id: "calendar", label: "日历", en: "Calendar", icon: CalendarBlank },
  { id: "applications", label: "投递", en: "Applications", icon: Suitcase },
  { id: "resumes", label: "简历", en: "Résumés", icon: Files },
  { id: "preparations", label: "面试准备", en: "Preparation", icon: BookOpen },
];
export default function Workspace({ demo }: { demo: boolean }) {
  const [data, setData] = useState<Data>();
  const [error, setError] = useState("");
  const [view, setView] = useState("today");
  const [toast, setToast] = useState("");
  const [newEvent, setNewEvent] = useState(false);
  const [mobileFiles, setMobileFiles] = useState(false);
  const router = useRouter();
  const pageSound = usePageSound();
  const refresh = useCallback(async () => {
    const r = await fetch("/api/data", { cache: "no-store" });
    if (r.status === 401) {
      window.location.href = "/login";
      return;
    }
    const result = await r.json();
    if (!r.ok) throw Error(result.error || "加载失败");
    setData(result);
    setError("");
  }, []);
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
    const apply = () =>
      setView(
        new URLSearchParams(window.location.search).get("view") || "today",
      );
    apply();
    window.addEventListener("popstate", apply);
    const focus = () => void refresh().catch(() => {});
    window.addEventListener("focus", focus);
    return () => {
      window.removeEventListener("popstate", apply);
      window.removeEventListener("focus", focus);
    };
  }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5500);
    return () => clearTimeout(t);
  }, [toast]);
  const navigate = (v: string) => {
    if (v !== view) pageSound.play();
    setView(v);
    window.history.pushState(null, "", "/?view=" + v);
    setMobileFiles(false);
  };
  const mutate = async (v: Record<string, unknown>) => {
    await api("/api/data", v);
    await refresh();
  };
  if (!data)
    return (
      <main className="loading-page">
        <div className="script">Opening your notebook…</div>
        {error ? (
          <>
            <p role="alert" className="error">
              {error}
            </p>
            <button
              className="secondary"
              onClick={() => refresh().catch((e) => setError(e.message))}
            >
              重新加载
            </button>
          </>
        ) : (
          <div className="loading-lines">
            <i />
            <i />
            <i />
          </div>
        )}
      </main>
    );
  return (
    <Context.Provider value={{ data, refresh, mutate, notify: setToast }}>
      <a href="#main" className="skip-link">
        跳到主要内容
      </a>
      <div className="app-shell">
        <header className="brand-header">
          <button className="brand" onClick={() => navigate("today")}>
            <span className="brand-mark">
              <Notebook size={24} />
            </span>
            <span>
              求职手账<small>CAREER NOTEBOOK</small>
            </span>
          </button>
          <div className="header-right">
            {demo && <span className="demo-label">示例手账</span>}
            <button
              className="icon-button"
              aria-label="栏目切换音效"
              aria-pressed={pageSound.enabled}
              title={pageSound.enabled ? "关闭翻页音效" : "开启翻页音效"}
              onClick={pageSound.toggle}
            >
              {pageSound.enabled ? (
                <SpeakerHigh size={21} />
              ) : (
                <SpeakerSlash size={21} />
              )}
            </button>
            <button
              className="icon-button"
              aria-label="偏好设置"
              title="偏好设置"
              onClick={() => navigate("settings")}
            >
              <GearSix size={21} />
            </button>
            <button
              className="avatar"
              aria-label="账号与设置"
              onClick={() => navigate("settings")}
            >
              我
            </button>
            <button
              className="icon-button signout"
              aria-label="退出登录"
              onClick={async () => {
                await fetch("/api/auth/sign-out", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: "{}",
                });
                router.push("/login");
              }}
            >
              <SignOut size={19} />
            </button>
          </div>
        </header>
        <div className="notebook-nav">
          <nav aria-label="主导航">
            {tabs.map((t) => (
              <button
                key={t.id}
                aria-current={view === t.id ? "page" : undefined}
                className={"page-tab " + (view === t.id ? "selected" : "")}
                onClick={() => navigate(t.id)}
              >
                <span className="tab-en">{t.en}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </nav>
          <button
            className={
              "assistant-tab " + (view === "assistant" ? "selected" : "")
            }
            onClick={() => navigate("assistant")}
          >
            <Sparkle size={17} />
            我的助理
          </button>
        </div>
        <main id="main" className="notebook-page">
          {view === "today" && (
            <div className="today-topline">
              <span>
                <span className="tiny-dot" /> 为秋招，认真准备的每一天
              </span>
              <button className="secondary" onClick={() => setNewEvent(true)}>
                <Plus size={16} />
                新增日程
              </button>
            </div>
          )}
          {view === "today" ? (
            <Today navigate={navigate} />
          ) : view === "applications" ? (
            <Applications />
          ) : view === "calendar" ? (
            <Calendar />
          ) : view === "resumes" ? (
            <Resumes />
          ) : view === "preparations" ? (
            <Preparations />
          ) : view === "settings" ? (
            <Settings />
          ) : view === "assistant" ? (
            <Assistant />
          ) : (
            <Today navigate={navigate} />
          )}
        </main>
        <footer className="outer-footer">
          <span>求职手账 · 记录机会，也记录成长</span>
          <span>所有时间以北京时间显示</span>
        </footer>
      </div>
      <nav className="mobile-nav" aria-label="手机导航">
        {tabs.slice(0, 3).map((t) => (
          <button
            key={t.id}
            className={view === t.id ? "active" : ""}
            onClick={() => navigate(t.id)}
          >
            <t.icon size={21} />
            {t.label}
          </button>
        ))}
        <button
          className={["resumes", "preparations"].includes(view) ? "active" : ""}
          onClick={() => setMobileFiles((v) => !v)}
        >
          <Files size={21} />
          资料
        </button>
        <button
          className={view === "assistant" ? "active" : ""}
          onClick={() => navigate("assistant")}
        >
          <Sparkle size={21} />
          助理
        </button>
      </nav>
      {mobileFiles && (
        <div className="mobile-files">
          <button onClick={() => navigate("resumes")}>
            简历版本
            <ArrowRight size={17} />
          </button>
          <button onClick={() => navigate("preparations")}>
            面试准备与资料库
            <ArrowRight size={17} />
          </button>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button aria-label="关闭提示" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {newEvent && <EventForm onClose={() => setNewEvent(false)} />}
    </Context.Provider>
  );
}
