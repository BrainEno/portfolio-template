"use client";

import { type Patch, type TabId } from "./shared";
import { Field, TextInput, Localized, ImageField, SourcePicker, ListControls, move, Panel } from "./fields";
import { DataPanel } from "./DataPanel";
import { slugify } from "../content/normalize";
import { type PortfolioContent, type Work } from "../content/types";

export function TvCalibrator({ content, patch }: { content: PortfolioContent; patch: Patch }) {
  const { tv } = content.works;
  const keys = ["top", "left", "width", "height"] as const;
  return (
    <div className="ad-tv">
      <div className="ad-tv-preview" style={{ aspectRatio: `${tv.width} / ${tv.height}` }}>
        {tv.src ? <img src={tv.src} alt="" /> : null}
        <div
          className="ad-tv-rect"
          style={{ top: `${tv.screen.top}%`, left: `${tv.screen.left}%`, width: `${tv.screen.width}%`, height: `${tv.screen.height}%` }}
        />
      </div>
      <div className="ad-grid-4">
        {keys.map((key) => (
          <Field key={key} label={`Glass ${key} %`}>
            <input
              className="ad-input"
              type="number"
              step="0.05"
              value={tv.screen[key]}
              onChange={(e) => patch((d) => { d.works.tv.screen[key] = Number(e.target.value); })}
            />
          </Field>
        ))}
      </div>
    </div>
  );
}

export function Editor({ tab, content, patch, notify }: { tab: TabId; content: PortfolioContent; patch: Patch; notify: (m: string, tone?: "error") => void }) {
  const onError = (m: string) => notify(m, "error");

  switch (tab) {
    case "identity":
      return (
        <Panel title="Identity & navigation" hint="Everything here is what visitors read first: brand, browser title, SEO copy and the three nav labels.">
          <div className="ad-grid-2">
            <Field label="User / display name (top-left)" hint="Shown in the header of the index page.">
              <TextInput value={content.identity.name} onChange={(v) => patch((d) => { d.identity.name = v; })} />
            </Field>
            <Field label="Default language">
              <select className="ad-input" value={content.identity.defaultLanguage} onChange={(e) => patch((d) => { d.identity.defaultLanguage = e.target.value === "en" ? "en" : "zh"; })}>
                <option value="zh">简体中文</option>
                <option value="en">English</option>
              </select>
            </Field>
          </div>
          <Localized label="Site name (browser title suffix)" value={content.identity.siteName} onChange={(v) => patch((d) => { d.identity.siteName = v; })} />
          <Localized label="Page title" value={content.identity.pageTitle} onChange={(v) => patch((d) => { d.identity.pageTitle = v; })} />
          <Localized label="Meta description" value={content.identity.description} onChange={(v) => patch((d) => { d.identity.description = v; })} multiline />
          <Localized label="Nav — intro" value={content.navigation.intro} onChange={(v) => patch((d) => { d.navigation.intro = v; })} />
          <Localized label="Nav — works" value={content.navigation.works} onChange={(v) => patch((d) => { d.navigation.works = v; })} />
          <Localized label="Nav — contact" value={content.navigation.contact} onChange={(v) => patch((d) => { d.navigation.contact = v; })} />
        </Panel>
      );
    case "hero":
      return (
        <Panel title="Hero">
          {content.hero.headlines.map((headline, i) => (
            <Localized key={i} label={`Headline ${i + 1}`} value={headline} onChange={(v) => patch((d) => { d.hero.headlines[i] = v; })} />
          ))}
          <ImageField label="Hero artwork (also used in the two image bars)" value={content.hero.image} onChange={(v) => patch((d) => { d.hero.image = v; })} onError={onError} />
        </Panel>
      );
    case "intro":
      return (
        <Panel title="Biography" hint="The two long paragraphs drive the pinned intro sequence; keep each one roughly 200–400 characters so the reading beat stays comfortable.">
          <Localized label="Section heading" value={content.intro.heading} onChange={(v) => patch((d) => { d.intro.heading = v; })} />
          <ImageField label="Portrait" value={content.intro.portrait} onChange={(v) => patch((d) => { d.intro.portrait = v; })} onError={onError} />
          <Localized label="Portrait signature (empty hides it)" value={content.intro.portraitCredit} onChange={(v) => patch((d) => { d.intro.portraitCredit = v; })} />
          <Localized label="First paragraph" value={content.intro.primaryText} onChange={(v) => patch((d) => { d.intro.primaryText = v; })} multiline rows={7} />
          <Localized label="Second paragraph" value={content.intro.secondaryText} onChange={(v) => patch((d) => { d.intro.secondaryText = v; })} multiline rows={6} />
          {content.intro.accentImages.map((image, i) => (
            <ImageField key={i} label={`Accent image ${i + 1}`} value={image} onChange={(v) => patch((d) => { d.intro.accentImages[i] = v; })} onError={onError} />
          ))}
        </Panel>
      );
    case "gallery":
      return (
        <Panel title={`Gallery rail · ${content.intro.gallery.length}`}>
          {content.intro.gallery.map((image, i) => (
            <div key={i} className="ad-card">
              <div className="ad-card-head">
                <strong>Image {String(i + 1).padStart(2, "0")}</strong>
                <ListControls
                  index={i}
                  length={content.intro.gallery.length}
                  onMove={(a, b) => patch((d) => { d.intro.gallery = move(d.intro.gallery, a, b); })}
                  onRemove={(idx) => patch((d) => { d.intro.gallery.splice(idx, 1); })}
                />
              </div>
              <ImageField label="Image" value={image} onChange={(v) => patch((d) => { d.intro.gallery[i] = v; })} onError={onError} />
            </div>
          ))}
          <button type="button" className="ad-button is-ghost" onClick={() => patch((d) => { d.intro.gallery.push({ src: "", alt: { zh: "", en: "" } }); })}>
            + Add image
          </button>
        </Panel>
      );
    case "works":
      return (
        <Panel
          title={`Works · ${content.works.items.length}`}
          hint="Each row = one television entry. Image is what shows inside the tube; description and detail images are stored for the project detail view and included in backups."
        >
          <Localized label="List heading" value={content.works.heading} onChange={(v) => patch((d) => { d.works.heading = v; })} />
          <Field label="Period"><TextInput value={content.works.period} onChange={(v) => patch((d) => { d.works.period = v; })} /></Field>
          {content.works.items.map((work, i) => (
            <div key={work.id + i} className="ad-card">
              <div className="ad-card-head">
                <strong>{work.title.en || work.title.zh || `Work ${i + 1}`}</strong>
                <ListControls
                  index={i}
                  length={content.works.items.length}
                  onMove={(a, b) => patch((d) => { d.works.items = move(d.works.items, a, b); })}
                  onRemove={(idx) => patch((d) => { d.works.items.splice(idx, 1); })}
                />
              </div>
              <Localized label="Title" value={work.title} onChange={(v) => patch((d) => { d.works.items[i].title = v; })} />
              <div className="ad-grid-3">
                <Field label="Date / start" hint="Shown before the separator."><TextInput value={work.year} onChange={(v) => patch((d) => { d.works.items[i].year = v; })} /></Field>
                <Field label="Slug (unique id)"><TextInput value={work.id} onChange={(v) => patch((d) => { d.works.items[i].id = slugify(v) || v; })} /></Field>
                <Field label="Project link" hint="Repository or live site."><TextInput value={work.url} onChange={(v) => patch((d) => { d.works.items[i].url = v; })} /></Field>
              </div>
              <Localized label="Stack / venue (after the separator)" value={work.credit} onChange={(v) => patch((d) => { d.works.items[i].credit = v; })} />
              <ImageField label="Image shown on the television" value={work.image} onChange={(v) => patch((d) => { d.works.items[i].image = v; })} onError={onError} />
              <Localized label="Project detail description" value={work.description} onChange={(v) => patch((d) => { d.works.items[i].description = v; })} multiline rows={4} />
              <div className="ad-subcard">
                <div className="ad-card-head">
                  <strong>Detail images · {work.detailImages.length}</strong>
                </div>
                {work.detailImages.map((image, j) => (
                  <div key={j} className="ad-detail-row">
                    <ImageField label={`Detail image ${j + 1}`} value={image} onChange={(v) => patch((d) => { d.works.items[i].detailImages[j] = v; })} onError={onError} />
                    <button
                      type="button"
                      className="ad-icon is-danger"
                      onClick={() => patch((d) => { d.works.items[i].detailImages.splice(j, 1); })}
                      aria-label="Remove detail image"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="ad-button is-ghost ad-button-sm"
                  onClick={() => patch((d) => { d.works.items[i].detailImages.push({ src: "", alt: { zh: "", en: "" } }); })}
                >
                  + Add detail image
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="ad-button is-ghost"
            onClick={() =>
              patch((d) => {
                const work: Work = {
                  id: `work-${Date.now().toString(36)}`,
                  title: { zh: "新项目", en: "New project" },
                  year: new Date().toISOString().slice(0, 7).replace("-", "."),
                  credit: { zh: "", en: "" },
                  image: { src: "", alt: { zh: "", en: "" } },
                  url: "",
                  description: { zh: "", en: "" },
                  detailImages: [],
                };
                d.works.items.push(work);
              })
            }
          >
            + Add work
          </button>
        </Panel>
      );
    case "tv":
      return (
        <Panel title="Television">
          <div className="ad-grid-2">
            <Field label="Artwork width (px)"><TextInput type="number" value={String(content.works.tv.width)} onChange={(v) => patch((d) => { d.works.tv.width = Number(v) || 1; })} /></Field>
            <Field label="Artwork height (px)"><TextInput type="number" value={String(content.works.tv.height)} onChange={(v) => patch((d) => { d.works.tv.height = Number(v) || 1; })} /></Field>
          </div>
          <div className="ad-field">
            <span className="ad-label">Television artwork</span>
            <SourcePicker src={content.works.tv.src} onChange={(src) => patch((d) => { d.works.tv.src = src; })} onError={onError} />
          </div>
          <TvCalibrator content={content} patch={patch} />
        </Panel>
      );
    case "contact":
      return (
        <Panel title="Contact">
          <div className="ad-grid-2">
            <Field label="Phone / handle" hint="Digits become a tel: link; anything else links to the credit URL.">
              <TextInput value={content.contact.phone} onChange={(v) => patch((d) => { d.contact.phone = v; })} />
            </Field>
            <Field label="Email"><TextInput type="email" value={content.contact.email} onChange={(v) => patch((d) => { d.contact.email = v; })} /></Field>
          </div>
          <div className="ad-grid-3">
            {content.contact.headlines.map((line, i) => (
              <Field key={i} label={`Headline line ${i + 1}`}><TextInput value={line} onChange={(v) => patch((d) => { d.contact.headlines[i] = v; })} /></Field>
            ))}
          </div>
          <Localized label="Marquee" value={content.contact.marquee} onChange={(v) => patch((d) => { d.contact.marquee = v; })} />
          <ImageField label="Phone booth artwork" value={content.contact.image} onChange={(v) => patch((d) => { d.contact.image = v; })} onError={onError} />
          <Field label="Copyright" wide><TextInput value={content.contact.copyright} onChange={(v) => patch((d) => { d.contact.copyright = v; })} /></Field>
          <Localized label="Credit prefix" value={content.contact.credit.prefix} onChange={(v) => patch((d) => { d.contact.credit.prefix = v; })} />
          <div className="ad-grid-2">
            <Field label="Credit name (empty hides credit)"><TextInput value={content.contact.credit.name} onChange={(v) => patch((d) => { d.contact.credit.name = v; })} /></Field>
            <Field label="Credit URL"><TextInput value={content.contact.credit.url} onChange={(v) => patch((d) => { d.contact.credit.url = v; })} /></Field>
          </div>
        </Panel>
      );
    case "theme":
      return (
        <Panel title="Theme">
          <div className="ad-grid-2">
            {(["stage", "accent"] as const).map((key) => (
              <Field key={key} label={key === "stage" ? "Stage colour" : "Accent colour"}>
                <div className="ad-color">
                  <input type="color" value={content.theme[key]} onChange={(e) => patch((d) => { d.theme[key] = e.target.value; })} />
                  <TextInput value={content.theme[key]} onChange={(v) => patch((d) => { d.theme[key] = v; })} />
                </div>
              </Field>
            ))}
          </div>
        </Panel>
      );
    case "data":
      return <DataPanel content={content} patch={patch} notify={notify} />;
  }
}

