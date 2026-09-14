"use client";
import { useState } from "react";
import { ArrowRight, BookOpen } from "@phosphor-icons/react";
export default function Login({ demo }: { demo: boolean }) {
  const [error, setError] = useState("");
  const [setup, setSetup] = useState(false);
  const [busy, setBusy] = useState(false);
  async function login(e?: React.FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    setBusy(true);
    setError("");
    try {
      const f = e ? new FormData(e.currentTarget) : null;
      const r = await fetch(
        f ? (setup ? "/api/setup" : "/api/auth/sign-in/email") : "/api/demo",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: f
            ? JSON.stringify({
                email: f.get("email"),
                password: f.get("password"),
                ...(setup ? { name: f.get("name") } : {}),
              })
            : "{}",
        },
      );
      const result = await r.json();
      if (!r.ok) throw Error(result.message || result.error || "登录失败");
      window.location.href = "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : "登录失败");
      setBusy(false);
    }
  }
  return (
    <main className="login-wrap">
      <div className="login-paper">
        <div className="tape" />
        <BookOpen size={34} weight="duotone" />
        <p className="script login-script">A new chapter.</p>
        <h1>把每一步，写向未来。</h1>
        <p className="muted">你的求职日程、投递与准备，都在这一本。</p>
        <form onSubmit={login}>
          {setup && (
            <label>
              怎么称呼你
              <input name="name" required placeholder="你的名字" />
            </label>
          )}
          <label>
            邮箱
            <input
              name="email"
              type="email"
              required
              autoComplete="username"
              placeholder="你的登录邮箱"
            />
          </label>
          <label>
            密码
            <input
              name="password"
              type="password"
              required
              minLength={setup ? 10 : undefined}
              autoComplete={setup ? "new-password" : "current-password"}
              placeholder="输入密码"
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy
              ? "正在打开手账…"
              : setup
                ? "创建我的空白手账"
                : "打开我的手账"}
            <ArrowRight size={18} />
          </button>
        </form>
        {demo && (
          <button
            className="demo-button"
            onClick={() => {
              setSetup(!setup);
              setError("");
            }}
          >
            {setup ? "已有账号，返回登录" : "第一次使用？创建我的空白手账"}
          </button>
        )}
        {demo && (
          <button
            className="demo-button"
            disabled={busy}
            onClick={() => login()}
          >
            先看看示例手账 <ArrowRight size={16} />
          </button>
        )}
        <p className="login-foot">CAREER NOTEBOOK · 属于你的下一篇章</p>
      </div>
    </main>
  );
}
