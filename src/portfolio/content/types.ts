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

type Sides<T = number> = { top: T; right: T; bottom: T; left: T };

/**
 * Knobs of `scripts/tv-tube.mjs`, the build step that turns the television
 * photo into a precise glass aperture plus the light layers that make the
 * picture look like it is *inside* the tube. Every value the script uses is
 * read from here (see `scripts/lib/read-tv.mjs`) — it has no private defaults.
 * Lengths are photo pixels unless the name says "frac" (fraction of the glass
 * height / of the ray length).
 */
export type TubeConfig = {
  /** Directions cast from the glass centre when measuring the opening. */
  rays: number;
  /** Where each ray starts / stops searching, as a fraction of the seed half-extent. */
  startFrac: number;
  searchFrac: number;
  /** Extra px added to the search distance. */
  searchPad: number;
  /** Ray sampling step (px). */
  step: number;
  /** Luma at/below which a pixel belongs to the dark seam between glass and chrome. */
  gap: number;
  /** The seam must stay below `gap` for this many px (a single dark grain is not a seam). */
  run: number;
  /** Rays beyond this fraction of the half-extent on both axes are corner rays (not used for the edge fits). */
  fitCorner: number;
  /** Fit outliers further than this (px) from the quadratic are dropped. */
  fitRejectPx: number;
  /** Luma at/above which a pixel is chrome / a bright hairline — it must never be covered. */
  chrome: number;
  /** Margin around the aperture kept in every derived image (≥ 20 for the bezel). */
  pad: number;
  /** Edge softness of the screen mask (px). */
  feather: number;
  /** How far inside the mask edge the bezel hole ends (px), so picture always lies under the hole's feather. */
  holeMargin: number;
  holeFeather: number;
  /** How far the picture is allowed to run past the glass edge per side (px). Must stay inside `budget`. */
  outset: Sides;
  /** Measured width of the dark seam per side (px) — the hard upper bound for `outset`. */
  budget: Sides;
  shade: {
    /** Multiplier at the very edge of the glass. */
    edge: number;
    /** Falloff distance as a fraction of the glass height. */
    band: number;
    /** Extra multiplier in the four corners. */
    corner: number;
    cornerReach: number;
    /** Extra darkening under the top lip of the bezel. */
    topLip: number;
    topLipBand: number;
    /** Broad radial vignette strength. */
    vignette: number;
  };
  tint: { sigma: number };
  reflect: { sigma: number; tight: number; threshold: number; gain: number; inset: number };
  ring: { peak: number; band: number; halation: number; darkLo: number; darkHi: number };
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
      tube: TubeConfig;
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
