"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { readDemoContent, saveDemoContent } from "../client/demo-store";
import { type Session, type Patch, type TabId, TABS, api, StudioModeContext, fileToDataUrl } from "./shared";
import { Editor } from "./editor";
import { ModeBar, Login } from "./Login";
import { normalizeContent } from "../content/normalize";
import { type PortfolioContent } from "../content/types";

export default function AdminApp({ preview = false }: { preview?: boolean } = {}) {
  const [session, setSession] = useState<Session | null>(null);
  const [content, setContent] = useState<PortfolioContent | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string>("");
  const [tab, setTab] = useState<TabId>("identity");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone?: "error" } | null>(null);

  const notify = useCallback((message: string, tone?: "error") => {
    setToast({ message, tone });
    window.setTimeout(() => setToast((t) => (t?.message === message ? null : t)), 3600);
  }, []);

  useEffect(() => {
    void api<Session>("/api/session")
      .then(setSession)
      .catch(() =>
        setSession({
          authenticated: false,
          mode: "demo",
          connected: false,
          platform: "generic",
          needsSetup: false,
          demoPasswordEnabled: true,
          defaultPassword: true,
          connectionSource: null,
          database: null,
          error: null,
        })
      );
  }, []);

  const mode = session?.mode === "postgres" ? "postgres" : "demo";

  useEffect(() => {
    if (!session?.authenticated) return;
    setLoadError(null);

    // Demo: the browser cache is the source of truth (seeded from the mock data).
    if (mode === "demo") {
      const cached = readDemoContent();
      if (cached) {
        setContent(cached);
        setSaved(JSON.stringify(cached));
        return;
      }
      void api<{ content: PortfolioContent }>("/api/content")
        .then(({ content: seed }) => {
          const normalized = normalizeContent(seed);
          saveDemoContent(normalized);
          setContent(normalized);
          setSaved(JSON.stringify(normalized));
        })
        .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : "Failed to load content"));
      return;
    }

    void api<{ content: PortfolioContent }>("/api/content")
      .then(({ content }) => {
        setContent(content);
        setSaved(JSON.stringify(content));
      })
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : "Failed to load content");
      });
  }, [session?.authenticated, mode]);

  const patch: Patch = useCallback((mutate) => {
    setContent((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      mutate(next);
      return next;
    });
  }, []);

  // Demo drafts are written through automatically so the index page can show
  // every change the moment it happens (no Publish round-trip needed).
  useEffect(() => {
    if (!content || mode !== "demo" || preview || !session?.authenticated) return;
    const handle = window.setTimeout(() => {
      try {
        saveDemoContent(content);
        setSaved(JSON.stringify(content));
      } catch (error) {
        notify(error instanceof Error ? error.message : "Could not cache the draft", "error");
      }
    }, 400);
    return () => window.clearTimeout(handle);
  }, [content, mode, session?.authenticated, notify]);

  const dirty = useMemo(() => content !== null && JSON.stringify(content) !== saved, [content, saved]);

  const upload = useCallback(async (file: File) => {
    if (mode === "demo") return fileToDataUrl(file);
    const body = new FormData();
    body.append("file", file);
    const result = await api<{ url: string }>("/api/media", { method: "POST", body });
    return result.url;
  }, [mode]);

  const save = useCallback(async () => {
    if (!content || preview) return;
    setSaving(true);
    try {
      if (mode === "demo") {
        saveDemoContent(content);
        setSaved(JSON.stringify(content));
        notify("Saved in this browser — the site preview updates live");
        return;
      }
      const result = await api<{ content: PortfolioContent }>("/api/content", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
      setContent(result.content);
      setSaved(JSON.stringify(result.content));
      notify("Published to the database");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Save failed", "error");
      if (error instanceof Error && error.message === "Unauthorized") setSession((s) => (s ? { ...s, authenticated: false } : s));
    } finally {
      setSaving(false);
    }
  }, [content, notify, mode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirty && mode === "postgres") e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [save, dirty, mode]);

  if (!session) return <div className="ad-root ad-center"><span className="ad-spinner" /></div>;
  if (!session.authenticated) return <div className="ad-root"><Login onDone={setSession} session={session} /></div>;
  if (loadError && !content) {
    return (
      <div className="ad-root ad-center">
        <div className="ad-login-card">
          <p className="ad-error">{loadError}</p>
          <p className="ad-hint">The API is unreachable. Check that the server runs and the PostgreSQL connection is valid, then retry.</p>
          <button className="ad-button" type="button" onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }
  if (!content) return <div className="ad-root ad-center"><span className="ad-spinner" /></div>;

  return (
    <StudioModeContext.Provider value={{ mode, upload }}>
      <div className="ad-root">
        <aside className="ad-sidebar">
          <div className="ad-brand">
            <span>{content.identity.name}</span>
            <small>Studio</small>
          </div>
          <nav className="ad-tabs">
            {TABS.map((item, index) => (
              <button key={item.id} type="button" className={tab === item.id ? "ad-tab is-active" : "ad-tab"} onClick={() => setTab(item.id)}>
                <span className="ad-tab-index">{String(index + 1).padStart(2, "0")}</span>
                {item.label}
              </button>
            ))}
          </nav>
                    <div className="ad-sidebar-foot">
            <a className="ad-link" href="/" target="_blank" rel="noreferrer">View site ↗</a>
            {mode === "demo" ? (
              <span className="ad-link" aria-label="Local browser draft">Local draft</span>
            ) : (
              <button
                type="button"
                className="ad-link"
                onClick={async () => {
                  await api("/api/session", { method: "DELETE" }).catch(() => undefined);
                  setSession({ ...session, authenticated: false });
                  setContent(null);
                  setSaved("");
                }}
              >
                Sign out
              </button>
            )}
          </div>
        </aside>
        <main className="ad-main">
          <header className="ad-topbar">
            <h1 className="ad-topbar-title">{TABS.find((x) => x.id === tab)?.label}</h1>
            <div className="ad-topbar-actions">
              <span className={dirty ? "ad-status is-dirty" : "ad-status"}>
                {mode === "demo"
                  ? dirty ? "Saving draft…" : "Draft cached in this browser"
                  : dirty ? "Unsaved changes" : "All changes published"}
              </span>
                              <button type="button" className="ad-button" disabled={saving || (!dirty && mode === "postgres")} onClick={() => void save()}>
                  {saving ? "Publishing…" : mode === "demo" ? "Save draft" : "Publish"}
                </button>
            </div>
          </header>
          <ModeBar session={session} />
          <div className="ad-content">
            <Editor tab={tab} content={content} patch={patch} notify={notify} />
          </div>
        </main>
        {toast ? <div className={toast.tone === "error" ? "ad-toast is-error" : "ad-toast"} role="status">{toast.message}</div> : null}
      </div>
    </StudioModeContext.Provider>
  );
}
