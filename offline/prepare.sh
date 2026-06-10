#!/usr/bin/env bash
# Prepares the local machine for building and running using only the
# packages contained in this repository (no internet access):
#   ./offline/prepare.sh
set -euo pipefail
cd "$(dirname "$0")/.."

GREEN=$'\e[32m'; YELLOW=$'\e[33m'; RESET=$'\e[0m'
ok()   { echo "${GREEN}[ok]${RESET} $*"; }
warn() { echo "${YELLOW}[warn]${RESET} $*"; }

# ── 1. Restore the pnpm store ──────────────────────────────────────────────
rm -rf .pnpm-store
cat offline/deps/pnpm-store.tar.gz.part-* | tar -xzf -
ok "pnpm store restored to .pnpm-store/ ($(du -sh .pnpm-store | cut -f1))"

# ── 2. Load the base Docker images ─────────────────────────────────────────
if command -v docker >/dev/null 2>&1; then
  cat offline/images/node-22-alpine.tar.gz.part-* | docker load
  docker load < offline/images/nginx-alpine.tar.gz
  ok "Docker images loaded"
else
  warn "docker not found — skipped image loading"
fi

echo
ok "Done. To bring the app up:"
echo "     docker compose build && docker compose up -d"
