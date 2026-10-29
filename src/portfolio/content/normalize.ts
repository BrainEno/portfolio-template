import { defaultContent } from "./defaults";
import type { Language, LocalizedText, PortfolioContent } from "./types";

const VARIABLE_LISTS = new Set(["intro.gallery", "works.items", "works.items[].detailImages", "works.items[].detailItems"]);

/** Item template for variable lists whose default array is empty. */
const LIST_TEMPLATES: Record<string, Json> = {
  "works.items[].detailImages": { src: "", alt: { zh: "", en: "" } },
};
const MAX_LIST = 40;

type Json = unknown;

function isRecord(value: Json): value is Record<string, Json> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function coerce(template: Json, input: Json, path: string): Json {
  if (Array.isArray(template)) {
    const source = Array.isArray(input) ? input : [];
    if (VARIABLE_LISTS.has(path)) {
      const itemTemplate = LIST_TEMPLATES[path] ?? template[0];
      const list = (source.length ? source : template).slice(0, MAX_LIST);
      return list.map((item) =>
        coerce(itemTemplate, item, `${path}[]`) as Record<string, Json>
      ).map((item, index) =>
        path === "works.items" ? ensureWorkId(item, index) : item
      );
    }
    return template.map((item, index) => coerce(item, source[index], `${path}[]`));
  }

  if (isRecord(template)) {
    const source = isRecord(input) ? input : {};
    const out: Record<string, Json> = {};
    for (const key of Object.keys(template)) {
      out[key] = coerce(template[key], source[key], path ? `${path}.${key}` : key);
    }
    // Forward-compatible: keep keys that exist in stored data but not in the
    // template yet, so a newer client never loses fields on a round-trip.
    for (const key of Object.keys(source)) {
      if (!(key in out) && typeof source[key] !== "object") out[key] = source[key];
    }
    return out;
  }

  if (typeof template === "number") {
    const n = typeof input === "string" ? Number.parseFloat(input) : input;
    return typeof n === "number" && Number.isFinite(n) ? n : template;
  }

  if (typeof template === "string") {
    if (typeof input !== "string") return template;
    if (path === "identity.defaultLanguage") return input === "en" ? "en" : "zh";
    return input.slice(0, 6000);
  }

  return input === undefined ? template : input;
}

function ensureWorkId(item: Record<string, Json>, index: number) {
  const id = typeof item.id === "string" && item.id.trim() ? item.id : "";
  if (id) return item;
  const title = isRecord(item.title) && typeof item.title.en === "string" ? item.title.en : "";
  return { ...item, id: slugify(title) || `work-${index + 1}` };
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .slice(0, 64);
}

export function normalizeContent(input: Json): PortfolioContent {
  const content = coerce(defaultContent, input, "") as PortfolioContent;
  content.version = 2;
  const seen = new Set<string>();
  content.works.items = content.works.items.map((work, index) => {
    let id = slugify(work.id) || `work-${index + 1}`;
    while (seen.has(id)) id = `${id}-${index + 1}`;
    seen.add(id);
    return { ...work, id };
  });
  return content;
}

export function t(text: LocalizedText | undefined, lang: Language) {
  if (!text) return "";
  return text[lang] || text[lang === "zh" ? "en" : "zh"] || "";
}
