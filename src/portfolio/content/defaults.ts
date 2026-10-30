import type { PortfolioContent } from "./types";

/**
 * Template content.
 *
 * Two jobs:
 *  1. the production content when `content/published.json` is absent;
 *  2. the reference dataset for the template: every field the site renders is
 *     spelled out here, in both languages, so copying this file is the quickest
 *     way to start a new site without touching a single component.
 *
 * Chinese copy is Simplified (简体中文); the English column is kept at the same
 * information density so both languages fill the layout alike.
 */
export const defaultContent: PortfolioContent = {
  version: 2,
  identity: {
    name: "BrainEno",
    siteName: { zh: "BrainEno 工作室", en: "BrainEno Studio" },
    pageTitle: { zh: "BrainEno", en: "BrainEno" },
    description: {
      zh: "BrainEno — 前端工程师与 UI 设计师，自由职业 vibe coder。",
      en: "BrainEno — frontend engineer and UI designer, freelance vibe coder.",
    },
    defaultLanguage: "zh",
  },
  navigation: {
    intro: { zh: "简介", en: "Intro" },
    works: { zh: "作品集", en: "Works" },
    contact: { zh: "联系方式", en: "Contact" },
  },
  hero: {
    headlines: [
      { zh: "前端工程", en: "Web Performance" },
      { zh: "原生应用", en: "Flutter" },
      { zh: "全栈开发", en: "Full Stack" },
    ],
    image: {
      src: "/images/figure.jpg",
      alt: { zh: "人物主视觉", en: "Portrait artwork" },
    },
  },
  intro: {
    heading: { zh: "简介", en: "Intro" },
    portrait: {
      src: "/images/profilephoto.jpg",
      alt: { zh: "BrainEno 肖像", en: "BrainEno portrait" },
    },
    portraitCredit: { zh: "BrainEno", en: "BrainEno" },
    primaryText: {
      zh: "BrainEno 是一位前端工程师与 UI 设计师，前程序员，现为自由职业 vibe coder。他擅长把最新的 AI 能力转化为可交付的产品：以工程化的方式设计并实现高品质、高度可定制化的个人网站与应用程序服务，从视觉语言、交互动效到前端架构与数据层都由一人完成。作品涵盖品牌站点、内容产品与跨端工具，并持续在开源社区维护自己的代码库。",
      en: "BrainEno is a frontend engineer and UI designer, a former programmer, and now a freelance vibe coder. He turns the latest AI capabilities into shipped products: designing and building high-quality, highly customisable personal sites and application services end to end — visual language, motion, frontend architecture and the data layer included. His work spans brand sites, content products and cross-platform tools, alongside the open-source repositories he maintains in public.",
    },
    gallery: [
      { src: "/images/work1.jpg", alt: { zh: "作品照1", en: "Work photo 1" } },
      { src: "/images/work3.jpg", alt: { zh: "作品照2", en: "Work photo 2" } },
      { src: "/images/work4.jpg", alt: { zh: "作品照3", en: "Work photo 3" } },
      { src: "/images/work2.jpg", alt: { zh: "作品照4", en: "Work photo 4" } },
      { src: "/images/work5.jpg", alt: { zh: "作品照5", en: "Work photo 5" } },
    ],
    accentImages: [
      { src: "/images/screenshot1.jpg", alt: { zh: "作品截图1", en: "Screenshot 1" } },
      { src: "/images/screenshot2.jpg", alt: { zh: "作品截图2", en: "Screenshot 2" } },
    ],
    secondaryText: {
      zh: "他相信，在 AI 赋能的时代，只有当技术不再成为想象力的瓶颈之后，品味才会变得格外重要。AI 能够实现各种代码层面的功能，却无法替代人类的判断与想象力，也无法替人做出取舍——而取舍，正是作品的性格所在。",
      en: "He believes that in an AI-enabled era, taste only starts to matter once technology stops being the bottleneck for imagination. AI can implement functions at the code level, but it cannot replace human judgement or imagination, and it cannot make the choices — the trade-offs that give a piece its character.",
    },
  },
  works: {
    heading: { zh: "开源作品", en: "Open Source" },
    period: "2026",
    tv: {
      src: "/images/tv-bg.webp",
      width: 2560,
      height: 1707,
      // Glass bounds measured from tv-bg.webp (2560x1707): the tube glass
      // runs x 1102-1428 / y 986-1246. The rect tucks ~4px under the dark
      // inner bezel on the left (x 1098) so no photo-glass sliver can peek
      // out beside the overlay during the zoom; the right edge stays under
      // the wooden pillar. The frame photo (darken blend, z-index above)
      // hides the bleed.
      screen: { top: 57.4107, left: 42.8906, width: 13.2813, height: 15.7006 },
    },
    items: [
      // Five repositories with the highest 2026 commit counts on github.com/BrainEno
      // (lyric-forge-ktv 569 · no-wave 543 · remix-partfolio 280 · ScribeForge 257 ·
      // win7-book-management 218). `year` holds the repository start date, `credit`
      // holds the stack shown after the separator.
      {
        id: "lyric-forge-ktv",
        title: { zh: "lyric-forge-ktv", en: "lyric-forge-ktv" },
        year: "2026.04.22",
        credit: { zh: "Flutter · Dart · 本地优先", en: "Flutter · Dart · Local-first" },
        image: {
          src: "/images/works/lyric-forge-ktv.jpg",
          alt: { zh: "lyric-forge-ktv 仓库", en: "lyric-forge-ktv repository" },
        },
        url: "https://github.com/BrainEno/lyric-forge-ktv",
        description: {
          zh: "本地优先的 KTV 制作与播放应用：歌词时间轴编排、伴奏对齐与离线曲库，全部在一台设备上完成，无需服务端即可开唱。",
          en: "A local-first KTV production and playback app: lyric timeline editing, backing-track alignment and an offline library, all on one device with no server required.",
        },
        detailImages: [
          {
            src: "/images/works/lyric-forge-ktv.jpg",
            alt: { zh: "lyric-forge-ktv 界面", en: "lyric-forge-ktv interface" },
          },
        ],
      },
      {
        id: "no-wave",
        title: { zh: "no-wave", en: "no-wave" },
        year: "2026.10.24",
        credit: { zh: "TypeScript · pnpm · Node", en: "TypeScript · pnpm · Node" },
        image: {
          src: "/images/works/no-wave.jpg",
          alt: { zh: "no-wave 仓库", en: "no-wave repository" },
        },
        url: "https://github.com/BrainEno/no-wave",
        description: {
          zh: "pnpm workspace 组织的全栈 TypeScript 产品：前后端共享类型与领域模型，带类型检查、测试与增量构建流水线。",
          en: "A full-stack TypeScript product organised as a pnpm workspace: shared types and domain models across web and API, with typecheck, tests and an incremental build pipeline.",
        },
        detailImages: [
          {
            src: "/images/works/no-wave.jpg",
            alt: { zh: "no-wave 项目结构", en: "no-wave project structure" },
          },
        ],
      },
      {
        id: "remix-partfolio",
        title: { zh: "remix-partfolio", en: "remix-partfolio" },
        year: "2022.11.11",
        credit: { zh: "React Router · GSAP · Netlify", en: "React Router · GSAP · Netlify" },
        image: {
          src: "/images/works/remix-partfolio.jpg",
          alt: { zh: "remix-partfolio 仓库", en: "remix-partfolio repository" },
        },
        url: "https://github.com/BrainEno/remix-partfolio",
        description: {
          zh: "本站的原始模板：GSAP ScrollSmoother 驱动的滚动叙事、电视机作品索引与静态化部署，内容与动画彻底解耦。",
          en: "The template this site grew from: GSAP ScrollSmoother scroll storytelling, the television works index and static-first deployment, with content fully decoupled from motion.",
        },
        detailImages: [
          {
            src: "/images/works/remix-partfolio.jpg",
            alt: { zh: "remix-partfolio 首页", en: "remix-partfolio landing page" },
          },
        ],
      },
      {
        id: "scribeforge",
        title: { zh: "ScribeForge", en: "ScribeForge" },
        year: "2026.10.02",
        credit: { zh: "Python · Flutter · LLM", en: "Python · Flutter · LLM" },
        image: {
          src: "/images/works/scribeforge.jpg",
          alt: { zh: "ScribeForge 仓库", en: "ScribeForge repository" },
        },
        url: "https://github.com/BrainEno/ScribeForge",
        description: {
          zh: "面向长文写作的 AI 工作台：Python 服务负责检索与生成编排，Flutter 客户端负责离线草稿与实时排版预览。",
          en: "An AI workbench for long-form writing: a Python service orchestrates retrieval and generation while the Flutter client handles offline drafts and live typesetting preview.",
        },
        detailImages: [
          {
            src: "/images/works/scribeforge.jpg",
            alt: { zh: "ScribeForge 写作界面", en: "ScribeForge writing view" },
          },
        ],
      },
      {
        id: "win7-book-management",
        title: { zh: "win7-book-management", en: "win7-book-management" },
        year: "2026.09.29",
        credit: { zh: "C# · .NET · WinForms", en: "C# · .NET · WinForms" },
        image: {
          src: "/images/works/win7-book-management.jpg",
          alt: { zh: "win7-book-management 仓库", en: "win7-book-management repository" },
        },
        url: "https://github.com/BrainEno/win7-book-management",
        description: {
          zh: "为老旧 Windows 7 机器维护的图书管理桌面程序：零依赖安装包、离线数据库与批量导入导出。",
          en: "A desktop book-management tool kept alive for ageing Windows 7 machines: a zero-dependency installer, an offline database and bulk import/export.",
        },
        detailImages: [
          {
            src: "/images/works/win7-book-management.jpg",
            alt: { zh: "win7-book-management 主界面", en: "win7-book-management main view" },
          },
        ],
      },
    ],
  },
  contact: {
    phone: "@BrainEno",
    email: "nodeman24@outlook.com",
    headlines: ["CALL ME", "FOR THE", "MARQUEE MOON"],
    marquee: { zh: "联系我 —", en: "Contact me —" },
    image: {
      src: "/images/phone-booth-cutout.png",
      alt: { zh: "电话亭", en: "Telephone booth" },
    },
    copyright: "© 2026 BrainEno. All rights reserved.",
    credit: {
      prefix: { zh: "网站设计与开发", en: "Webdesign + WebDev by" },
      name: "BrainEno",
      url: "https://github.com/BrainEno",
    },
  },
  theme: {
    accent: "#e55139",
    stage: "#000000",
  },
};
