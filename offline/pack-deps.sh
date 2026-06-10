#!/usr/bin/env bash
# Generates the repository's offline packages.
# Run on a machine WITH internet access, from any directory:
#   ./offline/pack-deps.sh
set -euo pipefail
cd "$(dirname "$0")/.."

PNPM_VERSION=9.15.9
GREEN=$'\e[32m'; RESET=$'\e[0m'
ok() { echo "${GREEN}[ok]${RESET} $*"; }

rm -rf .pnpm-store offline/deps offline/images
mkdir -p offline/deps offline/images offline/bin

# ── 1. Standalone pnpm (installed via npm during offline builds) ───────────
rm -f offline/bin/pnpm-*.tgz
npm pack "pnpm@${PNPM_VERSION}" --pack-destination offline/bin >/dev/null
ok "pnpm ${PNPM_VERSION} packed into offline/bin/"

# ── 2. pnpm store with every dependency in the lockfile ────────────────────
# The fetch runs in a fresh temp dir so the local node_modules is untouched
# and the store is always fully repopulated.
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/packages/web" "$TMP/packages/socket" "$TMP/packages/common"
cp pnpm-lock.yaml pnpm-workspace.yaml package.json "$TMP/"
cp packages/web/package.json "$TMP/packages/web/"
cp packages/socket/package.json "$TMP/packages/socket/"
[ -f packages/common/package.json ] && cp packages/common/package.json "$TMP/packages/common/"
STORE_DIR="$(pwd)/.pnpm-store"
(cd "$TMP" && npx -y "pnpm@${PNPM_VERSION}" fetch --store-dir "$STORE_DIR")
ok "pnpm store generated ($(du -sh .pnpm-store | cut -f1))"

# Split into 90MB parts (GitHub rejects files above 100MB)
tar -czf - .pnpm-store | split -b 90m - offline/deps/pnpm-store.tar.gz.part-
ok "store archived in offline/deps/ ($(ls offline/deps | wc -l | tr -d ' ') parts)"

# ── 3. Base Docker images ──────────────────────────────────────────────────
docker pull node:22-alpine
docker pull nginx:alpine
docker save node:22-alpine | gzip | split -b 90m - offline/images/node-22-alpine.tar.gz.part-
docker save nginx:alpine | gzip > offline/images/nginx-alpine.tar.gz
ok "Docker images saved in offline/images/"

echo
ok "Done. Commit the offline/ folder to publish the packages in the repository."
