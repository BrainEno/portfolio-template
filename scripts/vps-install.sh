#!/usr/bin/env bash
# Fresh Ubuntu/Debian VPS -> running site in one command (run as root):
#   curl -fsSL https://raw.githubusercontent.com/BrainEno/portfolio-template/main/scripts/vps-install.sh | DOMAIN=example.com bash
# DOMAIN is optional (without it the site is served on http://<ip>:3000).
set -euo pipefail
REPO="${REPO:-https://github.com/BrainEno/portfolio-template.git}"
DIR="${DIR:-/opt/portfolio}"

command -v git >/dev/null 2>&1 || { apt-get update -y && apt-get install -y git curl; }
command -v docker >/dev/null 2>&1 || curl -fsSL https://get.docker.com | sh

if [ -d "$DIR/.git" ]; then git -C "$DIR" pull --ff-only; else git clone --depth 1 "$REPO" "$DIR"; fi
cd "$DIR"
exec bash scripts/deploy.sh docker
