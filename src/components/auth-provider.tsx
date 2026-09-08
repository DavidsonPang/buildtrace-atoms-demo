"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";

import { getSupabaseBrowserClient } from "@/src/lib/supabase-browser";

type AuthStatus = "loading" | "unavailable" | "signed_out" | "signed_in";

type AuthContextValue = {
  status: AuthStatus;
  restoreWarning: string;
  user: User | null;
  accessToken: string | null;
  client: SupabaseClient | null;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<"signed_in" | "confirm">;
  signOut(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const AUTH_RESTORE_FALLBACK_MS = 10_000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useMemo(() => getSupabaseBrowserClient(), []);
  const [status, setStatus] = useState<AuthStatus>(
    client ? "loading" : "unavailable",
  );
  const [session, setSession] = useState<Session | null>(null);
  const [restoreWarning, setRestoreWarning] = useState("");

  useEffect(() => {
    if (!client) return;
    let active = true;
    const fallback = setTimeout(() => {
      if (!active) return;
      setSession(null);
      setRestoreWarning("会话恢复超时，请重新登录。");
      setStatus("signed_out");
    }, AUTH_RESTORE_FALLBACK_MS);

    void client.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return;
        clearTimeout(fallback);
        setSession(data.session);
        setRestoreWarning(error ? "会话恢复失败，请重新登录。" : "");
        setStatus(data.session ? "signed_in" : "signed_out");
      })
      .catch(() => {
        if (!active) return;
        clearTimeout(fallback);
        setSession(null);
        setRestoreWarning("会话恢复失败，请重新登录。");
        setStatus("signed_out");
      });

    const { data: listener } = client.auth.onAuthStateChange(
      (event, nextSession) => {
        if (!active) return;
        clearTimeout(fallback);
        setSession(nextSession);
        if (nextSession || event !== "INITIAL_SESSION") {
          setRestoreWarning("");
        }
        setStatus(nextSession ? "signed_in" : "signed_out");
      },
    );

    return () => {
      active = false;
      clearTimeout(fallback);
      listener.subscription.unsubscribe();
    };
  }, [client]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      restoreWarning,
      user: session?.user ?? null,
      accessToken: session?.access_token ?? null,
      client,
      async signIn(email, password) {
        if (!client) throw new Error("Supabase 尚未配置。");
        const { error } = await client.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw new Error(authErrorMessage(error.message));
      },
      async signUp(email, password) {
        if (!client) throw new Error("Supabase 尚未配置。");
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw new Error(authErrorMessage(error.message));
        return data.session ? "signed_in" : "confirm";
      },
      async signOut() {
        if (!client) return;
        const { error } = await client.auth.signOut();
        if (error) throw new Error(authErrorMessage(error.message));
      },
    }),
    [client, restoreWarning, session, status],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}

export function AuthControls() {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password.length < 8) {
      setError("密码至少需要 8 个字符。");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (mode === "login") {
        await auth.signIn(email.trim(), password);
        setOpen(false);
      } else {
        const result = await auth.signUp(email.trim(), password);
        if (result === "confirm") {
          setMessage("注册成功，请检查邮箱并完成确认后登录。");
        } else {
          setOpen(false);
        }
      }
      setPassword("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "认证失败，请重试。");
    } finally {
      setBusy(false);
    }
  };

  if (auth.status === "unavailable") {
    return <span className="auth-unavailable">本地模式 · 未连接云端</span>;
  }

  if (auth.status === "loading") {
    return <span className="auth-unavailable">正在恢复会话…</span>;
  }

  if (auth.status === "signed_in") {
    return (
      <div className="auth-user">
        <span title={auth.user?.email}>{auth.user?.email}</span>
        <button
          onClick={() => {
            setError("");
            void auth
              .signOut()
              .catch((reason: unknown) =>
                setError(
                  reason instanceof Error ? reason.message : "退出失败。",
                ),
              );
          }}
          type="button"
        >
          退出
        </button>
        {error ? <small role="alert">{error}</small> : null}
      </div>
    );
  }

  return (
    <div className="auth-entry">
      {auth.restoreWarning ? (
        <span className="auth-recovery-warning" role="status">
          {auth.restoreWarning}
        </span>
      ) : null}
      <button
        className="auth-trigger"
        onClick={() => setOpen(true)}
        type="button"
      >
        登录 / 注册
      </button>
      {open ? (
        <div className="auth-backdrop" role="presentation">
          <section
            aria-label="用户认证"
            aria-modal="true"
            className="auth-dialog"
            role="dialog"
          >
            <div className="auth-dialog-header">
              <div>
                <p>BUILDTRACE ACCOUNT</p>
                <h2>{mode === "login" ? "登录并同步项目" : "创建账户"}</h2>
              </div>
              <button
                aria-label="关闭认证窗口"
                onClick={() => setOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>
            <div className="auth-tabs" role="tablist" aria-label="认证方式">
              <button
                aria-selected={mode === "login"}
                className={mode === "login" ? "active" : ""}
                onClick={() => {
                  setMode("login");
                  setError("");
                  setMessage("");
                }}
                role="tab"
                type="button"
              >
                登录
              </button>
              <button
                aria-selected={mode === "signup"}
                className={mode === "signup" ? "active" : ""}
                onClick={() => {
                  setMode("signup");
                  setError("");
                  setMessage("");
                }}
                role="tab"
                type="button"
              >
                注册
              </button>
            </div>
            <form
              className="auth-form"
              onSubmit={(event) => void submit(event)}
            >
              <label>
                邮箱
                <input
                  autoComplete="email"
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  type="email"
                  value={email}
                />
              </label>
              <label>
                密码
                <input
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  minLength={8}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </label>
              {error ? (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              ) : null}
              {message ? <p className="auth-message">{message}</p> : null}
              <button className="build-button" disabled={busy} type="submit">
                {busy ? "处理中…" : mode === "login" ? "登录" : "注册账户"}
              </button>
            </form>
            <p className="auth-note">
              账户由 Supabase Auth
              管理。游客仍可查看预置项目；登录后可生成并同步自己的版本。
            </p>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function authErrorMessage(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) {
    return "邮箱或密码不正确。";
  }
  if (normalized.includes("already registered")) {
    return "该邮箱已注册，请直接登录。";
  }
  if (normalized.includes("password")) {
    return "密码不符合安全要求，请至少使用 8 个字符。";
  }
  if (normalized.includes("rate limit")) {
    return "操作过于频繁，请稍后再试。";
  }
  return "认证服务暂时不可用，请稍后重试。";
}
