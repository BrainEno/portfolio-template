"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { clearDemoContent, getDemoSnapshot, saveDemoContent, subscribeDemoSnapshot } from "../client/demo-store";
import { type Patch } from "./shared";
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
  const fileRef = useRef<HTMLInputElement>(null);
  const backupRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const demoSavedAt = useSyncExternalStore(subscribeDemoSnapshot, () => getDemoSnapshot()?.savedAt ?? null, () => null);

  const stamp = new Date().toISOString().slice(0, 10);

  const exportJson = () => {
    download(`portfolio-content-${stamp}.json`, JSON.stringify(content, null, 2));
    notify("Content JSON exported");
  };

  const downloadBundle = () => {
    const bundle: BackupBundle = {
      format: "portfolio-backup",
      version: 2,
      exportedAt: new Date().toISOString(),
      content,
      // Uploads are already inline data URLs in a static draft, so the content
      // payload is the whole backup — there is no media table to walk.
      media: [],
    };
    download(`portfolio-backup-${stamp}.json`, JSON.stringify(bundle, null, 2));
    notify("Backup downloaded");
  };

  const restoreBundle = async (file: File) => {
    setBusy(true);
    try {
      const raw = JSON.parse(await file.text()) as Partial<BackupBundle> & { content?: unknown };
      if (!raw.content) throw new Error("This file has no content payload");
      const next = normalizeContent(raw.content);
      saveDemoContent(next);
      patch((d) => Object.assign(d, next));
      notify("Restored into this browser's draft");
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
      hint="Everything lives in this browser until you publish. Download a backup before clearing site data or moving to another machine."
    >
      <div className="ad-actions">
        <button type="button" className="ad-button" onClick={downloadBundle} disabled={busy}>
          Download backup
        </button>
        <button type="button" className="ad-button is-ghost" onClick={() => backupRef.current?.click()} disabled={busy}>
          Restore backup
        </button>
        <button type="button" className="ad-button is-ghost" onClick={exportJson}>Export content JSON</button>
        <button type="button" className="ad-button is-ghost" onClick={() => fileRef.current?.click()}>Import content JSON</button>
      </div>
      <input ref={backupRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void restoreBundle(f); e.target.value = ""; }} />
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importJson(f); e.target.value = ""; }} />

      <div className="ad-subcard">
          <strong>Browser draft</strong>
          <p className="ad-field-hint">
            {demoSavedAt ? `Last saved ${new Date(demoSavedAt).toLocaleString()}` : "No draft saved yet — the bundled mock data is shown."}
          </p>
        <button
          type="button"
          className="ad-button is-danger ad-button-sm"
          onClick={() => {
            if (!window.confirm("Discard the draft and go back to the committed content?")) return;
            clearDemoContent();
            patch((d) => Object.assign(d, structuredClone(defaultContent)));
            notify("Draft cleared");
          }}
        >
          Reset draft
        </button>
      </div>

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

