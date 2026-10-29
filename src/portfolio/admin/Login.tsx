"use client";

import { useState } from "react";
import { type Session, api } from "./shared";

export function ModeBar({ session }: { session: Session }) {
  const live = session.mode === "postgres";
  return (
    <div className={live ? "ad-mode is-live" : "ad-mode is-demo"}>
      <strong>
        <span className={live ? "ad-status-dot is-live" : "ad-status-dot"} />
        {live ? "PostgreSQL connected" : "Demo mode · browser cache"}
      </strong>
      <span className="ad-mode-sep" aria-hidden="true" />
      {live ? (
        <span>
          Saving to {session.database ?? "database"} on {session.platform} via {session.connectionSource ?? "DATABASE_URL"}. Demo drafts and the temporary password are retired.
        </span>
      ) : (
        <span>
          No database detected. The studio opens directly with mock data; edits are cached in this browser and the index updates live. Connect PostgreSQL to persist and enable password protection.
        </span>
      )}
            {session.error ? (
        <>
          <span className="ad-mode-sep" aria-hidden="true" />
          <span>Connection error: {session.error}</span>
        </>
      ) : null}
      <span className="ad-mode-sep" aria-hidden="true" />
      <a href="https://github.com/BrainEno/portfolio-template/blob/main/docs/QUICKSTART.md" target="_blank" rel="noreferrer">Setup guide</a>
    </div>
  );
}

export function Login({ onDone, session }: { onDone: (s: Session) => void; session: Session }) {
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (payload: Record<string, string>) => {
    setBusy(true);
    setError("");
    try {
      onDone(
        await api<Session>("/api/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ad-login">
      <form
        className="ad-login-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (session.needsSetup) {
            if (newPassword !== confirm) {
              setError("Passwords do not match");
              return;
            }
            void submit({ newPassword });
          } else {
            void submit({ password });
          }
        }}
      >
        <h1 className="ad-login-title">Studio</h1>
        {session.needsSetup ? (
          <>
            <p className="ad-login-sub">
              PostgreSQL is connected. First visit: choose your admin password (6+ characters, stored as a salted hash) and you are in. 首次进入：设置一个后台密码即可（至少 6 位）。
            </p>
            <input
              className="ad-input"
              type="password"
              autoFocus
              autoComplete="new-password"
              placeholder="New password (min 6 characters)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <input
              className="ad-input"
              type="password"
              autoComplete="new-password"
              placeholder="Repeat password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            {error ? <p className="ad-error">{error}</p> : null}
            <button className="ad-button" disabled={busy || newPassword.length < 6 || !confirm}>
              {busy ? "…" : "Set password & enter"}
            </button>
          </>
        ) : (
          <>
            <input
              className="ad-input"
              type="password"
              autoFocus
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error ? <p className="ad-error">{error}</p> : null}
            {session.mode === "demo" ? (
              <p className="ad-hint">No database connected — temporary password “123456”. Edits stay in this browser.</p>
            ) : (
              <p className="ad-hint">Sign in with the admin password configured for this database.</p>
            )}
            <button className="ad-button" disabled={busy || !password}>
              {busy ? "…" : "Enter"}
            </button>
          </>
        )}
        {session.mode === "demo" ? (
          <div className="ad-login-note">
            <span className="ad-hint">You can explore every field without a database. Nothing leaves this browser.</span>
            <code>docs/QUICKSTART.md</code>
          </div>
        ) : null}
      </form>
    </div>
  );
}

