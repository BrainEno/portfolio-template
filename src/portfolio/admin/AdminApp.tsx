"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  clearDemoContent,
  readDemoContent,
  readDemoMeta,
  saveDemoContent,
} from "../client/demo-store";
import { defaultContent } from "../content/defaults";
import { normalizeContent, slugify } from "../content/normalize";
import type { LocalizedText, MediaImage, PortfolioContent, Work } from "../content/types";

type Session = {
  authenticated: boolean;
  mode: "demo" | "postgres";
  connected: boolean;
  platform: "local" | "netlify" | "cloudflare" | "vercel" | "railway" | "render" | "fly" | "generic";
  needsSetup: boolean;
  demoPasswordEnabled: boolean;
  defaultPassword: boolean;
  connectionSource: string | null;
  database: string | null;
  error: string | null;
};

type Patch = (mutate: (draft: PortfolioContent) => void) => void;
type TabId = "identity" | "hero" | "intro" | "gallery" | "works" | "tv" | "contact" | "theme" | "data";

const TABS: { id: TabId; label: string }[] = [
  { id: "identity", label: "Identity" },
  { id: "hero", label: "Hero" },
  { id: "intro", label: "Biography" },
  { id: "gallery", label: "Gallery" },
  { id: "works", label: "Works" },
  { id: "tv", label: "Television" },
  { id: "contact", label: "Contact" },
  { id: "theme", label: "Theme" },
  { id: "data", label: "Data" },
];

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", ...init });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

/* Demo-mode uploads become inline data URLs; live uploads go to the database. */
const StudioModeContext = createContext<{
  mode: "demo" | "postgres";
  upload: (file: File) => Promise<string>;
}>({
  mode: "demo",
  upload: async () => {
    throw new Error("Upload unavailable");
  },
});

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });
}

const DEMO_UPLOAD_LIMIT = 1.4 * 1024 * 1024;

function Field({ label, children, wide, hint }: { label: string; children: ReactNode; wide?: boolean; hint?: string }) {
  return (
    <label className={wide ? "ad-field is-wide" : "ad-field"}>
      <span className="ad-label">{label}</span>
      {children}
      {hint ? <span className="ad-field-hint">{hint}</span> : null}
    </label>
  );
}

function TextInput({ value, onChange, placeholder, type = "text" }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return <input className="ad-input" type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

function Localized({ label, value, onChange, multiline, rows = 4, hint }: { label: string; value: LocalizedText; onChange: (v: LocalizedText) => void; multiline?: boolean; rows?: number; hint?: string }) {
  return (
    <div className="ad-localized">
      <span className="ad-label">{label}</span>
      <div className="ad-localized-grid">
        {(["zh", "en"] as const).map((code) => (
          <div key={code} className="ad-localized-cell">
            <span className="ad-lang-tag">{code}</span>
            {multiline ? (
              <textarea className="ad-input ad-textarea" rows={rows} value={value[code]} onChange={(e) => onChange({ ...value, [code]: e.target.value })} />
            ) : (
              <input className="ad-input" value={value[code]} onChange={(e) => onChange({ ...value, [code]: e.target.value })} />
            )}
          </div>
        ))}
      </div>
      {hint ? <span className="ad-field-hint">{hint}</span> : null}
    </div>
  );
}

function ImageField({ label, value, onChange, onError, hint }: { label: string; value: MediaImage; onChange: (v: MediaImage) => void; onError: (m: string) => void; hint?: string }) {
  return (
    <div className="ad-image">
      <span className="ad-label">{label}</span>
      <div className="ad-image-row">
        <SourcePicker src={value.src} onChange={(src) => onChange({ ...value, src })} onError={onError} />
        <div className="ad-image-meta">
          <Localized label="Alt text" value={value.alt} onChange={(alt) => onChange({ ...value, alt })} />
          {hint ? <span className="ad-field-hint">{hint}</span> : null}
        </div>
      </div>
    </div>
  );
}

function SourcePicker({ src, onChange, onError }: { src: string; onChange: (src: string) => void; onError: (m: string) => void }) {
  const { mode, upload } = useContext(StudioModeContext);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handle = async (file: File) => {
    setBusy(true);
    try {
      if (mode === "demo" && file.size > DEMO_UPLOAD_LIMIT) {
        throw new Error("Demo mode keeps uploads under 1.4 MB (browser storage). Paste an image URL, or connect PostgreSQL for full-size uploads.");
      }
      onChange(await upload(file));
    } catch (error) {
      onError(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="ad-source"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) void handle(file);
      }}
    >
      <button type="button" className="ad-thumb" onClick={() => inputRef.current?.click()} aria-label="Replace image">
        {src ? <img src={src} alt="" /> : <span>No image</span>}
        <span className="ad-thumb-overlay">{busy ? "Uploading…" : "Replace"}</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handle(file);
          e.target.value = "";
        }}
      />
      <input className="ad-input ad-input-sm" value={src} onChange={(e) => onChange(e.target.value)} placeholder="/images/… · https://… · /api/media/…" />
    </div>
  );
}

function ListControls({ index, length, onMove, onRemove }: { index: number; length: number; onMove: (from: number, to: number) => void; onRemove: (i: number) => void }) {
  return (
    <div className="ad-list-controls">
      <button type="button" className="ad-icon" disabled={index === 0} onClick={() => onMove(index, index - 1)} aria-label="Move up">↑</button>
      <button type="button" className="ad-icon" disabled={index === length - 1} onClick={() => onMove(index, index + 1)} aria-label="Move down">↓</button>
      <button type="button" className="ad-icon is-danger" onClick={() => onRemove(index)} aria-label="Remove">✕</button>
    </div>
  );
}

function move<T>(list: T[], from: number, to: number) {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function Panel({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <section className="ad-panel">
      <h2 className="ad-panel-title">{title}</h2>
      {hint ? <p className="ad-panel-hint">{hint}</p> : null}
      <div className="ad-panel-body">{children}</div>
    </section>
  );
}

function TvCalibrator({ content, patch }: { content: PortfolioContent; patch: Patch }) {
  const { tv } = content.works;
  const keys = ["top", "left", "width", "height"] as const;
  return (
    <div className="ad-tv">
      <div className="ad-tv-preview" style={{ aspectRatio: `${tv.width} / ${tv.height}` }}>
        {tv.src ? <img src={tv.src} alt="" /> : null}
        <div
          className="ad-tv-rect"
          style={{ top: `${tv.screen.top}%`, left: `${tv.screen.left}%`, width: `${tv.screen.width}%`, height: `${tv.screen.height}%` }}
        />
      </div>
      <div className="ad-grid-4">
        {keys.map((key) => (
          <Field key={key} label={`Glass ${key} %`}>
            <input
              className="ad-input"
              type="number"
              step="0.05"
              value={tv.screen[key]}
              onChange={(e) => patch((d) => { d.works.tv.screen[key] = Number(e.target.value); })}
            />
          </Field>
        ))}
      </div>
    </div>
  );
}

function Editor({ tab, content, patch, notify }: { tab: TabId; content: PortfolioContent; patch: Patch; notify: (m: string, tone?: "error") => void }) {
  const onError = (m: string) => notify(m, "error");

  switch (tab) {
    case "identity":
      return (
        <Panel title="Identity & navigation" hint="Everything here is what visitors read first: brand, browser title, SEO copy and the three nav labels.">
          <div className="ad-grid-2">
            <Field label="User / display name (top-left)" hint="Shown in the header of the index page.">
              <TextInput value={content.identity.name} onChange={(v) => patch((d) => { d.identity.name = v; })} />
            </Field>
            <Field label="Default language">
              <select className="ad-input" value={content.identity.defaultLanguage} onChange={(e) => patch((d) => { d.identity.defaultLanguage = e.target.value === "en" ? "en" : "zh"; })}>
                <option value="zh">简体中文</option>
                <option value="en">English</option>
              </select>
            </Field>
          </div>
          <Localized label="Site name (browser title suffix)" value={content.identity.siteName} onChange={(v) => patch((d) => { d.identity.siteName = v; })} />
          <Localized label="Page title" value={content.identity.pageTitle} onChange={(v) => patch((d) => { d.identity.pageTitle = v; })} />
          <Localized label="Meta description" value={content.identity.description} onChange={(v) => patch((d) => { d.identity.description = v; })} multiline />
          <Localized label="Nav — intro" value={content.navigation.intro} onChange={(v) => patch((d) => { d.navigation.intro = v; })} />
          <Localized label="Nav — works" value={content.navigation.works} onChange={(v) => patch((d) => { d.navigation.works = v; })} />
          <Localized label="Nav — contact" value={content.navigation.contact} onChange={(v) => patch((d) => { d.navigation.contact = v; })} />
        </Panel>
      );
    case "hero":
      return (
        <Panel title="Hero">
          {content.hero.headlines.map((headline, i) => (
            <Localized key={i} label={`Headline ${i + 1}`} value={headline} onChange={(v) => patch((d) => { d.hero.headlines[i] = v; })} />
          ))}
          <ImageField label="Hero artwork (also used in the two image bars)" value={content.hero.image} onChange={(v) => patch((d) => { d.hero.image = v; })} onError={onError} />
        </Panel>
      );
    case "intro":
      return (
        <Panel title="Biography" hint="The two long paragraphs drive the pinned intro sequence; keep each one roughly 200–400 characters so the reading beat stays comfortable.">
          <Localized label="Section heading" value={content.intro.heading} onChange={(v) => patch((d) => { d.intro.heading = v; })} />
          <ImageField label="Portrait" value={content.intro.portrait} onChange={(v) => patch((d) => { d.intro.portrait = v; })} onError={onError} />
          <Localized label="Portrait signature (empty hides it)" value={content.intro.portraitCredit} onChange={(v) => patch((d) => { d.intro.portraitCredit = v; })} />
          <Localized label="First paragraph" value={content.intro.primaryText} onChange={(v) => patch((d) => { d.intro.primaryText = v; })} multiline rows={7} />
          <Localized label="Second paragraph" value={content.intro.secondaryText} onChange={(v) => patch((d) => { d.intro.secondaryText = v; })} multiline rows={6} />
          {content.intro.accentImages.map((image, i) => (
            <ImageField key={i} label={`Accent image ${i + 1}`} value={image} onChange={(v) => patch((d) => { d.intro.accentImages[i] = v; })} onError={onError} />
          ))}
        </Panel>
      );
    case "gallery":
      return (
        <Panel title={`Gallery rail · ${content.intro.gallery.length}`}>
          {content.intro.gallery.map((image, i) => (
            <div key={i} className="ad-card">
              <div className="ad-card-head">
                <strong>Image {String(i + 1).padStart(2, "0")}</strong>
                <ListControls
                  index={i}
                  length={content.intro.gallery.length}
                  onMove={(a, b) => patch((d) => { d.intro.gallery = move(d.intro.gallery, a, b); })}
                  onRemove={(idx) => patch((d) => { d.intro.gallery.splice(idx, 1); })}
                />
              </div>
              <ImageField label="Image" value={image} onChange={(v) => patch((d) => { d.intro.gallery[i] = v; })} onError={onError} />
            </div>
          ))}
          <button type="button" className="ad-button is-ghost" onClick={() => patch((d) => { d.intro.gallery.push({ src: "", alt: { zh: "", en: "" } }); })}>
            + Add image
          </button>
        </Panel>
      );
    case "works":
      return (
        <Panel
          title={`Works · ${content.works.items.length}`}
          hint="Each row = one television entry. Image is what shows inside the tube; description and detail images are stored for the project detail view and included in backups."
        >
          <Localized label="List heading" value={content.works.heading} onChange={(v) => patch((d) => { d.works.heading = v; })} />
          <Field label="Period"><TextInput value={content.works.period} onChange={(v) => patch((d) => { d.works.period = v; })} /></Field>
          {content.works.items.map((work, i) => (
            <div key={work.id + i} className="ad-card">
              <div className="ad-card-head">
                <strong>{work.title.en || work.title.zh || `Work ${i + 1}`}</strong>
                <ListControls
                  index={i}
                  length={content.works.items.length}
                  onMove={(a, b) => patch((d) => { d.works.items = move(d.works.items, a, b); })}
                  onRemove={(idx) => patch((d) => { d.works.items.splice(idx, 1); })}
                />
              </div>
              <Localized label="Title" value={work.title} onChange={(v) => patch((d) => { d.works.items[i].title = v; })} />
              <div className="ad-grid-3">
                <Field label="Date / start" hint="Shown before the separator."><TextInput value={work.year} onChange={(v) => patch((d) => { d.works.items[i].year = v; })} /></Field>
                <Field label="Slug (unique id)"><TextInput value={work.id} onChange={(v) => patch((d) => { d.works.items[i].id = slugify(v) || v; })} /></Field>
                <Field label="Project link" hint="Repository or live site."><TextInput value={work.url} onChange={(v) => patch((d) => { d.works.items[i].url = v; })} /></Field>
              </div>
              <Localized label="Stack / venue (after the separator)" value={work.credit} onChange={(v) => patch((d) => { d.works.items[i].credit = v; })} />
              <ImageField label="Image shown on the television" value={work.image} onChange={(v) => patch((d) => { d.works.items[i].image = v; })} onError={onError} />
              <Localized label="Project detail description" value={work.description} onChange={(v) => patch((d) => { d.works.items[i].description = v; })} multiline rows={4} />
              <div className="ad-subcard">
                <div className="ad-card-head">
                  <strong>Detail images · {work.detailImages.length}</strong>
                </div>
                {work.detailImages.map((image, j) => (
                  <div key={j} className="ad-detail-row">
                    <ImageField label={`Detail image ${j + 1}`} value={image} onChange={(v) => patch((d) => { d.works.items[i].detailImages[j] = v; })} onError={onError} />
                    <button
                      type="button"
                      className="ad-icon is-danger"
                      onClick={() => patch((d) => { d.works.items[i].detailImages.splice(j, 1); })}
                      aria-label="Remove detail image"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="ad-button is-ghost ad-button-sm"
                  onClick={() => patch((d) => { d.works.items[i].detailImages.push({ src: "", alt: { zh: "", en: "" } }); })}
                >
                  + Add detail image
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="ad-button is-ghost"
            onClick={() =>
              patch((d) => {
                const work: Work = {
                  id: `work-${Date.now().toString(36)}`,
                  title: { zh: "新项目", en: "New project" },
                  year: new Date().toISOString().slice(0, 7).replace("-", "."),
                  credit: { zh: "", en: "" },
                  image: { src: "", alt: { zh: "", en: "" } },
                  url: "",
                  description: { zh: "", en: "" },
                  detailImages: [],
                };
                d.works.items.push(work);
              })
            }
          >
            + Add work
          </button>
        </Panel>
      );
    case "tv":
      return (
        <Panel title="Television">
          <div className="ad-grid-2">
            <Field label="Artwork width (px)"><TextInput type="number" value={String(content.works.tv.width)} onChange={(v) => patch((d) => { d.works.tv.width = Number(v) || 1; })} /></Field>
            <Field label="Artwork height (px)"><TextInput type="number" value={String(content.works.tv.height)} onChange={(v) => patch((d) => { d.works.tv.height = Number(v) || 1; })} /></Field>
          </div>
          <div className="ad-field">
            <span className="ad-label">Television artwork</span>
            <SourcePicker src={content.works.tv.src} onChange={(src) => patch((d) => { d.works.tv.src = src; })} onError={onError} />
          </div>
          <TvCalibrator content={content} patch={patch} />
        </Panel>
      );
    case "contact":
      return (
        <Panel title="Contact">
          <div className="ad-grid-2">
            <Field label="Phone / handle" hint="Digits become a tel: link; anything else links to the credit URL.">
              <TextInput value={content.contact.phone} onChange={(v) => patch((d) => { d.contact.phone = v; })} />
            </Field>
            <Field label="Email"><TextInput type="email" value={content.contact.email} onChange={(v) => patch((d) => { d.contact.email = v; })} /></Field>
          </div>
          <div className="ad-grid-3">
            {content.contact.headlines.map((line, i) => (
              <Field key={i} label={`Headline line ${i + 1}`}><TextInput value={line} onChange={(v) => patch((d) => { d.contact.headlines[i] = v; })} /></Field>
            ))}
          </div>
          <Localized label="Marquee" value={content.contact.marquee} onChange={(v) => patch((d) => { d.contact.marquee = v; })} />
          <ImageField label="Phone booth artwork" value={content.contact.image} onChange={(v) => patch((d) => { d.contact.image = v; })} onError={onError} />
          <Field label="Copyright" wide><TextInput value={content.contact.copyright} onChange={(v) => patch((d) => { d.contact.copyright = v; })} /></Field>
          <Localized label="Credit prefix" value={content.contact.credit.prefix} onChange={(v) => patch((d) => { d.contact.credit.prefix = v; })} />
          <div className="ad-grid-2">
            <Field label="Credit name (empty hides credit)"><TextInput value={content.contact.credit.name} onChange={(v) => patch((d) => { d.contact.credit.name = v; })} /></Field>
            <Field label="Credit URL"><TextInput value={content.contact.credit.url} onChange={(v) => patch((d) => { d.contact.credit.url = v; })} /></Field>
          </div>
        </Panel>
      );
    case "theme":
      return (
        <Panel title="Theme">
          <div className="ad-grid-2">
            {(["stage", "accent"] as const).map((key) => (
              <Field key={key} label={key === "stage" ? "Stage colour" : "Accent colour"}>
                <div className="ad-color">
                  <input type="color" value={content.theme[key]} onChange={(e) => patch((d) => { d.theme[key] = e.target.value; })} />
                  <TextInput value={content.theme[key]} onChange={(v) => patch((d) => { d.theme[key] = v; })} />
                </div>
              </Field>
            ))}
          </div>
        </Panel>
      );
    case "data":
      return <DataPanel content={content} patch={patch} notify={notify} />;
  }
}

type BackupBundle = {
  format: "portfolio-backup";
  version: 2;
  exportedAt: string;
  content: PortfolioContent;
  media: { id: string; filename: string; type: string; dataBase64: string }[];
};

function download(name: string, text: string, type = "application/json") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function DataPanel({ content, patch, notify }: { content: PortfolioContent; patch: Patch; notify: (m: string, tone?: "error") => void }) {
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

function ModeBar({ session, preview }: { session: Session; preview?: boolean }) {
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
      {preview ? (
        <>
          <span className="ad-mode-sep" aria-hidden="true" />
          <span className="ad-chip">Read-only preview</span>
        </>
      ) : null}
      {session.error ? (
        <>
          <span className="ad-mode-sep" aria-hidden="true" />
          <span>Connection error: {session.error}</span>
        </>
      ) : null}
      <span className="ad-mode-sep" aria-hidden="true" />
      <a href="/docs/NETLIFY_DEPLOY.md" target="_blank" rel="noreferrer">Setup guide</a>
    </div>
  );
}

function Login({ onDone, session }: { onDone: (s: Session) => void; session: Session }) {
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
              PostgreSQL is connected. Choose the permanent admin password — it is stored as a salted hash and the
              temporary password stops working from now on.
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
            <code>docs/NETLIFY_DEPLOY.md</code>
          </div>
        ) : null}
      </form>
    </div>
  );
}

export default function AdminApp({
  exportUrl,
  preview = false,
}: {
  exportUrl?: string;
  preview?: boolean;
} = {}) {
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
  }, [content, mode, preview, session?.authenticated, notify]);

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
  }, [content, notify, preview, mode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirty && !preview && mode === "postgres") e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [save, dirty, preview, mode]);

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
          {exportUrl ? (
            <a className="ad-download" href={exportUrl} download>
              Download React Router project
              <small>Netlify-ready · .zip</small>
            </a>
          ) : null}
          <div className="ad-sidebar-foot">
            <a className="ad-link" href="/" target="_blank" rel="noreferrer">View site ↗</a>
            {preview ? (
              <a className="ad-link" href="/admin">Open studio</a>
            ) : mode === "demo" ? (
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
                {preview
                  ? "Preview · nothing is saved"
                  : mode === "demo"
                    ? dirty ? "Saving draft…" : "Draft cached in this browser"
                    : dirty ? "Unsaved changes" : "All changes published"}
              </span>
              {preview ? null : (
                <button type="button" className="ad-button" disabled={saving || (!dirty && mode === "postgres")} onClick={() => void save()}>
                  {saving ? "Publishing…" : mode === "demo" ? "Save draft" : "Publish"}
                </button>
              )}
            </div>
          </header>
          <ModeBar session={session} preview={preview} />
          <div className="ad-content">
            <Editor tab={tab} content={content} patch={patch} notify={notify} />
          </div>
        </main>
        {preview ? <span className="ad-preview-badge">Read-only preview</span> : null}
        {toast ? <div className={toast.tone === "error" ? "ad-toast is-error" : "ad-toast"} role="status">{toast.message}</div> : null}
      </div>
    </StudioModeContext.Provider>
  );
}
