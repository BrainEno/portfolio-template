# Animated Portfolio — React Router 8 · GSAP · Netlify

A one-page, scroll-choreographed résumé template. Every text, photo, project and
colour is editable from **`/admin`** — no code changes needed.

- `/` — preloader → hero → pinned portrait / biography / gallery journey → the
  television works index (rows light the screen, phone number on the glass, zoom
  through the tube) → contact.
- `/admin` — password-protected studio: bilingual fields (中文 / English), image
  upload or URL, add / remove / reorder gallery images and works, TV glass
  calibration, theme colours, JSON import / export.
- `/adam` — temporary read-only preview of the studio structure. Opens with the
  temporary password `123456` while no database is connected and retires itself
  automatically once PostgreSQL is reachable.

## Demo → live

| Mode | When | Password | Data |
|---|---|---|---|
| Demo | no reachable PostgreSQL | temporary `123456` | sample content in memory |
| Live | PostgreSQL connected | your own password (`ADMIN_PASSWORD`, or chosen on first `/admin` visit) | Postgres tables |

The schema (`site_content`, `media_assets`, `admin_settings`) is created
automatically on the first successful connection — no migrations to run.
`GET /api/status` reports the current mode. Full beginner steps:
[`docs/NETLIFY_DEPLOY.md`](docs/NETLIFY_DEPLOY.md).

## Stack

React Router 8 (framework mode, SSR) · React 19 · Vite 8 · TypeScript ·
GSAP 3 (ScrollTrigger + ScrollSmoother) · Netlify Functions + Netlify Blobs.

## Run locally

```bash
nvm use            # Node 22
npm install
cp .env.example .env   # optional: with no DATABASE_URL the site runs in demo mode
npm run dev        # http://localhost:5173 · /admin (temp password 123456) · /adam
```

`@netlify/vite-plugin` emulates the Netlify runtime locally. Add `DATABASE_URL`
to `.env` (any Postgres) or run `netlify database init` to switch to live mode;
without a database the app stays in demo mode.

## Deploy to Netlify

1. Push this folder to GitHub/GitLab and “Import project” in Netlify
   (or run `npx netlify deploy --build --prod`).
2. Build command `npm run build`, publish directory `build/client`
   (already set in `netlify.toml`).
3. Add a database: **Project configuration → Database → Create database**
   (Netlify Database injects `NETLIFY_DB_URL` automatically), or set
   `DATABASE_URL` to any Postgres connection string.
4. Optionally set **`ADMIN_PASSWORD`** / **`ADMIN_SECRET`**. If you skip this,
   the first visit to `/admin` asks you to choose the permanent password
   (stored as a salted hash) — the temporary `123456` stops working.
5. Open `https://<site>/admin`, sign in, edit works / image links, **Publish**.

Content is stored in `site_content`, uploads in `media_assets`; tables are
created automatically on the first successful connection.

## Project layout

```
app/
  root.tsx, routes.ts
  routes/            home, admin, api.* resource routes
  lib/storage.server.ts   Netlify Blobs / filesystem adapter
  portfolio/
    content/         types, defaults (template content), normalize
    scroll/          choreography.ts — all GSAP timelines
    ui/              Portfolio shell, sections
    admin/           AdminApp (the /admin editor)
    server/          auth (signed cookie) + Web-standard API handlers
    styles/          portfolio.css, admin.css
public/              fonts, images, tv-bg.webp
```

The default content lives in `app/portfolio/content/defaults.ts`; anything saved
from `/admin` overrides it. To swap the television artwork, upload a new image
under **Television** and drag the glass rectangle values until the red overlay
matches the screen.

## Scroll choreography

All animation lives in `app/portfolio/scroll/choreography.ts`:

- One `ScrollSmoother` (native scrolling on touch devices).
- `gsap.matchMedia` splits desktop (≥768px) and mobile choreography and respects
  `prefers-reduced-motion`.
- The journey pin is a single scrubbed timeline whose beats are laid out on an
  explicit scroll budget; reading holds scale with the length of the copy, so
  longer biographies automatically get more dwell.
- The works rows activate the television as they cross the reading line (hover
  and keyboard focus too); the phone and exit beats have their own spacers so
  their dwell is independent of the number of works.
