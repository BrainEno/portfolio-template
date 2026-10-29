-- Netlify Database migration. Applied automatically before publish.
create table if not exists site_content (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists media_assets (
  id text primary key,
  filename text not null,
  mime_type text not null,
  size integer not null check (size >= 0),
  data bytea not null,
  created_at timestamptz not null default now()
);
create table if not exists admin_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
create index if not exists media_assets_created_at_idx on media_assets (created_at desc);
