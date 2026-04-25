#!/usr/bin/env bash
# Uso: ./deploy.sh                   ← modo interativo (recomendado)
#      ./deploy.sh 192.168.1.100     ← IP local, portas padrão
#      ./deploy.sh rahoot.exemplo.com ← domínio público

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="$(dirname "$SCRIPT_DIR")/config"
IMAGES_DIR="$(dirname "$SCRIPT_DIR")/images"

GREEN=$'\e[32m'; BLUE=$'\e[34m'; YELLOW=$'\e[33m'; RED=$'\e[31m'; CYAN=$'\e[36m'; RESET=$'\e[0m'
log()   { echo "${BLUE}[deploy]${RESET} $*"; }
ok()    { echo "${GREEN}[ok]${RESET} $*"; }
warn()  { echo "${YELLOW}[warn]${RESET} $*"; }
err()   { echo "${RED}[erro]${RESET} $*" >&2; exit 1; }
ask()   { echo -n "${CYAN}[?]${RESET} $* "; }

# ── Pré-requisitos ─────────────────────────────────────────────────────────
for cmd in docker node; do
    command -v "$cmd" >/dev/null 2>&1 || err "$cmd não encontrado. Instale antes de continuar."
done
docker compose version >/dev/null 2>&1 || err "docker compose plugin não encontrado."

# ── Detectar IP local da máquina automaticamente ───────────────────────────
detect_local_ip() {
    ip route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}' \
    || hostname -I 2>/dev/null | awk '{print $1}' \
    || echo "127.0.0.1"
}

# ── Coleta de parâmetros ───────────────────────────────────────────────────
echo ""
echo "${BLUE}══════════════════════════════════════════════${RESET}"
echo "${BLUE}         rahoot2 — Assistente de Deploy       ${RESET}"
echo "${BLUE}══════════════════════════════════════════════${RESET}"
echo ""

if [ $# -ge 1 ]; then
    HOST="$1"
    WEB_PORT="${2:-3003}"
    SOCKET_PORT="${3:-3002}"
else
    LOCAL_IP="$(detect_local_ip)"

    echo "  Escolha o tipo de acesso:"
    echo "  ${CYAN}1)${RESET} IP local  (ex: ${LOCAL_IP}  — acesso na rede interna)"
    echo "  ${CYAN}2)${RESET} Domínio   (ex: rahoot.empresa.com  — acesso público)"
    echo ""
    ask "Opção [1/2] (padrão: 1):"
    read -r TIPO
    TIPO="${TIPO:-1}"

    if [ "$TIPO" = "2" ]; then
        ask "Domínio público:"
        read -r HOST
        HOST="${HOST:-localhost}"
    else
        ask "IP do servidor [detectado: ${LOCAL_IP}]:"
        read -r HOST
        HOST="${HOST:-$LOCAL_IP}"
    fi

    echo ""
    ask "Porta web (nginx → app) [padrão: 80]:"
    read -r NGINX_PORT
    NGINX_PORT="${NGINX_PORT:-80}"

    ask "Porta socket (acesso direto dos clientes) [padrão: 3002]:"
    read -r SOCKET_PORT
    SOCKET_PORT="${SOCKET_PORT:-3002}"

    ask "Porta interna web container [padrão: 3003]:"
    read -r WEB_PORT
    WEB_PORT="${WEB_PORT:-3003}"
fi

# Monta as URLs de acesso
NGINX_PORT="${NGINX_PORT:-80}"
if [ "${NGINX_PORT}" = "80" ]; then
    WEB_ORIGIN="http://${HOST}"
else
    WEB_ORIGIN="http://${HOST}:${NGINX_PORT}"
fi
SOCKET_URL="http://${HOST}:${SOCKET_PORT}"

echo ""
log "Configuração:"
log "  Host:         ${HOST}"
log "  Web (nginx):  ${WEB_ORIGIN}"
log "  Socket:       ${SOCKET_URL}"
log "  Porta nginx:  ${NGINX_PORT}"
log "  Porta socket: ${SOCKET_PORT}"
log "  Porta web container (host): ${WEB_PORT}"
echo ""

# ── Diretórios de dados ────────────────────────────────────────────────────
mkdir -p "$DATA_DIR/quizz" "$DATA_DIR/avatars-3d" "$IMAGES_DIR"
ok "Diretórios de dados prontos"

# ── Seed config padrão ────────────────────────────────────────────────────
if [ ! -f "$DATA_DIR/game.json" ] && [ -f "$SCRIPT_DIR/config/game.json" ]; then
    cp "$SCRIPT_DIR/config/game.json" "$DATA_DIR/game.json"
    ok "game.json padrão copiado"
fi
if [ -d "$SCRIPT_DIR/config/quizz" ] && [ -z "$(ls -A "$DATA_DIR/quizz" 2>/dev/null)" ]; then
    cp -r "$SCRIPT_DIR/config/quizz/." "$DATA_DIR/quizz/"
    ok "Quiz de exemplo copiado"
fi

# ── .env ──────────────────────────────────────────────────────────────────
if [ ! -f "$SCRIPT_DIR/.env" ]; then
    cat > "$SCRIPT_DIR/.env" <<EOF
WEB_ORIGIN=${WEB_ORIGIN}
SOCKET_URL=${SOCKET_URL}
TZ=America/Sao_Paulo
WEB_PORT=${WEB_PORT}
SOCKET_PORT=${SOCKET_PORT}
NGINX_PORT=${NGINX_PORT}
EOF
    ok ".env criado"
else
    warn ".env existente mantido — edite manualmente se precisar mudar host/portas"
fi

# ── nginx.conf — gera com host e porta corretos ───────────────────────────
cat > "$SCRIPT_DIR/nginx.conf" <<NGINXCONF
server {
    listen ${NGINX_PORT};
    server_name ${HOST};

    client_max_body_size 50M;

    location /images/ {
        alias /usr/share/nginx/html/images/;
        autoindex off;
    }

    location / {
        proxy_pass         http://rahoot2:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade           \$http_upgrade;
        proxy_set_header   Connection        'upgrade';
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINXCONF
ok "nginx.conf gerado para ${HOST}:${NGINX_PORT}"

# ── docker-compose.yml — atualiza porta nginx ────────────────────────────
sed -i "s|\"80:80\"|\"${NGINX_PORT}:${NGINX_PORT}\"|g" "$SCRIPT_DIR/docker-compose.yml" 2>/dev/null || true

# ── Avatares 3D ───────────────────────────────────────────────────────────
if [ ! -f "$DATA_DIR/avatars-3d/catalog.json" ]; then
    log "Baixando avatares 3D (~590MB)..."
    AVATARS_ROOT="$DATA_DIR/avatars-3d" node "$SCRIPT_DIR/fetch-r3.mjs"
    ok "Avatares baixados"
else
    ok "Avatares já presentes — pulando download"
fi

# ── Build e start ─────────────────────────────────────────────────────────
cd "$SCRIPT_DIR"
log "Build Docker..."
docker compose build

log "Subindo containers..."
docker compose up -d

echo ""
ok "══════════════════════════════════════════════"
ok "rahoot2 no ar!"
ok "  Acesso web:  ${WEB_ORIGIN}"
ok "  Socket:      ${SOCKET_URL}"
ok "  Logs:        docker compose logs -f"
ok "  Stop:        docker compose down"
ok "══════════════════════════════════════════════"
if [ "$TIPO" = "2" ] 2>/dev/null || [[ "${HOST}" != 192.* && "${HOST}" != 10.* && "${HOST}" != 172.* ]]; then
    echo ""
    warn "Para HTTPS com domínio público:"
    warn "  certbot --nginx -d ${HOST}"
fi
