"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { clearDemoContent, getDemoSnapshot, saveDemoContent, subscribeDemoSnapshot } from "../client/demo-store";
import { normalizeContent } from "../content/normalize";
import type { PortfolioContent } from "../content/types";
import { Editor } from "./editor";
import { type Patch, type TabId, TABS, StudioContext, fileToDataUrl } from "./shared";

/**
 * The studio of a static site.
 *
 * There is no session to authenticate (nothing on the server to protect, no data
 * to leak) and nowhere to "publish" a request. So the studio is a **local
 * editor** with two honest steps:
 *
 * 1. every keystroke is written to this browser's draft (localStorage), which
 *    the site previews immediately — open `/` in another tab and watch it change;
 * 2. `Publish` downloads `published.json`; commit that file to
 *    `src/portfolio/content/published.json` and the next build ships it.
 *
 * Because the draft is local, a stale draft can outlive a deploy: the top bar
 * always says whether what you are looking at is published or not, and
 * `Discard draft` puts the site back to the committed content.
 */
export default function AdminApp({ initialContent }: { initialContent: PortfolioContent }) {
  // The draft already in this browser wins over the build's content, so coming
  // back to the studio continues where you stopped. Edits live in `edited`;
  // once it is `null` again the store is the source of truth.
  const draft = useSyncExternalStore(subscribeDemoSnapshot, getDemoSnapshot, () => null);
  const [edited, setEdited] = useState<PortfolioContent | null>(null);
  const content = edited ?? draft?.content ?? initialContent;
  const draftAt = draft?.savedAt ?? null;
  const [tab, setTab] = useState<TabId>("identity");
  const [toast, setToast] = useState<{ message: string; tone?: "error" } | null>(null);

  const notify = useCallback((message: string, tone?: "error") => {
    setToast({ message, tone });
    window.setTimeout(() => setToast((t) => (t?.message === message ? null : t)), 4200);
  }, []);

  const patch: Patch = useCallback((mutate) => {
    setEdited((prev) => {
      const base = prev ?? draft?.content ?? initialContent;
      const next = structuredClone(base);
      mutate(next);
      return next;
    });
  }, [draft, initialContent]);

  const dirty = useMemo(
    () => JSON.stringify(content) !== JSON.stringify(initialContent),
    [content, initialContent]
  );

  // Autosave the draft; the site reads it on every visit from this browser.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      try {
        saveDemoContent(content);
      } catch (error) {
        notify(error instanceof Error ? error.message : "Could not save the draft", "error");
      }
    }, 400);
    return () => window.clearTimeout(handle);
  }, [content, notify]);

  const upload = useCallback(async (file: File) => fileToDataUrl(file), []);

  /** Hand the editor a file it can commit; publication is a `git` step. */
  const publish = useCallback(() => {
    const payload = { exportedAt: new Date().toISOString(), source: "studio", content: normalizeContent(content) };
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "published.json";
    a.click();
    URL.revokeObjectURL(url);
    notify("published.json downloaded — commit it to src/portfolio/content/ to ship");
  }, [content, notify]);

  const discard = useCallback(() => {
    if (!window.confirm("Discard this browser's draft and go back to the committed content?")) return;
    clearDemoContent();
    setEdited(null);
    notify("Draft discarded");
  }, [initialContent, notify]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        publish();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [publish]);

  return (
    <StudioContext.Provider value={{ upload }}>
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
            <button type="button" className="ad-link" onClick={discard}>Discard draft</button>
          </div>
        </aside>
        <main className="ad-main">
          <header className="ad-topbar">
            <h1 className="ad-topbar-title">{TABS.find((x) => x.id === tab)?.label}</h1>
            <div className="ad-topbar-actions">
              <span className={dirty ? "ad-status is-dirty" : "ad-status"}>
                {dirty
                  ? "Draft · previewing in this browser"
                  : draftAt
                    ? `Matches the build · draft saved ${new Date(draftAt).toLocaleTimeString()}`
                    : "Matches the build"}
              </span>
              <button type="button" className="ad-button" onClick={publish}>Publish</button>
            </div>
          </header>
          <div className="ad-mode is-demo">
            <strong>
              <span className="ad-status-dot" />
              Static site · no database
            </strong>
            <span className="ad-mode-sep" aria-hidden="true" />
            <span>
              Edits are cached in this browser and the site previews them instantly. <strong>Publish</strong> downloads
              <code> published.json</code>; commit it to <code>src/portfolio/content/</code> and the next deploy carries the change.
            </span>
          </div>
          <div className="ad-content">
            <Editor tab={tab} content={content} patch={patch} notify={notify} />
          </div>
        </main>
        {toast ? <div className={toast.tone === "error" ? "ad-toast is-error" : "ad-toast"} role="status">{toast.message}</div> : null}
      </div>
    </StudioContext.Provider>
  );
}
