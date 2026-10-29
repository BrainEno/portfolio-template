"use client";

import { memo, type CSSProperties } from "react";
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
            <img className="hero-bar-image" src={content.image.src} alt="" draggable={false} decoding="async" />
          </div>
        ))}
        <div className="hero-photo-box">
          <div className="hero-photo-reveal">
            <div className="hero-photo-zoom">
              <img
                className="hero-photo"
                src={content.image.src}
                alt={t(content.image.alt, lang)}
                draggable={false}
                fetchPriority="high"
                decoding="async"
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
              <img src={content.portrait.src} alt="" loading="lazy" decoding="async" />
            </div>
            <div className="story-photo-mask">
              <img
                className="story-photo"
                src={content.portrait.src}
                alt={t(content.portrait.alt, lang)}
                loading="lazy"
                decoding="async"
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
              <img className="rail-image" src={image.src} alt={t(image.alt, lang)} loading="lazy" decoding="async" />
            </figure>
          ))}
        </div>
      </div>

      <div className="coda">
        {content.accentImages.map((image, index) => (
          <img
            key={`${image.src}-${index}`}
            className={`coda-pic coda-pic-${index + 1}`}
            src={image.src}
            alt={t(image.alt, lang)}
            loading="lazy"
            decoding="async"
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
                {active ? (
                  <img key={active.id} className="tv-cover" src={active.image.src} alt={t(active.image.alt, lang)} decoding="async" />
                ) : null}
              </div>
              <div className="tv-scanlines" aria-hidden="true" />
              <div className="tv-glass" aria-hidden="true" />
            </div>
            <img className="tv-frame" src={src} alt="" aria-hidden="true" draggable={false} width={width} height={height} decoding="async" />
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
const BOOTH_MODEL_SRC = "/gltfs/telephone.glb";

function ContactBooth({ fallback }: { fallback: string }) {
  return (
    <div className="contact-booth" aria-hidden="true">
      <span className="contact-booth-shadow" />
      <div className="contact-booth-float">
        {/* Drag rotates the model; the scroll timeline drives `.contact-booth`. */}
        <PhoneBoothModel src={BOOTH_MODEL_SRC} fallback={fallback} />
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
  return (
    <section id="contact" className="contact">
      <div className="contact-inner">
        <div className="contact-headlines">
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

        <ContactBooth fallback={content.image.src} />

        <a href={mailto} className="contact-marquee" aria-label={content.email} data-cursor="link">
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
