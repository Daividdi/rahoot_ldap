#!/usr/bin/env bash
# Prepara a máquina local para build e execução usando apenas os
# pacotes contidos neste repositório (sem acesso à internet):
#   ./offline/preparar.sh
set -euo pipefail
cd "$(dirname "$0")/.."

GREEN=$'\e[32m'; YELLOW=$'\e[33m'; RESET=$'\e[0m'
ok()   { echo "${GREEN}[ok]${RESET} $*"; }
warn() { echo "${YELLOW}[aviso]${RESET} $*"; }

# ── 1. Restaura a store pnpm ───────────────────────────────────────────────
rm -rf .pnpm-store
cat offline/deps/pnpm-store.tar.gz.part-* | tar -xzf -
ok "store pnpm restaurada em .pnpm-store/ ($(du -sh .pnpm-store | cut -f1))"

# ── 2. Carrega as imagens Docker base ──────────────────────────────────────
if command -v docker >/dev/null 2>&1; then
  cat offline/images/node-22-alpine.tar.gz.part-* | docker load
  docker load < offline/images/nginx-alpine.tar.gz
  ok "imagens Docker carregadas"
else
  warn "docker não encontrado — pulei o carregamento das imagens"
fi

echo
ok "Pronto. Para subir a aplicação:"
echo "     docker compose build && docker compose up -d"
