#!/usr/bin/env bash
# Uso: ./deploy.sh [dominio]
# Ex:  ./deploy.sh rahoot.meusite.com

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="$(dirname "$SCRIPT_DIR")/config"
IMAGES_DIR="$(dirname "$SCRIPT_DIR")/images"
DOMAIN="${1:-localhost}"

GREEN=$'\e[32m'; BLUE=$'\e[34m'; YELLOW=$'\e[33m'; RED=$'\e[31m'; RESET=$'\e[0m'
log()  { echo "${BLUE}[deploy]${RESET} $*"; }
ok()   { echo "${GREEN}[ok]${RESET} $*"; }
warn() { echo "${YELLOW}[warn]${RESET} $*"; }
err()  { echo "${RED}[err]${RESET} $*" >&2; exit 1; }

for cmd in docker node; do
    command -v "$cmd" >/dev/null 2>&1 || err "$cmd não encontrado."
done
docker compose version >/dev/null 2>&1 || err "docker compose plugin não encontrado."

log "Deploying rahoot2  →  $DOMAIN"
log "Repo: $SCRIPT_DIR  |  Dados: $DATA_DIR"

mkdir -p "$DATA_DIR/quizz" "$DATA_DIR/avatars-3d" "$IMAGES_DIR"
ok "Diretórios prontos"

if [ ! -f "$DATA_DIR/game.json" ] && [ -f "$SCRIPT_DIR/config/game.json" ]; then
    cp "$SCRIPT_DIR/config/game.json" "$DATA_DIR/game.json"
    ok "game.json padrão copiado"
fi
if [ -d "$SCRIPT_DIR/config/quizz" ] && [ -z "$(ls -A "$DATA_DIR/quizz" 2>/dev/null)" ]; then
    cp -r "$SCRIPT_DIR/config/quizz/." "$DATA_DIR/quizz/"
    ok "Quizzes padrão copiados"
fi

if [ ! -f "$SCRIPT_DIR/.env" ]; then
    cat > "$SCRIPT_DIR/.env" <<EOF
WEB_ORIGIN=http://${DOMAIN}
SOCKET_URL=http://${DOMAIN}:3002
TZ=America/Sao_Paulo
WEB_PORT=3003
SOCKET_PORT=3002
EOF
    ok ".env criado"
    warn "Edite .env se precisar ajustar domínio ou portas."
else
    warn ".env existente mantido."
fi

if [ ! -f "$DATA_DIR/avatars-3d/catalog.json" ]; then
    log "Baixando avatares 3D (~590MB)..."
    AVATARS_ROOT="$DATA_DIR/avatars-3d" node "$SCRIPT_DIR/fetch-r3.mjs"
    ok "Avatares baixados"
else
    ok "Avatares já presentes — pulando download"
fi

cd "$SCRIPT_DIR"
log "Build Docker..."
docker compose build

log "Subindo containers..."
docker compose up -d

echo ""
ok "rahoot2 no ar!"
ok "  Web:    http://${DOMAIN}  (nginx porta 80)"
ok "  Socket: http://${DOMAIN}:3002"
ok "  Logs:   docker compose logs -f"
ok "  Stop:   docker compose down"
warn "HTTPS: certbot --nginx -d ${DOMAIN}"
