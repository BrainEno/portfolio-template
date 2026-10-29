#!/usr/bin/env bash
# One-click deploy helper.   bash scripts/deploy.sh [docker|node|netlify|cloudflare|vercel]
# With no argument an interactive menu is shown.
set -euo pipefail
cd "$(dirname "$0")/.."

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing '$1'. $2"; exit 1; }; }
rand() { (openssl rand -hex 16 2>/dev/null) || head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n'; }

ensure_env_value() { # KEY VALUE  (append only when missing/empty in .env)
  touch .env
  if ! grep -qE "^$1=.+" .env; then
    grep -vE "^$1=" .env > .env.tmp || true; mv .env.tmp .env
    echo "$1=$2" >> .env
  fi
}

deploy_docker() {
  need docker "Install Docker: https://docs.docker.com/engine/install/ (Ubuntu: curl -fsSL https://get.docker.com | sh)"
  ensure_env_value POSTGRES_PASSWORD "$(rand)"
  ensure_env_value ADMIN_SECRET "$(rand)"
  say "Building and starting web + PostgreSQL"
  if [ -n "${DOMAIN:-}" ]; then
    ensure_env_value DOMAIN "$DOMAIN"
    ensure_env_value NEXT_PUBLIC_SITE_URL "https://$DOMAIN"
    docker compose --profile https up -d --build
    echo "Open https://$DOMAIN/admin  (DNS A record must point at this server)"
  else
    docker compose up -d --build
    echo "Open http://<server-ip>:${WEB_PORT:-3000}/admin  - the first visit lets you choose the admin password."
    echo "Want HTTPS?  DOMAIN=your.domain bash scripts/deploy.sh docker"
  fi
}

deploy_node() {
  need node "Install Node 22: https://nodejs.org"
  say "Installing and building"
  npm ci --no-audit --no-fund 2>/dev/null || npm install --no-audit --no-fund
  [ -f .env ] || cp .env.example .env
  ensure_env_value ADMIN_SECRET "$(rand)"
  npm run build
  if command -v pm2 >/dev/null 2>&1 || npm i -g pm2 >/dev/null 2>&1; then
    pm2 delete portfolio >/dev/null 2>&1 || true
    pm2 start npm --name portfolio -- run start
    pm2 save
    echo "Running under PM2 on port 3000 (pm2 startup  -> start on boot).  Reverse proxy: deploy/nginx.conf.example"
  else
    echo "Built. Start with:  npm run start   (or use deploy/portfolio.service.example for systemd)"
  fi
}

deploy_netlify() {
  say "Netlify"
  echo "Database: in the Netlify UI add 'Netlify Database' (or any Postgres) to the site -> NETLIFY_DB_URL/DATABASE_URL is injected."
  npx --yes netlify-cli@latest login
  npx --yes netlify-cli@latest init || true
  npx --yes netlify-cli@latest deploy --build --prod
}

deploy_cloudflare() {
  say "Cloudflare Workers (OpenNext)"
  npx wrangler login
  echo "Paste your PostgreSQL URL when asked (or press Ctrl+C and configure Hyperdrive, see docs/DEPLOY.md):"
  npx wrangler secret put DATABASE_URL || true
  npm run cf:deploy
}

deploy_vercel() {
  say "Vercel"
  npx --yes vercel@latest --prod
}

choice="${1:-}"
if [ -z "$choice" ]; then
  echo "Where do you want to deploy?"
  echo "  1) My own server / VPS with Docker      (easiest, includes PostgreSQL)"
  echo "  2) My own server / VPS with Node + PM2  (bring your own PostgreSQL)"
  echo "  3) Netlify"
  echo "  4) Cloudflare Workers"
  echo "  5) Vercel"
  read -rp "Number [1-5]: " n
  case "$n" in 1) choice=docker;; 2) choice=node;; 3) choice=netlify;; 4) choice=cloudflare;; 5) choice=vercel;; *) echo "Invalid"; exit 1;; esac
fi

case "$choice" in
  docker) deploy_docker ;;
  node) deploy_node ;;
  netlify) deploy_netlify ;;
  cloudflare) deploy_cloudflare ;;
  vercel) deploy_vercel ;;
  *) echo "Unknown target '$choice'"; exit 1 ;;
esac
