export const LANGUAGES = ["zh", "en"] as const;
export type Language = (typeof LANGUAGES)[number];

export type SectionId = "intro" | "works" | "contact";

export type LocalizedText = { zh: string; en: string };

export type MediaImage = {
  src: string;
  alt: LocalizedText;
};

export type Work = {
  id: string;
  title: LocalizedText;
  /** Repository start date (or any date label) shown before the separator. */
  year: string;
  /** Stack / venue shown after the separator. */
  credit: LocalizedText;
  /** Still shown inside the television. */
  image: MediaImage;
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
