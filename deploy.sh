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
info()  { echo "${CYAN}[info]${RESET} $*"; }

# ══════════════════════════════════════════════════════════════════════════
# BLOCO 1 — VERIFICAÇÃO E INSTALAÇÃO DE DEPENDÊNCIAS
# ══════════════════════════════════════════════════════════════════════════

NEEDS_SUDO=""
if [ "$(id -u)" != "0" ]; then
    command -v sudo >/dev/null 2>&1 || err "Execute como root ou instale sudo."
    NEEDS_SUDO="sudo"
fi
RUN() { $NEEDS_SUDO "$@"; }

# Detecta gerenciador de pacotes
detect_pkg_manager() {
    if   command -v apt-get >/dev/null 2>&1; then echo "apt"
    elif command -v dnf     >/dev/null 2>&1; then echo "dnf"
    elif command -v yum     >/dev/null 2>&1; then echo "yum"
    elif command -v pacman  >/dev/null 2>&1; then echo "pacman"
    elif command -v brew    >/dev/null 2>&1; then echo "brew"
    else echo "unknown"
    fi
}

PKG_MGR="$(detect_pkg_manager)"
PKG_UPDATED=0

pkg_update() {
    [ "$PKG_UPDATED" = "1" ] && return
    case "$PKG_MGR" in
        apt)    RUN apt-get update -qq ;;
        dnf|yum) RUN "$PKG_MGR" makecache -q ;;
        pacman) RUN pacman -Sy --noconfirm ;;
    esac
    PKG_UPDATED=1
}

pkg_install() {
    case "$PKG_MGR" in
        apt)    RUN apt-get install -y -qq "$@" ;;
        dnf)    RUN dnf install -y -q "$@" ;;
        yum)    RUN yum install -y -q "$@" ;;
        pacman) RUN pacman -S --noconfirm "$@" ;;
        brew)   brew install "$@" ;;
        *)      err "Gerenciador de pacotes não reconhecido. Instale manualmente: $*" ;;
    esac
}

echo ""
echo "${BLUE}══════════════════════════════════════════════${RESET}"
echo "${BLUE}     rahoot2 — Verificando dependências       ${RESET}"
echo "${BLUE}══════════════════════════════════════════════${RESET}"
echo ""

# ── curl ──────────────────────────────────────────────────────────────────
if ! command -v curl >/dev/null 2>&1; then
    info "curl não encontrado — instalando..."
    pkg_update && pkg_install curl
    ok "curl instalado"
else
    ok "curl $(curl --version | head -1 | awk '{print $2}')"
fi

# ── git ───────────────────────────────────────────────────────────────────
if ! command -v git >/dev/null 2>&1; then
    info "git não encontrado — instalando..."
    pkg_update && pkg_install git
    ok "git instalado"
else
    ok "git $(git --version | awk '{print $3}')"
fi

# ── Node.js ───────────────────────────────────────────────────────────────
install_node() {
    info "Instalando Node.js 22 via NodeSource..."
    case "$PKG_MGR" in
        apt)
            pkg_update && pkg_install ca-certificates gnupg
            curl -fsSL https://deb.nodesource.com/setup_22.x | RUN bash -
            pkg_install nodejs
            ;;
        dnf|yum)
            curl -fsSL https://rpm.nodesource.com/setup_22.x | RUN bash -
            pkg_install nodejs
            ;;
        pacman)
            pkg_install nodejs npm
            ;;
        brew)
            brew install node@22
            ;;
        *)
            err "Instale Node.js 22 manualmente: https://nodejs.org"
            ;;
    esac
}

if ! command -v node >/dev/null 2>&1; then
    info "Node.js não encontrado — instalando..."
    install_node
    ok "Node.js $(node --version) instalado"
else
    NODE_VER="$(node --version | tr -d 'v' | cut -d. -f1)"
    if [ "$NODE_VER" -lt 18 ]; then
        warn "Node.js $(node --version) — versão mínima é 18. Atualizando..."
        install_node
        ok "Node.js $(node --version) atualizado"
    else
        ok "Node.js $(node --version)"
    fi
fi

# ── Docker ────────────────────────────────────────────────────────────────
install_docker() {
    info "Instalando Docker via script oficial..."
    case "$PKG_MGR" in
        brew)
            warn "No macOS instale Docker Desktop: https://docs.docker.com/desktop/mac/"
            err "Docker Desktop necessário no macOS."
            ;;
        *)
            curl -fsSL https://get.docker.com | RUN sh
            RUN systemctl enable docker
            RUN systemctl start docker
            # Adiciona usuário atual ao grupo docker (sem root)
            if [ -n "$SUDO_USER" ]; then
                RUN usermod -aG docker "$SUDO_USER"
                warn "Usuário '$SUDO_USER' adicionado ao grupo docker. Faça logout/login para aplicar sem sudo."
            fi
            ;;
    esac
}

if ! command -v docker >/dev/null 2>&1; then
    info "Docker não encontrado — instalando..."
    install_docker
    ok "Docker $(docker --version | awk '{print $3}' | tr -d ',')"
else
    ok "Docker $(docker --version | awk '{print $3}' | tr -d ',')"
fi

# ── Docker Compose plugin ─────────────────────────────────────────────────
if ! docker compose version >/dev/null 2>&1; then
    info "Docker Compose plugin não encontrado — instalando..."
    case "$PKG_MGR" in
        apt)
            pkg_update && pkg_install docker-compose-plugin
            ;;
        dnf|yum)
            pkg_install docker-compose-plugin
            ;;
        *)
            # Instalação manual do binário
            COMPOSE_VER="$(curl -fsSL https://api.github.com/repos/docker/compose/releases/latest | grep '"tag_name"' | cut -d'"' -f4)"
            RUN curl -fsSL "https://github.com/docker/compose/releases/download/${COMPOSE_VER}/docker-compose-$(uname -s)-$(uname -m)" \
                -o /usr/local/lib/docker/cli-plugins/docker-compose
            RUN chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
            ;;
    esac
    docker compose version >/dev/null 2>&1 || err "Falha ao instalar docker compose plugin."
    ok "Docker Compose $(docker compose version --short)"
else
    ok "Docker Compose $(docker compose version --short)"
fi

echo ""
ok "Todas as dependências satisfeitas."
echo ""

# ══════════════════════════════════════════════════════════════════════════
# BLOCO 2 — CONFIGURAÇÃO DE HOST E PORTAS
# ══════════════════════════════════════════════════════════════════════════

echo "${BLUE}══════════════════════════════════════════════${RESET}"
echo "${BLUE}         rahoot2 — Assistente de Deploy       ${RESET}"
echo "${BLUE}══════════════════════════════════════════════${RESET}"
echo ""

detect_local_ip() {
    ip route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}' \
    || hostname -I 2>/dev/null | awk '{print $1}' \
    || echo "127.0.0.1"
}

TIPO=""
if [ $# -ge 1 ]; then
    HOST="$1"
    WEB_PORT="${2:-3003}"
    SOCKET_PORT="${3:-3002}"
    NGINX_PORT="80"
else
    LOCAL_IP="$(detect_local_ip)"

    echo "  Escolha o tipo de acesso:"
    echo "  ${CYAN}1)${RESET} IP local   (ex: ${LOCAL_IP}  — rede interna)"
    echo "  ${CYAN}2)${RESET} Domínio    (ex: rahoot.empresa.com  — acesso público)"
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
    ask "Porta nginx/web (acesso pelo navegador) [padrão: 80]:"
    read -r NGINX_PORT
    NGINX_PORT="${NGINX_PORT:-80}"

    ask "Porta socket (WebSocket, acesso direto dos clientes) [padrão: 3002]:"
    read -r SOCKET_PORT
    SOCKET_PORT="${SOCKET_PORT:-3002}"

    ask "Porta interna do container web no host [padrão: 3003]:"
    read -r WEB_PORT
    WEB_PORT="${WEB_PORT:-3003}"
fi

NGINX_PORT="${NGINX_PORT:-80}"
if [ "${NGINX_PORT}" = "80" ]; then
    WEB_ORIGIN="http://${HOST}"
else
    WEB_ORIGIN="http://${HOST}:${NGINX_PORT}"
fi
SOCKET_URL="http://${HOST}:${SOCKET_PORT}"

echo ""
log "Configuração final:"
log "  Host:            ${HOST}"
log "  Web (navegador): ${WEB_ORIGIN}"
log "  Socket:          ${SOCKET_URL}"
log "  Porta nginx:     ${NGINX_PORT}"
log "  Porta socket:    ${SOCKET_PORT}"
log "  Porta container: ${WEB_PORT}"
echo ""

# ══════════════════════════════════════════════════════════════════════════
# BLOCO 3 — SETUP DE DADOS, BUILD E START
# ══════════════════════════════════════════════════════════════════════════

mkdir -p "$DATA_DIR/quizz" "$DATA_DIR/avatars-3d" "$IMAGES_DIR"
ok "Diretórios de dados prontos"

if [ ! -f "$DATA_DIR/game.json" ] && [ -f "$SCRIPT_DIR/config/game.json" ]; then
    cp "$SCRIPT_DIR/config/game.json" "$DATA_DIR/game.json"
    ok "game.json padrão copiado"
fi
if [ -d "$SCRIPT_DIR/config/quizz" ] && [ -z "$(ls -A "$DATA_DIR/quizz" 2>/dev/null)" ]; then
    cp -r "$SCRIPT_DIR/config/quizz/." "$DATA_DIR/quizz/"
    ok "Quiz de exemplo copiado"
fi

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

cat > "$SCRIPT_DIR/nginx.conf" <<NGINXCONF
server {
    listen ${NGINX_PORT};
    server_name ${HOST};

    client_max_body_size 50M;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;

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
ok "══════════════════════════════════════════════"
ok "rahoot2 no ar!"
ok "  Acesso web:  ${WEB_ORIGIN}"
ok "  Socket:      ${SOCKET_URL}"
ok "  Logs:        docker compose logs -f"
ok "  Stop:        docker compose down"
ok "  Rollback:    ./rollback.sh list"
ok "══════════════════════════════════════════════"
if [ "$TIPO" = "2" ] 2>/dev/null || [[ "${HOST}" != 192.* && "${HOST}" != 10.* && "${HOST}" != 172.* && "${HOST}" != "localhost" ]]; then
    echo ""
    warn "Para HTTPS com domínio público:"
    warn "  apt install certbot python3-certbot-nginx"
    warn "  certbot --nginx -d ${HOST}"
fi
