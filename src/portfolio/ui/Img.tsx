import manifest from "../content/image-manifest.json";

/**
 * One `<img>` for the whole site, so responsive images are not something each
 * section has to remember.
 *
 * The derivatives themselves are produced by `scripts/build-images.mjs`
 * (`npm run images`), which also writes `content/image-manifest.json` — the map
 * imported here. Two deliberate choices:
 *
 * - **`src` always stays a real file.** `srcSet` is additive: a browser that
 *   ignores it, or a manifest that has not caught up with a freshly added
 *   image, still renders the original. Nothing can 404 because of this
 *   component.
 * - **No `<picture>` wrapper.** Several sections style their image with a
 *   direct-child or `img`-only selector (`.story-photo-mask img`,
 *   `.tv-frame`, …) and flex/grid geometry depends on the `<img>` being the
 *   boxed element. An extra element in between is a layout bug waiting to
 *   happen, so the WebP candidates ride on the `<img>` itself.
 */
type MediaManifest = {
  images: Record<string, { width: number; height: number; variants: { type: string; srcSet: string }[] }>;
};

const IMAGES = (manifest as MediaManifest).images;

type ImgProps = {
  src: string;
  alt: string;
  /** Layout hint for candidate selection, e.g. `(max-width: 767px) 56vw, 45vw`. */
  sizes?: string;
  className?: string;
  loading?: "lazy" | "eager";
  decoding?: "sync" | "async" | "auto";
  /** Hero images: fetch in the first round trip. */
  priority?: boolean;
  draggable?: boolean;
  width?: number;
  height?: number;
  /** Decorative images should not be announced. */
  hidden?: boolean;
};

/** The WebP candidate list for a source, if one was generated. */
export function srcSetFor(src: string): string | undefined {
  return IMAGES[src]?.variants.find((variant) => variant.type === "image/webp")?.srcSet;
}

export function intrinsicSize(src: string): { width: number; height: number } | undefined {
  const entry = IMAGES[src];
  return entry ? { width: entry.width, height: entry.height } : undefined;
}

export function Img({
  src,
  alt,
  sizes,
  className,
  loading,
  decoding = "async",
  priority,
  draggable,
  width,
  height,
  hidden,
}: ImgProps) {
  const srcSet = srcSetFor(src);
  return (
    // `next/image` needs an optimisation server or a loader service; this is a
    // pure static export, so the script above is how the responsive set is made.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className}
      src={src}
      srcSet={srcSet}
      // `sizes` is meaningless without a candidate list, and a stray one would
      // only make the browser do more work in the preload scanner.
      sizes={srcSet ? sizes : undefined}
      alt={hidden ? "" : alt}
      aria-hidden={hidden || undefined}
      loading={priority ? "eager" : loading}
      fetchPriority={priority ? "high" : undefined}
      decoding={decoding}
      draggable={draggable}
      width={width ?? intrinsicSize(src)?.width}
      height={height ?? intrinsicSize(src)?.height}
    />
  );
}
