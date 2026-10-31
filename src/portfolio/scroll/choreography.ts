/**
 * Copyright © 2026 BrainEno. 保留所有权利。
 *
 * 本文件及其包含的代码、设计和逻辑均为 BrainEno 的原创作品。
 * 未经作者明确书面授权，禁止复制、修改、分发或用于其他项目。
 *
 * 授权申请：nodeman24@outlook.com
 * 详见：LICENSE, TERMS.md
 */
import { gsap } from "gsap";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { SectionId } from "../content/types";

export const DESKTOP_QUERY = "(min-width: 768px)";
export const MOBILE_QUERY = "(max-width: 767px)";
const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

let registered = false;

export function registerGsap() {
  if (registered || typeof window === "undefined") return;
  gsap.registerPlugin(ScrollTrigger, ScrollSmoother);
  ScrollTrigger.config({ ignoreMobileResize: true });
  registered = true;
}

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia(REDUCED_QUERY).matches;
}

export function createSmoother() {
  registerGsap();
  return (
    ScrollSmoother.get() ??
    ScrollSmoother.create({
      wrapper: "#smooth-wrapper",
      content: "#smooth-content",
      smooth: prefersReducedMotion() ? 0 : 1.1,
      smoothTouch: false,
      effects: true,
      normalizeScroll: false,
    })
  );
}

export function scrollToSection(id: SectionId) {
  const target = document.getElementById(id);
  if (!target) return;
  const smoother = ScrollSmoother.get();
  if (smoother) {
    smoother.scrollTo(target, !prefersReducedMotion(), "top top");
  } else {
    target.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }
}

/** Scroll dwell (in viewport heights) proportional to copy length. */
function dwell(element: Element | null, min: number, max: number) {
  const chars = element?.textContent?.trim().length ?? 0;
  const isCjk = /[\u3400-\u9fff]/.test(element?.textContent ?? "");
  const perViewport = isCjk ? 260 : 820;
  return gsap.utils.clamp(min, max, chars / perViewport);
}

export function createHeroEntrance() {
  const tl = gsap.timeline({ paused: true, defaults: { ease: "expo.out", duration: 1.5 } });
  tl.from(".hero-word-text", { yPercent: 118, stagger: 0.12 }, 0)
    .from(".hero-bar", { clipPath: "inset(100% 0% 0% 0%)", stagger: 0.12, duration: 1.7 }, 0.1)
    .from(".hero-photo-reveal", { clipPath: "inset(100% 0% 0% 0%)", duration: 1.7 }, 0)
    .from(".hero-photo-zoom", { scale: 1.32, duration: 2.2 }, 0)
    .from(".header-item", { yPercent: 120, autoAlpha: 0, stagger: 0.06, duration: 1.1 }, 0.45);
  return tl;
}

type Conditions = { desktop: boolean; mobile: boolean; reduce: boolean };

export type ChoreographyOptions = {
  scope: HTMLElement;
  onSection: (section: SectionId) => void;
  onWork: (index: number) => void;
  lastWork: () => number;
};

function heroScroll(desktop: boolean) {
  gsap.timeline({
    defaults: { ease: "none" },
    scrollTrigger: {
      trigger: ".hero-box",
      start: desktop ? "top 8%" : "top top",
      end: desktop ? "bottom 28%" : "bottom 40%",
      scrub: true,
    },
  })
    .to(".hero-word-1", { x: desktop ? "-1.2vw" : -12, y: desktop ? "3.6vw" : 80 }, 0)
    .to(".hero-word-2", { x: desktop ? "-1.2vw" : -12, y: desktop ? "3.6vw" : 80 }, 0.08)
    .to(".hero-word-3", { x: desktop ? "-1.2vw" : -12, y: desktop ? "3.6vw" : 80 }, 0.16);

  gsap.fromTo(
    ".hero-bar-image",
    { yPercent: -15 },
    {
      yPercent: 15,
      ease: "none",
      scrollTrigger: { trigger: ".hero-box", start: "top bottom", end: "bottom top", scrub: true },
    }
  );

  gsap.fromTo(
    ".hero-photo",
    { yPercent: desktop ? 6 : 0, scale: 1, rotation: 0 },
    {
      yPercent: desktop ? -6 : -8,
      scale: desktop ? 1.07 : 1.14,
      rotation: desktop ? 2.5 : 5,
      transformOrigin: "50% 55%",
      ease: "none",
      scrollTrigger: { trigger: ".hero-box", start: "top top", end: "bottom top", scrub: true },
    }
  );
}

function journeyDesktop(scope: HTMLElement) {
  const stage = scope.querySelector<HTMLElement>(".journey");
  const rail = scope.querySelector<HTMLElement>(".rail");
  if (!stage || !rail) return;

  const vw = () => window.innerWidth;
  const vh = () => window.innerHeight;
  const railWidth = () => rail.scrollWidth;

  const settle = 1;
  const approach = 0.7;
  const hold1 = dwell(scope.querySelector(".story-copy p"), 0.45, 1.25);
  const push = 1;
  const traverse = Math.max(0.6, ((railWidth() - vw() * 0.68) / vh()) * 0.8);
  const coda = 1;
  const hold2 = dwell(scope.querySelector(".coda-text"), 0.4, 1);
  const outro = 0.45;
  const total = settle + approach + hold1 + push + traverse + coda + hold2 + outro;

  const tl = gsap.timeline({
    defaults: { ease: "none" },
    scrollTrigger: {
      trigger: stage,
      start: "top top",
      end: () => `+=${total * vh()}`,
      pin: true,
      scrub: true,
      anticipatePin: 1,
      invalidateOnRefresh: true,
    },
  });

  const at = {
    settle: 0,
    approach: settle,
    hold1: settle + approach,
    push: settle + approach + hold1,
    traverse: settle + approach + hold1 + push,
    coda: settle + approach + hold1 + push + traverse,
    hold2: settle + approach + hold1 + push + traverse + coda,
    outro: total - outro,
  };

  tl.fromTo(
    ".story-photo-box",
    // The portrait enters with the natural document flow and is already in
    // frame when the pin starts — the settle beat only reframes it (drift
    // down, un-tilt, widen, de-grey) instead of travelling a full stage.
    // Hiding it a full viewport above (-98vh) left a ~500px dead-black
    // stage between the hero exit and the portrait landing; starting at
    // -14vh keeps a short, intentional descent with zero black void, and
    // the pre-pin sliver reads as incoming content, not a layering bug.
    { y: () => -vh() * 0.14, x: () => vw() * 0.08 },
    { y: 0, x: 0, duration: settle, ease: "power2.out" },
    at.settle
  )
    .fromTo(
      ".story-photo-mask",
      { rotation: 18.17, width: "20vw", borderTopLeftRadius: "0vw", filter: "grayscale(40%)" },
      { rotation: -3, width: "27vw", borderTopLeftRadius: "13vw", filter: "grayscale(0%)", duration: settle, ease: "power1.inOut" },
      at.settle
    )
    .fromTo(".story-photo", { objectPosition: "50% 50%" }, { objectPosition: "50% 18%", duration: settle }, at.settle)
    .fromTo(
      ".story-photo-ghost",
      { rotation: 0, x: 0, y: 0, autoAlpha: 0.55 },
      { rotation: 9, x: "2.6vw", y: "2.2vw", autoAlpha: 0.35, duration: settle },
      at.settle
    )
    .fromTo(".story-title-text", { yPercent: -110 }, { yPercent: 0, duration: 0.7, ease: "power3.out" }, at.settle + 0.12)
    .fromTo(
      ".story-credit",
      { scale: 0.01, autoAlpha: 0, rotation: 18 },
      { scale: 1, autoAlpha: 1, rotation: 0, duration: 0.3, ease: "back.out(2)" },
      at.settle + 0.66
    )
    .fromTo(".story-copy", { x: 0 }, { x: () => -vw() * 0.47, duration: approach, ease: "power2.out" }, at.approach)
    .fromTo(".story-copy p", { autoAlpha: 0.25 }, { autoAlpha: 1, duration: approach * 0.8 }, at.approach)
    .to(".story-layer", { x: () => -vw() * 1.08, duration: push, ease: "power1.inOut" }, at.push)
    .fromTo(".rail", { x: () => vw() }, { x: () => vw() * 0.06, duration: push, ease: "power1.inOut" }, at.push)
    .fromTo(".rail-image", { xPercent: 10 }, { xPercent: -10, duration: push + traverse + coda }, at.push)
    .to(".rail", { x: () => -(railWidth() - vw() * 0.62), duration: traverse }, at.traverse)
    .to(".rail", { x: () => -(railWidth() + vw() * 0.05), duration: coda, ease: "power1.in" }, at.coda)
    .fromTo(".coda", { x: 0 }, { x: () => -vw() * 0.95, duration: coda, ease: "power2.out" }, at.coda)
    .fromTo(".coda-pic-1", { y: () => vh() * 0.7, rotation: 6 }, { y: () => -vh() * 0.04, rotation: 0, duration: coda * 0.9, ease: "power2.out" }, at.coda + 0.1)
    .fromTo(".coda-pic-2", { y: () => vh() * 0.95, rotation: -5 }, { y: () => vh() * 0.03, rotation: 0, duration: coda * 0.85, ease: "power2.out" }, at.coda + 0.15)
    .to(".coda-pic-1", { y: () => -vh() * 0.2, duration: outro }, at.outro)
    .to(".coda-pic-2", { y: () => -vh() * 0.08, duration: outro }, at.outro)
    .to(".coda-text", { y: () => -vh() * 0.04, duration: outro }, at.outro);
}

function journeyMobile(scope: HTMLElement) {
  gsap.from(".story-photo-mask", {
    clipPath: "inset(100% 0% 0% 0%)",
    duration: 1.4,
    ease: "expo.out",
    scrollTrigger: { trigger: ".story-photo-box", start: "top 80%" },
  });
  gsap.from(".story-title-text", {
    yPercent: 110,
    duration: 1.2,
    ease: "expo.out",
    scrollTrigger: { trigger: ".story-title", start: "top 85%" },
  });
  gsap.utils.toArray<HTMLElement>(".story-copy p, .coda-text").forEach((el) => {
    gsap.from(el, {
      y: 40,
      autoAlpha: 0,
      duration: 1.1,
      ease: "power3.out",
      scrollTrigger: { trigger: el, start: "top 88%" },
    });
  });

  const rail = scope.querySelector<HTMLElement>(".rail");
  const railStage = scope.querySelector<HTMLElement>(".rail-stage");
  if (rail && railStage) {
    gsap.to(rail, {
      x: () => -(rail.scrollWidth - window.innerWidth + 20),
      ease: "none",
      scrollTrigger: {
        trigger: railStage,
        start: "center center",
        end: () => `+=${rail.scrollWidth * 0.9}`,
        pin: true,
        scrub: true,
        invalidateOnRefresh: true,
      },
    });
  }
}

const SCREEN = {
  idle: { "--screen-top": "#777a76", "--screen-mid": "#626560", "--screen-bottom": "#545651", "--screen-glow": "rgba(255,255,255,0.08)" },
  phone: { "--screen-top": "#5d6159", "--screen-mid": "#4d514a", "--screen-bottom": "#3c403a", "--screen-glow": "rgba(255,255,255,0.06)" },
  // Powered-down tube: a dark phosphor with visible glass texture, never a
  // flat black hole. The gradient and glass streaks stay alive through the
  // exit zoom so the screen keeps the same material as the opening frame.
  blank: { "--screen-top": "#2b2f29", "--screen-mid": "#1b1e1a", "--screen-bottom": "#0f1110", "--screen-glow": "rgba(190,230,200,0.05)" },
  // The tube burns out to paper white right before the contact sheet takes
  // over, so the next section rises out of the same white the screen becomes.
  white: { "--screen-top": "#ffffff", "--screen-mid": "#ffffff", "--screen-bottom": "#fbfaf8", "--screen-glow": "rgba(255,255,255,0.9)" },
} as const;

type TvPhase = "rows" | "phone" | "exit";

function television(scope: HTMLElement, opts: ChoreographyOptions, desktop: boolean) {
  const section = scope.querySelector<HTMLElement>("#works");
  if (!section) return;
  let phase: TvPhase = "rows";
  const setPhase = (next: TvPhase) => {
    phase = next;
    section.dataset.tvPhase = next;
  };
  setPhase("rows");

  ScrollTrigger.create({
    trigger: ".tv-stage",
    start: "top top",
    endTrigger: ".tv-exit-spacer",
    end: "bottom bottom",
    pin: true,
    pinSpacing: false,
    anticipatePin: 1,
  });

  gsap.from(".works-heading-text", {
    yPercent: 110,
    duration: 1.3,
    ease: "expo.out",
    scrollTrigger: { trigger: ".works-heading", start: "top 85%", toggleActions: "play none none reverse" },
  });

  gsap.utils.toArray<HTMLElement>(".work-row").forEach((row, index) => {
    const reveal = { trigger: row, start: "top 90%", toggleActions: "play none none reverse" };
    gsap.from(row.querySelector(".work-row-line"), {
      scaleX: 0,
      transformOrigin: "0% 50%",
      duration: 1.3,
      ease: "expo.inOut",
      scrollTrigger: reveal,
    });
    gsap.from(row.querySelectorAll(".work-row-title, .work-row-meta span"), {
      yPercent: 115,
      duration: 1.15,
      ease: "expo.out",
      stagger: 0.05,
      delay: 0.12,
      scrollTrigger: reveal,
    });
    ScrollTrigger.create({
      trigger: row,
      start: desktop ? "top 58%" : "top 62%",
      end: desktop ? "bottom 58%" : "bottom 62%",
      onToggle: (self) => {
        if (self.isActive && phase === "rows") opts.onWork(index);
      },
    });
  });

  const phoneTl = gsap.timeline({
    defaults: { ease: "none" },
    scrollTrigger: {
      trigger: ".tv-phone-spacer",
      start: "top 70%",
      end: "bottom 30%",
      scrub: true,
      onEnter: () => {
        setPhase("phone");
        opts.onWork(-1);
      },
      onEnterBack: () => {
        setPhase("phone");
        opts.onWork(-1);
      },
      onLeaveBack: () => {
        setPhase("rows");
        opts.onWork(opts.lastWork());
      },
    },
  });

  phoneTl
    .to(".tv-showreel", { autoAlpha: 0, duration: 0.08 }, 0)
    .to(".tv-box", { scale: 1.14, rotation: -1.5, duration: 0.34, ease: "sine.inOut" }, 0)
    .to(".tv-screen-base", { ...SCREEN.phone, duration: 0.2 }, 0.06)
    .fromTo(
      ".tv-number",
      { autoAlpha: 0, yPercent: 18, filter: "blur(6px)" },
      { autoAlpha: 1, yPercent: 0, filter: "blur(0px)", duration: 0.16, ease: "power2.out" },
      0.1
    )
    .to(".tv-number", { autoAlpha: 1, duration: 0.74 }, 0.26);

  const exitTl = gsap.timeline({
    defaults: { ease: "none" },
    scrollTrigger: {
      trigger: ".tv-exit-spacer",
      start: "top 30%",
      end: "bottom bottom",
      scrub: true,
      onEnter: () => setPhase("exit"),
      onLeaveBack: () => setPhase("phone"),
    },
  });

  // Exit, in four overlapping beats so there is never a still white screen:
  //   1. the wordmark swells (a camera push into the glass) and blurs away,
  //   2. the stripe filter and the glass sheen melt off the tube,
  //   3. the tube burns out to white while the box is still pushing in,
  //   4. the contact sheet's white background fades in under the copy, which
  //      is already rising out of the bottom edge of the frame.
  // Everything is scroll-scrubbed, so scrolling back up rewinds it exactly.
  exitTl
    .to(".tv-screen-base", { ...SCREEN.blank, duration: 0.08 }, 0)
    .to(".tv-number", { scale: desktop ? 4.8 : 3.2, duration: 0.26, ease: "power2.in" }, 0)
    .to(".tv-number", { autoAlpha: 0, filter: "blur(16px)", duration: 0.18, ease: "power1.in" }, 0.06)
    .to(".tv-scanlines", { autoAlpha: 0, duration: 0.16, ease: "power1.inOut" }, 0.04)
    // The glass goes first so the burn-out is clean white, not a grey tube.
    // The photographic light field fades with it — it is part of the glass.
    .to(".tv-glass, .tv-glass-glow", { autoAlpha: 0, duration: 0.14, ease: "power1.in" }, 0.02)
    .to(".tv-box", { scale: 1.2, rotation: -2.5, duration: 0.12, ease: "sine.inOut" }, 0.06)
    // The push runs over a quarter of the exit (~270px of scroll) so a single
    // wheel tick cannot skip it; the tube whitens early in the push, so what
    // fills the frame is a growing white flash rather than a grey slab.
    .to(".tv-box", { scale: 5.6, rotation: -6, duration: 0.3, ease: "power2.in" }, 0.14)
    .to(".tv-screen-base", { ...SCREEN.white, duration: 0.16, ease: "power1.in" }, 0.2)
    .fromTo(".tv-whiteout", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.18, ease: "power1.in" }, 0.3)
    // The contact sheet materialises in the same white (instead of sliding in
    // as a white card over a dark scene); its copy is already rising by then.
    .fromTo(
      ".contact",
      { backgroundColor: "rgba(255,255,255,0)" },
      { backgroundColor: "rgba(255,255,255,1)", duration: 0.16, ease: "power1.inOut" },
      0.3
    )
    .to(".tv-whiteout", { autoAlpha: 1, duration: 0.62 }, 0.42);
}

function contact(scope: HTMLElement, desktop: boolean, reduce: boolean) {
  if (reduce) {
    gsap.set(".contact-booth", { autoAlpha: 1, clearProps: "transform" });
    gsap.set(".contact-booth-shadow", { autoAlpha: 1 });
    gsap.set(".contact-line-text", { clearProps: "transform" });
  } else {
    const vw = () => window.innerWidth;
    const vh = () => window.innerHeight;

    // Booth: a single arc from the right edge. It enters below the horizon,
    // climbs past the resting height while it keeps sliding left, then falls
    // into the column and drifts on — one full turn over the whole flight.
    // The vertical overshoot is what makes the path read as a throw instead of
    // a diagonal slide.
    gsap
      .timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: "#contact",
          start: "top 100%",
          end: "top -4%",
          scrub: 0.7,
          invalidateOnRefresh: true,
        },
      })
      // The flight is a quarter-arc thrown out of the bottom-right corner: it
      // climbs almost straight up first, then sweeps left along the top of the
      // sheet, which is what makes the path bow towards the upper left instead
      // of cutting the diagonal. Vertical progress leads horizontal progress for
      // the whole of the flight, so the chord is never visible.
      .fromTo(
        ".contact-booth",
        {
          autoAlpha: 0,
          x: () => vw() * 0.92,
          y: () => vh() * 0.46,
          rotation: 7,
          scale: desktop ? 0.88 : 0.9,
          transformOrigin: "50% 60%",
        },
        {
          autoAlpha: 1,
          x: () => vw() * 0.62,
          y: () => vh() * 0.08,
          rotation: 4.5,
          scale: desktop ? 0.93 : 0.94,
          duration: 0.32,
          ease: "power1.out",
        },
        0
      )
      .to(
        ".contact-booth",
        { x: 0, duration: 0.5, ease: "power1.inOut" },
        0.32
      )
      .to(
        ".contact-booth",
        { y: 0, rotation: 0, scale: 1, duration: 0.5, ease: "power2.out" },
        0.32
      )
      .fromTo(
        ".contact-booth-shadow",
        { autoAlpha: 0, scale: 0.35 },
        { autoAlpha: 1, scale: 1, duration: 0.34, ease: "power2.out" },
        0.56
      );

    // Copy: one solid block that slides up out of the television as the white
    // is still blooming — no per-line wipe, no mask slicing. The block simply
    // rises with the scroll and fades in, so the first thing you read is a
    // finished line of type.
    gsap
      .timeline({
        scrollTrigger: {
          trigger: "#contact",
          start: "top 106%",
          end: "top 38%",
          scrub: 0.55,
          invalidateOnRefresh: true,
        },
      })
      .fromTo(
        ".contact-headlines",
        { y: () => vh() * 0.34, autoAlpha: 0.12 },
        { y: 0, autoAlpha: 1, duration: 1, ease: "power1.out" },
        0
      );
  }

  gsap.from(".contact-footer > *", {
    y: 24,
    autoAlpha: 0,
    duration: 1,
    ease: "power3.out",
    stagger: 0.06,
    scrollTrigger: { trigger: ".contact-footer", start: "top 95%", toggleActions: "play none none reverse" },
  });

  const tracks = scope.querySelectorAll(".marquee-track");
  if (!tracks.length || reduce) return;
  const loop = gsap.to(tracks, { xPercent: -100, duration: desktop ? 38 : 24, ease: "none", repeat: -1 });
  ScrollTrigger.create({
    trigger: "#contact",
    start: "top bottom",
    end: "bottom top",
    onToggle: (self) => (self.isActive ? loop.play() : loop.pause()),
    onUpdate: (self) => {
      const boost = 1 + Math.min(Math.abs(self.getVelocity()) / 350, 5);
      gsap.to(loop, { timeScale: boost, duration: 0.2, overwrite: true });
      gsap.to(loop, { timeScale: 1, duration: 1.1, delay: 0.2, ease: "power2.out" });
    },
  });
}

function sectionTracking(opts: ChoreographyOptions) {
  ScrollTrigger.create({
    trigger: "#works",
    start: "top 50%",
    onEnter: () => opts.onSection("works"),
    onLeaveBack: () => opts.onSection("intro"),
  });
  ScrollTrigger.create({
    trigger: "#contact",
    start: "top 55%",
    onEnter: () => opts.onSection("contact"),
    onLeaveBack: () => opts.onSection("works"),
  });
}

export function setupChoreography(opts: ChoreographyOptions) {
  registerGsap();
  const { scope } = opts;
  const mm = gsap.matchMedia(scope);

  mm.add({ desktop: DESKTOP_QUERY, mobile: MOBILE_QUERY, reduce: REDUCED_QUERY }, (context) => {
    const { desktop, reduce } = context.conditions as Conditions;
    heroScroll(desktop);
    if (desktop) journeyDesktop(scope);
    else journeyMobile(scope);
    television(scope, opts, desktop);
    contact(scope, desktop, reduce);
    sectionTracking(opts);
  });

  let disposed = false;
  let refreshTimer = 0;
  const refresh = () => {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => !disposed && ScrollTrigger.refresh(), 120);
  };
  void document.fonts?.ready.then(refresh);
  const images = Array.from(scope.querySelectorAll("img")).filter((img) => !img.complete);
  images.forEach((img) => img.addEventListener("load", refresh, { once: true }));
  refresh();

  return () => {
    disposed = true;
    window.clearTimeout(refreshTimer);
    images.forEach((img) => img.removeEventListener("load", refresh));
    mm.revert();
  };
}
