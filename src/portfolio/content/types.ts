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
      screen: ScreenRect;
      /** Tuning for `scripts/tv-tube.mjs`; all values are % of `screen.width`. */
      tube?: {
        /** Luminance at which a pixel counts as lit glass rather than bezel. */
        glow: number;
        /** Width of the fade past the segmented glass edge. */
        feather: number;
        /** Extra growth, so the bright rim outside the phosphor is covered too. */
        grow: number;
        /** Corner radius of the aperture, in % of the glass's height. */
        radius: number;
        /** Band along the edge that is shaded rather than reflected. */
        band: number;
      };
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
