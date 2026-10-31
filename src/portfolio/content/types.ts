/**
 * Copyright © 2026 BrainEno. 保留所有权利。
 *
 * 本文件及其包含的代码、设计和逻辑均为 BrainEno 的原创作品。
 * 未经作者明确书面授权，禁止复制、修改、分发或用于其他项目。
 *
 * 授权申请：nodeman24@outlook.com
 * 详见：LICENSE, TERMS.md
 */
export const LANGUAGES = ["zh", "en"] as const;
export type Language = (typeof LANGUAGES)[number];

export type SectionId = "intro" | "works" | "contact";

export type LocalizedText = { zh: string; en: string };

export type MediaImage = {
  src: string;
  alt: LocalizedText;
};

/**
 * Video for the TV screen.
 * - `src`: the video URL (mp4 / webm)
 * - `poster`: thumbnail shown before playback (falls back to the work's `image`)
 */
export type Video = {
  src: string;
  poster?: string;
};

export type Work = {
  id: string;
  title: LocalizedText;
  /** Repository start date (or any date label) shown before the separator. */
  year: string;
  /** Stack / venue shown after the separator. */
  credit: LocalizedText;
  /** Still shown inside the television when the work is not a video. */
  image: MediaImage;
  /**
   * Optional `object-position` for the TV cover (e.g. `"50% 30%"`) when the
   * still needs a different crop inside the tube's aperture.
   */
  tvPosition?: string;
  /**
   * Optional video shown on the TV screen instead of `image`.
   * When present, the TV displays the poster (or `image` as fallback) until
   * the user clicks to play. `preload="metadata"` — never auto-plays.
   */
  video?: Video;
  /** Repository / live project link (data only — the index layout is unchanged). */
  url: string;
  /** Long-form project description, used by detail views and backups. */
  description: LocalizedText;
  /** Extra stills for the project detail view / backup bundle. */
  detailImages: MediaImage[];
};

/** Glass rectangle of the television, as percentages of the TV artwork. */
export type ScreenRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

/**
 * Solver parameters for `scripts/tv-tube.mjs` — every knob the tube pipeline
 * reads lives in the content, not in the script. Flat on purpose: the script
 * parses this block out of `defaults.ts` (or a `published.json` snapshot).
 */
export type TvTubeParams = {
  darkRun: number;
  /** Seam-aware run lengths: right/top edges only show 1–9px of seam. */
  darkRunShort: number;
  darkRunBottom: number;
  darkThresh: number;
  lookback: number;
  brightFloor: number;
  floodGlow: number;
  cornerTl: number;
  cornerTr: number;
  cornerBl: number;
  cornerBr: number;
  outsetLeft: number;
  outsetRight: number;
  outsetTop: number;
  outsetBottom: number;
  budgetLeft: number;
  budgetRight: number;
  budgetTop: number;
  budgetBottom: number;
  budgetLum: number;
  feather: number;
  reflectThreshold: number;
  reflectInset: number;
  tintBlur: number;
};

export type PortfolioContent = {
  version: 2;
  identity: {
    name: string;
    /** Site / brand name, used as a suffix in the browser title. */
    siteName: LocalizedText;
    pageTitle: LocalizedText;
    description: LocalizedText;
    defaultLanguage: Language;
  };
  navigation: Record<SectionId, LocalizedText>;
  hero: {
    headlines: [LocalizedText, LocalizedText, LocalizedText];
    image: MediaImage;
  };
  intro: {
    heading: LocalizedText;
    portrait: MediaImage;
    portraitCredit: LocalizedText;
    primaryText: LocalizedText;
    gallery: MediaImage[];
    accentImages: [MediaImage, MediaImage];
    secondaryText: LocalizedText;
  };
  works: {
    heading: LocalizedText;
    period: string;
    tv: {
      src: string;
      width: number;
      height: number;
      /** Measured glass opening, percent of the photo — the zoom framing. */
      screen: ScreenRect;
      /** `scripts/tv-tube.mjs` solver parameters (see defaults.ts). */
      tube: TvTubeParams;
    };
    items: Work[];
  };
  contact: {
    phone: string;
    email: string;
    headlines: [string, string, string];
    marquee: LocalizedText;
    image: MediaImage;
    copyright: string;
    credit: { prefix: LocalizedText; name: string; url: string };
  };
  theme: {
    accent: string;
    stage: string;
  };
};
