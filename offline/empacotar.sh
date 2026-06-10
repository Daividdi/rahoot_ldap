#!/usr/bin/env bash
# Gera os pacotes offline do repositório.
# Rode numa máquina COM internet, a partir de qualquer diretório:
#   ./offline/empacotar.sh
set -euo pipefail
cd "$(dirname "$0")/.."

PNPM_VERSION=9.15.9
GREEN=$'\e[32m'; RESET=$'\e[0m'
ok() { echo "${GREEN}[ok]${RESET} $*"; }

rm -rf .pnpm-store offline/deps offline/images
mkdir -p offline/deps offline/images offline/bin

# ── 1. pnpm standalone (instalado via npm no build offline) ───────────────
rm -f offline/bin/pnpm-*.tgz
npm pack "pnpm@${PNPM_VERSION}" --pack-destination offline/bin >/dev/null
ok "pnpm ${PNPM_VERSION} empacotado em offline/bin/"

# ── 2. Store pnpm com todas as dependências do lockfile ───────────────────
# O fetch roda num diretório temporário para não tocar no node_modules local.
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/packages/web" "$TMP/packages/socket" "$TMP/packages/common"
cp pnpm-lock.yaml pnpm-workspace.yaml package.json "$TMP/"
cp packages/web/package.json "$TMP/packages/web/"
cp packages/socket/package.json "$TMP/packages/socket/"
[ -f packages/common/package.json ] && cp packages/common/package.json "$TMP/packages/common/"
STORE_DIR="$(pwd)/.pnpm-store"
(cd "$TMP" && npx -y "pnpm@${PNPM_VERSION}" fetch --store-dir "$STORE_DIR")
ok "store pnpm gerada ($(du -sh .pnpm-store | cut -f1))"

# Divide em partes de 90MB (GitHub recusa arquivos acima de 100MB)
tar -czf - .pnpm-store | split -b 90m - offline/deps/pnpm-store.tar.gz.part-
ok "store arquivada em offline/deps/ ($(ls offline/deps | wc -l | tr -d ' ') partes)"

# ── 3. Imagens Docker base ─────────────────────────────────────────────────
docker pull node:22-alpine
docker pull nginx:alpine
docker save node:22-alpine | gzip | split -b 90m - offline/images/node-22-alpine.tar.gz.part-
docker save nginx:alpine | gzip > offline/images/nginx-alpine.tar.gz
ok "imagens Docker salvas em offline/images/"

echo
ok "Pronto. Commit a pasta offline/ para publicar os pacotes no repositório."
