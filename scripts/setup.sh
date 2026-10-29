#!/usr/bin/env bash
# One-command local setup + dev server.
#   bash scripts/setup.sh            # install, create .env, start Postgres if Docker exists, run dev
#   bash scripts/setup.sh --no-db    # skip Postgres: demo mode (mock data, /admin works without a database)
#   bash scripts/setup.sh --no-run   # only prepare, do not start the dev server
set -euo pipefail
cd "$(dirname "$0")/.."

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
USE_DB=1; RUN=1
for arg in "$@"; do
  case "$arg" in
    --no-db) USE_DB=0 ;;
    --no-run) RUN=0 ;;
  esac
done

command -v node >/dev/null 2>&1 || { echo "Node.js is missing. Install Node 22 from https://nodejs.org and run this again."; exit 1; }
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
[ "$NODE_MAJOR" -ge 20 ] || { echo "Node $NODE_MAJOR is too old (need 20+)."; exit 1; }

say "Installing dependencies"
npm install --no-audit --no-fund

if [ ! -f .env ]; then
  say "Creating .env from .env.example"
  cp .env.example .env
fi

if [ "$USE_DB" = "1" ]; then
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    say "Starting PostgreSQL in Docker (127.0.0.1:5432)"
    docker compose up -d db
    # docker-compose.yml uses user/db "portfolio"; point .env at it unless the user already customised it.
    if grep -q "postgres:postgres@127.0.0.1:5432/app_db" .env; then
      sed -i.bak "s#postgresql://postgres:postgres@127.0.0.1:5432/app_db#postgresql://portfolio:portfolio@127.0.0.1:5432/portfolio#" .env && rm -f .env.bak
    fi
    for _ in $(seq 1 30); do
      docker compose exec -T db pg_isready -U portfolio -d portfolio >/dev/null 2>&1 && break
      sleep 1
    done
  else
    echo "Docker not found/running - using whatever DATABASE_URL is in .env (or demo mode if it is unreachable)."
  fi
fi

say "Checking configuration"
node scripts/doctor.mjs

if [ "$RUN" = "1" ]; then
  say "Starting http://localhost:3000   (admin: http://localhost:3000/admin)"
  exec npm run dev
fi
