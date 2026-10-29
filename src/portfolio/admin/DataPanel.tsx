"use client";

import { useContext, useEffect, useRef, useState } from "react";
import { clearDemoContent, readDemoMeta, saveDemoContent } from "../client/demo-store";
import { type Patch, api, StudioModeContext } from "./shared";
import { Panel } from "./fields";
import { defaultContent } from "../content/defaults";
import { normalizeContent } from "../content/normalize";
import { type PortfolioContent } from "../content/types";

export type BackupBundle = {
  format: "portfolio-backup";
  version: 2;
  exportedAt: string;
  content: PortfolioContent;
  media: { id: string; filename: string; type: string; dataBase64: string }[];
};

export function download(name: string, text: string, type = "application/json") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function DataPanel({ content, patch, notify }: { content: PortfolioContent; patch: Patch; notify: (m: string, tone?: "error") => void }) {
  const { mode } = useContext(StudioModeContext);
  const fileRef = useRef<HTMLInputElement>(null);
  const backupRef = useRef<HTMLInputElement>(null);
  const [demoSavedAt, setDemoSavedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDemoSavedAt(readDemoMeta().savedAt);
  }, [content]);

  const stamp = new Date().toISOString().slice(0, 10);

  const exportJson = () => {
    download(`portfolio-content-${stamp}.json`, JSON.stringify(content, null, 2));
    notify("Content JSON exported");
  };

  const downloadBundle = async () => {
    setBusy(true);
    try {
      if (mode === "postgres") {
        // Server assembles content + media binaries and streams a download.
        window.location.href = "/api/backup";
        notify("Preparing full backup…");
      } else {
        const bundle: BackupBundle = {
          format: "portfolio-backup",
          version: 2,
          exportedAt: new Date().toISOString(),
          content,
          media: [],
        };
        download(`portfolio-backup-${stamp}.json`, JSON.stringify(bundle, null, 2));
        notify("Demo draft backed up (images are inline data URLs)");
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "Backup failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const restoreBundle = async (file: File) => {
    setBusy(true);
    try {
      const raw = JSON.parse(await file.text()) as Partial<BackupBundle> & { content?: unknown };
      if (!raw.content) throw new Error("This file has no content payload");

      if (mode === "postgres") {
        const result = await api<{ content: PortfolioContent; mediaRestored: number }>("/api/backup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(raw),
        });
        patch((d) => Object.assign(d, result.content));
        notify(`Restored into the database (${result.mediaRestored} media files)`);
      } else {
        const next = normalizeContent(raw.content);
        saveDemoContent(next);
        patch((d) => Object.assign(d, next));
        notify("Restored into this browser's demo draft");
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "Restore failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const importJson = async (file: File) => {
    try {
      const next = normalizeContent(JSON.parse(await file.text()));
      patch((d) => Object.assign(d, next));
      notify("Imported — review and publish");
    } catch {
      notify("Invalid JSON file", "error");
    }
  };

  return (
    <Panel
      title="Data · backup & migration"
      hint={
        mode === "postgres"
          ? "Backups include every image stored in the database, so the file can be restored on another Netlify site or after a reset."
          : "Demo drafts live in this browser only. Download a backup before connecting a database, then restore it in live mode."
      }
    >
      <div className="ad-actions">
        <button type="button" className="ad-button" onClick={() => void downloadBundle()} disabled={busy}>
          {mode === "postgres" ? "Download full backup" : "Download demo backup"}
        </button>
        <button type="button" className="ad-button is-ghost" onClick={() => backupRef.current?.click()} disabled={busy}>
          Restore backup
        </button>
        <button type="button" className="ad-button is-ghost" onClick={exportJson}>Export content JSON</button>
        <button type="button" className="ad-button is-ghost" onClick={() => fileRef.current?.click()}>Import content JSON</button>
      </div>
      <input ref={backupRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void restoreBundle(f); e.target.value = ""; }} />
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importJson(f); e.target.value = ""; }} />

      {mode === "demo" ? (
        <div className="ad-subcard">
          <strong>Browser draft</strong>
          <p className="ad-field-hint">
            {demoSavedAt ? `Last saved ${new Date(demoSavedAt).toLocaleString()}` : "No draft saved yet — the bundled mock data is shown."}
          </p>
          <button
            type="button"
            className="ad-button is-danger ad-button-sm"
            onClick={() => {
              if (!window.confirm("Discard the browser draft and go back to the bundled mock data?")) return;
              clearDemoContent();
              patch((d) => Object.assign(d, structuredClone(defaultContent)));
              notify("Demo draft cleared");
            }}
          >
            Reset demo draft
          </button>
        </div>
      ) : null}

      <div className="ad-subcard">
        <strong>Restore defaults</strong>
        <p className="ad-field-hint">Replaces every field with the template content. Export a backup first — this cannot be undone.</p>
        <button
          type="button"
          className="ad-button is-danger ad-button-sm"
          onClick={() => {
            if (window.confirm("Replace all fields with the template defaults?")) {
              patch((d) => Object.assign(d, structuredClone(defaultContent)));
              notify("Defaults restored — publish to apply");
            }
          }}
        >
          Restore template defaults
        </button>
      </div>
    </Panel>
  );
}

