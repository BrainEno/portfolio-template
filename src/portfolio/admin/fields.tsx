"use client";

import { useContext, useRef, useState, type ReactNode } from "react";
import { StudioContext, UPLOAD_LIMIT } from "./shared";
import { type LocalizedText, type MediaImage } from "../content/types";

export function Field({ label, children, wide, hint }: { label: string; children: ReactNode; wide?: boolean; hint?: string }) {
  return (
    <label className={wide ? "ad-field is-wide" : "ad-field"}>
      <span className="ad-label">{label}</span>
      {children}
      {hint ? <span className="ad-field-hint">{hint}</span> : null}
    </label>
  );
}

export function TextInput({ value, onChange, placeholder, type = "text" }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return <input className="ad-input" type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

export function Localized({ label, value, onChange, multiline, rows = 4, hint }: { label: string; value: LocalizedText; onChange: (v: LocalizedText) => void; multiline?: boolean; rows?: number; hint?: string }) {
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

export function ImageField({ label, value, onChange, onError, hint }: { label: string; value: MediaImage; onChange: (v: MediaImage) => void; onError: (m: string) => void; hint?: string }) {
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

export function SourcePicker({ src, onChange, onError }: { src: string; onChange: (src: string) => void; onError: (m: string) => void }) {
  const { upload } = useContext(StudioContext);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handle = async (file: File) => {
    setBusy(true);
    try {
      // A static site has no upload endpoint: the picture is inlined into the
      // draft, which is then saved in localStorage. Past this size the draft
      // would evict itself, so point at the URL field instead.
      if (file.size > UPLOAD_LIMIT) {
        throw new Error("Uploads are capped at 1.4 MB because they are inlined into the draft. Use a hosted image URL for anything larger.");
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

export function ListControls({ index, length, onMove, onRemove }: { index: number; length: number; onMove: (from: number, to: number) => void; onRemove: (i: number) => void }) {
  return (
    <div className="ad-list-controls">
      <button type="button" className="ad-icon" disabled={index === 0} onClick={() => onMove(index, index - 1)} aria-label="Move up">↑</button>
      <button type="button" className="ad-icon" disabled={index === length - 1} onClick={() => onMove(index, index + 1)} aria-label="Move down">↓</button>
      <button type="button" className="ad-icon is-danger" onClick={() => onRemove(index)} aria-label="Remove">✕</button>
    </div>
  );
}

export function move<T>(list: T[], from: number, to: number) {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function Panel({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <section className="ad-panel">
      <h2 className="ad-panel-title">{title}</h2>
      {hint ? <p className="ad-panel-hint">{hint}</p> : null}
      <div className="ad-panel-body">{children}</div>
    </section>
  );
}

