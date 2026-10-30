/**
 * Where the site lives on its host.
 *
 * GitHub Pages serves a *project* site from a sub-path
 * (`https://<user>.github.io/<repo>/`), while a custom domain or a user site
 * (`<user>.github.io`) serves from the root. Next's own `basePath` handles the
 * router and everything under `_next/`, but **it knows nothing about paths we
 * write by hand** — `<img src="/images/figure.jpg">` stays root-absolute and
 * 404s under a sub-path. Every such path comes from the content JSON (images,
 * the booth model, icons), so it cannot be rewritten by the framework.
 *
 * Hence `asset()`: the one function that turns a content-owned root-absolute
 * path into a URL that works in both deployments. It is inlined at build time
 * (`NEXT_PUBLIC_*`), so it costs a string concat and nothing else.
 */
export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/+$/, "");

export function asset(src: string): string {
  // Remote URLs, data URIs, protocol-relative and already-relative paths are
  // left alone: they are either complete or resolve against the current page.
  if (!src || !src.startsWith("/") || src.startsWith("//")) return src;
  // Idempotent, in case a value has already been through here.
  if (BASE_PATH && src.startsWith(`${BASE_PATH}/`)) return src;
  return `${BASE_PATH}${src}`;
}
