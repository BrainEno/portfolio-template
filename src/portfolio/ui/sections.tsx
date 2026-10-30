"use client";

import { memo, useLayoutEffect, useRef, type CSSProperties } from "react";
import TvShowreel from "./TvShowreel";
import { Img } from "./Img";
import { asset } from "../seo/asset";
import { t } from "../content/normalize";
import type { Language, PortfolioContent } from "../content/types";
import { cx } from "./cx";
import { PhoneBoothModel } from "./PhoneBoothModel";

type SectionProps<K extends keyof PortfolioContent> = {
  lang: Language;
  content: PortfolioContent[K];
};

export const Hero = memo(function Hero({ lang, content, name }: SectionProps<"hero"> & { name: string }) {
  const zh = lang === "zh";
  return (
    <section id="intro" className="hero" aria-label={name}>
      <h1 className="sr-only">{name}</h1>
      <div className="hero-box">
        {content.headlines.map((headline, index) => (
          <div key={index} className={cx("hero-word", `hero-word-${index + 1}`, zh && "is-zh")}>
            <span className="hero-word-mask">
              <span className="hero-word-text">{t(headline, lang)}</span>
            </span>
          </div>
        ))}
        {[1, 2].map((bar) => (
          <div key={bar} className={`hero-bar hero-bar-${bar}`} aria-hidden="true">
            {/* A 6vw strip. `lazy` keeps Next from emitting a second
                `<link rel=preload>` for the same picture at a different width —
                the hero photo below is the one worth a round trip. */}
            <Img
              className="hero-bar-image"
              src={content.image.src}
              alt=""
              sizes="6vw"
              loading="lazy"
              draggable={false}
              hidden
            />
          </div>
        ))}
        <div className="hero-photo-box">
          <div className="hero-photo-reveal">
            <div className="hero-photo-zoom">
              <Img
                className="hero-photo"
                src={content.image.src}
                alt={t(content.image.alt, lang)}
                sizes="(max-width: 767px) 56vw, 45vw"
                priority
                draggable={false}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
});

export const Journey = memo(function Journey({ lang, content }: SectionProps<"intro">) {
  const zh = lang === "zh";
  return (
    <section className="journey" aria-label={t(content.heading, lang)}>
      <div className="story-layer">
        <div className="story-visual">
          <div className="story-title">
            <h2 className={cx("story-title-text", zh && "is-zh")}>{t(content.heading, lang)}</h2>
          </div>
          <div className="story-photo-box">
            <div className="story-photo-ghost" aria-hidden="true">
              <Img src={content.portrait.src} alt="" sizes="(max-width: 767px) 40vw, 20vw" loading="lazy" hidden />
            </div>
            <div className="story-photo-mask">
              <Img
                className="story-photo"
                src={content.portrait.src}
                alt={t(content.portrait.alt, lang)}
                sizes="(max-width: 767px) 40vw, 20vw"
                loading="lazy"
              />
            </div>
            {t(content.portraitCredit, lang) ? (
              <div className="story-credit" aria-hidden="true">
                <span>{t(content.portraitCredit, lang)}</span>
                <i className="story-credit-ball" />
              </div>
            ) : null}
          </div>
        </div>
        <div className="story-copy">
          <p className={cx("copy", zh && "is-zh")}>{t(content.primaryText, lang)}</p>
        </div>
      </div>

      <div className="rail-stage">
        <div className="rail">
          {content.gallery.map((image, index) => (
            <figure key={`${image.src}-${index}`} className="rail-item">
              <Img
                className="rail-image"
                src={image.src}
                alt={t(image.alt, lang)}
                sizes="(max-width: 767px) 72vw, 40vw"
                loading="lazy"
              />
            </figure>
          ))}
        </div>
      </div>

      <div className="coda">
        {content.accentImages.map((image, index) => (
          <Img
            key={`${image.src}-${index}`}
            className={`coda-pic coda-pic-${index + 1}`}
            src={image.src}
            alt={t(image.alt, lang)}
            sizes="(max-width: 767px) 30vw, 19vw"
            loading="lazy"
          />
        ))}
        <p className={cx("copy coda-text", zh && "is-zh")}>{t(content.secondaryText, lang)}</p>
      </div>
    </section>
  );
});

type WorksProps = SectionProps<"works"> & {
  phone: string;
  activeIndex: number;
  onPreview: (index: number) => void;
};

export function Works({ lang, content, phone, activeIndex, onPreview }: WorksProps) {
  const zh = lang === "zh";
  const active = activeIndex >= 0 ? content.items[activeIndex] : undefined;
  const { screen, width, height, src } = content.tv;
  const tvStyle = {
    "--tv-ratio": `${width} / ${height}`,
    "--screen-top": `${screen.top}%`,
    "--screen-left": `${screen.left}%`,
    "--screen-width": `${screen.width}%`,
    "--screen-height": `${screen.height}%`,
    "--screen-cx": `${screen.left + screen.width / 2}%`,
    "--screen-cy": `${screen.top + screen.height / 2}%`,
  } as CSSProperties;

  return (
    <section id="works" className="works" aria-label={t(content.heading, lang)}>
      <div className="tv-stage">
        <div className="tv-anchor" style={tvStyle}>
          <div className="tv-box">
            <div className={cx("tv-screen", active && "has-preview")}>
              <div className="tv-screen-base" />
              <div className="tv-showreel">
                <TvShowreel
                  active={active ? { id: active.id, src: active.image.src, alt: active.image.alt } : null}
                  label={(text) => t(text, lang)}
                />
              </div>
              <div className="tv-scanlines" aria-hidden="true" />
              <div className="tv-glass" aria-hidden="true" />
            </div>
            {/* Below the fold: no `<link rel=preload>` for artwork nobody has
                scrolled to yet.
                `sizes` mirrors `.tv-anchor`'s `max(160vw, 230vh)`: the cabinet
                is laid out far wider than the viewport (the glass, not the
                box, is what fits the screen), so the default ladder would be
                blurry. Portrait-ish viewports are height-driven. */}
            <Img
              className="tv-frame"
              src={src}
              alt=""
              sizes="(max-aspect-ratio: 4/3) 230vh, 160vw"
              hidden
              loading="lazy"
              draggable={false}
              width={width}
              height={height}
            />
            <div className="tv-number-layer" aria-hidden="true">
              <div className="tv-number">{phone}</div>
            </div>
          </div>
        </div>
        <div className="tv-whiteout" aria-hidden="true" />
      </div>

      <div className="works-list">
        <h2 className="works-heading">
          <span className={cx("works-heading-text", zh && "is-zh")}>
            {t(content.heading, lang)} <span className="works-period">{content.period}</span>
          </span>
        </h2>
        <ol className="work-rows">
          {content.items.map((work, index) => {
            const title = zh ? `《${t(work.title, lang)}》` : t(work.title, lang);
            return (
              <li
                key={work.id}
                className={cx("work-row", zh && "is-zh", index === activeIndex && "is-active")}
                data-cursor="view"
                tabIndex={0}
                onMouseEnter={() => onPreview(index)}
                onFocus={() => onPreview(index)}
                onClick={() => onPreview(index)}
              >
                <span className="work-row-line" aria-hidden="true" />
                <span className="work-row-mask">
                  <span className="work-row-title">
                    <span className="work-row-name">{title}</span>
                    <span className="work-row-name-alt" aria-hidden="true">{title}</span>
                  </span>
                </span>
                <span className="work-row-meta">
                  <span className="work-row-mask"><span>{work.year}</span></span>
                  <span className="work-row-mask" aria-hidden="true"><span>/</span></span>
                  <span className="work-row-mask"><span>{t(work.credit, lang)}</span></span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="tv-phone-spacer" aria-hidden="true" />
      <div className="tv-exit-spacer" aria-hidden="true" />
    </section>
  );
}

const MARQUEE_REPEAT = Array.from({ length: 8 }, (_, i) => i);

/**
 * The uploaded telephone model, optimised to a 2 MB GLB by
 * `scripts/optimize-booth-model.py` (the original 38 MB .gltf stays in the
 * repository as the source of truth). It replaces the cutout photo, which is
 * kept underneath as the pre-WebGL / no-WebGL state.
 */
const BOOTH_MODEL_SRC = asset("/gltfs/telephone.glb");

function ContactBooth({ fallback, plateText }: { fallback: string; plateText: string }) {
  return (
    <div className="contact-booth" aria-hidden="true">
      <span className="contact-booth-shadow" />
      <div className="contact-booth-float">
        {/* Drag rotates the model; the scroll timeline drives `.contact-booth`. */}
        <PhoneBoothModel src={BOOTH_MODEL_SRC} fallback={fallback} plateText={plateText} />
      </div>
    </div>
  );
}

export const Contact = memo(function Contact({ lang, content }: SectionProps<"contact">) {
  const mailto = `mailto:${content.email}`;
  // `phone` doubles as a short contact handle: dial it when it holds digits,
  // otherwise link out to the profile configured in the credit block.
  const dialable = /\d{3}/.test(content.phone);
  const handleHref = dialable ? `tel:${content.phone.replace(/[^\d+]/g, "")}` : content.credit.url;
  const handleExternal = !dialable;
  const marquee = t(content.marquee, lang);
  const headlinesRef = useRef<HTMLDivElement>(null);
  const headlineText = content.headlines.join("\n");

  /**
   * Types the call sign to the largest size that still clears the booth.
   *
   * CSS can only bound the block by a hard-coded em width, and that constant is
   * a property of the typeface: "MARQUEE MOON" measures ~8.3em in the metrics
   * here, but a fallback or a future face can be wider — and then the third
   * line runs into the model at exactly the sizes where the block looks best.
   * So the ratio is measured off the rendered line instead of assumed: widest
   * line against the room actually available — the gap to the booth's
   * silhouette when the sheet is two columns, the column itself when it is
   * stacked. It only ever scales *down* (the CSS value stays the preferred
   * ceiling), and re-runs on resize and once the webfont has landed.
   */
  useLayoutEffect(() => {
    const block = headlinesRef.current;
    if (!block) return;
    const stage = block.parentElement;
    const booth = stage?.querySelector<HTMLElement>(".contact-booth");
    if (!stage || !booth) return;

    // Measure with an inert probe instead of the live headings. Two reasons:
    // the probe is always `nowrap` (a wrapped line is exactly as wide as its
    // column, which would make any overrun look like a perfect fit), and its
    // width changes when the webfont swaps in — a ResizeObserver on it is a
    // reliable "the metrics changed, re-fit" signal. `document.fonts.ready`
    // alone is not: it can resolve before the font that these elements need has
    // even been requested.
    const probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText = "position:absolute;top:0;left:0;visibility:hidden;pointer-events:none;white-space:nowrap;font-size:100px;";
    const style = getComputedStyle(block.querySelector(".contact-line") ?? block);
    probe.style.fontFamily = style.fontFamily;
    probe.style.fontWeight = style.fontWeight;
    probe.style.fontStyle = style.fontStyle;
    probe.style.letterSpacing = style.letterSpacing;
    probe.style.textTransform = style.textTransform;
    stage.appendChild(probe);

    const fit = () => {
      block.style.removeProperty("--contact-fs");
      if (!block.isConnected) return;
      // Widest line, in units of the font size (px per 1px of type).
      let ratio = 0;
      for (const line of headlineText.split("\n")) {
        probe.textContent = line || "";
        ratio = Math.max(ratio, probe.getBoundingClientRect().width / 100);
      }
      if (ratio <= 0) return;
      // Layout boxes, not client rects: the entrance timeline moves and scales
      // the booth, and measuring mid-flight would shrink the type for a
      // collision that does not exist once it lands.
      const stacked = getComputedStyle(booth).position !== "absolute";
      const boxLeft = block.offsetLeft;
      // Side by side: stop where the drawn silhouette starts, ~11% inside the
      // stage box (the stage is wider than the booth itself). Stacked: the copy
      // owns the full column, so the only limit is its own container.
      const limit = stacked ? boxLeft + block.clientWidth : booth.offsetLeft + booth.offsetWidth * 0.11;
      const available = limit - boxLeft - 18;
      if (available <= 0) return;
      // The CSS clamp is the preferred size; only overrun is corrected.
      const preferred = parseFloat(getComputedStyle(block.querySelector(".contact-line") ?? block).fontSize);
      if (preferred * ratio <= available) return;
      block.style.setProperty("--contact-fs", `${Math.max(20, available / ratio).toFixed(2)}px`);
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(probe);
    window.addEventListener("resize", fit);
    document.fonts?.ready.then(fit).catch(() => {});
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fit);
      probe.remove();
    };
    // The copy itself is the dependency: a language switch re-fits.
  }, [headlineText]);

  return (
    <section id="contact" className="contact">
      <div className="contact-inner">
        <div className="contact-stage">
          <div className="contact-headlines" ref={headlinesRef}>
            {content.headlines.map((line, index) => (
              <h2 key={index} className={`contact-line contact-line-${index + 1}`}>
                {/* GSAP animates .contact-line-text; the inner word carries the
                    hover styles so transforms never fight the scroll timeline. */}
                <span className="contact-line-text">
                  <span className="contact-line-word" data-text={line}>
                    {line}
                  </span>
                </span>
              </h2>
            ))}
          </div>

          <ContactBooth fallback={content.image.src} plateText={content.email} />
        </div>

        {/* The strip is decorative repetition, so it is hidden from the
            accessibility tree and the link borrows its name from the email it
            actually dials. (An `aria-label` pointing at the email while the
            visible text says "CALL ME FOR THE MARQUEE MOON" trips
            `label-content-name-mismatch`: a visible label and a spoken label
            that disagree are worse than either.) */}
        <a href={mailto} className="contact-marquee" data-cursor="link">
          <span className="sr-only">{content.email}</span>
          {[0, 1].map((track) => (
            <span key={track} className="marquee-track" aria-hidden="true">
              {MARQUEE_REPEAT.map((i) => (
                <span key={i} className="marquee-word">{marquee}</span>
              ))}
            </span>
          ))}
        </a>

        <div className="contact-footer">
          <a href={mailto} className="contact-link" data-cursor="link">{content.email}</a>
          <a
            href={handleHref || "#contact"}
            className="contact-link contact-phone"
            data-cursor="link"
            {...(handleExternal ? { target: "_blank", rel: "noreferrer" } : {})}
          >
            {content.phone}
          </a>
          <p className="contact-copyright">{content.copyright}</p>
          {content.credit.name ? (
            <p className="contact-credit">
              {t(content.credit.prefix, lang)}{" "}
              <a href={content.credit.url} target="_blank" rel="noreferrer" className="contact-link" data-cursor="link">
                {content.credit.name}
              </a>
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
});
