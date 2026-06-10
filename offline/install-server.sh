#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# rahoot — Server installer (100% offline)
#
# Deploys the platform on a fresh Linux server using only the contents of
# this repository: dependencies, Docker images, 3D avatars, nginx, LDAP
# and admin credentials — with no game data (clean install).
#
# Usage (from the repository root):
#   sudo ./offline/install-server.sh
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BASE_DIR="$(dirname "$REPO_DIR")"     # config/ and images/ live next to the repo
DATA_DIR="$BASE_DIR/config"
IMAGES_DIR="$BASE_DIR/images"

GREEN=$'\e[32m'; BLUE=$'\e[34m'; YELLOW=$'\e[33m'; RED=$'\e[31m'; CYAN=$'\e[36m'; RESET=$'\e[0m'
log()  { echo "${BLUE}[install]${RESET} $*"; }
ok()   { echo "${GREEN}[ok]${RESET} $*"; }
warn() { echo "${YELLOW}[warn]${RESET} $*"; }
err()  { echo "${RED}[error]${RESET} $*" >&2; exit 1; }
ask()  { echo -n "${CYAN}[?]${RESET} $* "; }

[ "$(id -u)" = "0" ] || err "Run as root (sudo)."

echo ""
echo "${BLUE}══════════════════════════════════════════════════${RESET}"
echo "${BLUE}        rahoot — Offline server installer          ${RESET}"
echo "${BLUE}══════════════════════════════════════════════════${RESET}"
echo ""

# ══════════════════════════════════════════════════════════════════════════
# 1. SYSTEM DEPENDENCIES
# ══════════════════════════════════════════════════════════════════════════
command -v docker >/dev/null 2>&1 \
    || err "Docker not found. Install it from your internal mirror (e.g. apt install docker.io docker-compose-plugin) and run again."
docker compose version >/dev/null 2>&1 \
    || err "docker compose plugin not found. Install docker-compose-plugin and run again."
systemctl is-active --quiet docker || { systemctl start docker; ok "Docker started"; }
ok "Docker $(docker --version | awk '{print $3}' | tr -d ',') + Compose $(docker compose version --short)"

# System updates — optional, only if an internal mirror is reachable
ask "Run system updates (apt update/upgrade)? Requires a reachable mirror [y/N]:"
read -r DO_UPDATE
if [ "${DO_UPDATE,,}" = "y" ]; then
    if apt-get update -qq 2>/dev/null && apt-get upgrade -y -qq 2>/dev/null; then
        ok "System updated"
    else
        warn "Update failed (no reachable mirror?) — continuing without updating"
    fi
fi

# ══════════════════════════════════════════════════════════════════════════
# 2. CONFIGURATION — FQDN, PORTS, LDAP, ADMIN
# ══════════════════════════════════════════════════════════════════════════
echo ""
log "── Server identity ─────────────────────────────────"
ask "Public FQDN of the platform (e.g. rahoot.company.cn):"
read -r FQDN
[ -n "$FQDN" ] || err "FQDN is required."

ask "Set the system hostname to ${FQDN}? [y/N]:"
read -r SET_HOST
if [ "${SET_HOST,,}" = "y" ]; then
    hostnamectl set-hostname "$FQDN" 2>/dev/null && ok "hostname set" \
        || warn "could not set the hostname"
fi

ask "Web/nginx port [default: 80]:"
read -r NGINX_PORT; NGINX_PORT="${NGINX_PORT:-80}"
ask "Socket port (WebSocket) [default: 3002]:"
read -r SOCKET_PORT; SOCKET_PORT="${SOCKET_PORT:-3002}"
ask "Web container port on the host [default: 3003]:"
read -r WEB_PORT; WEB_PORT="${WEB_PORT:-3003}"
ask "Timezone [default: Asia/Shanghai]:"
read -r TZ_VAL; TZ_VAL="${TZ_VAL:-Asia/Shanghai}"

if [ "$NGINX_PORT" = "80" ]; then WEB_ORIGIN="http://${FQDN}"; else WEB_ORIGIN="http://${FQDN}:${NGINX_PORT}"; fi
SOCKET_URL="http://${FQDN}:${SOCKET_PORT}"

echo ""
log "── LDAP / Active Directory authentication ──────────"
ask "LDAP URL (e.g. ldap://10.0.0.5:389) — empty to skip:"
read -r LDAP_URL
LDAP_DOMAIN=""; LDAP_SEARCH_BASE=""; LDAP_SERVICE_USER=""; LDAP_SERVICE_PASS=""
if [ -n "$LDAP_URL" ]; then
    ask "LDAP domain (e.g. company.local):";          read -r LDAP_DOMAIN
    ask "Search base (e.g. DC=company,DC=local):";    read -r LDAP_SEARCH_BASE
    ask "Service account user (optional, Enter skips):"; read -r LDAP_SERVICE_USER
    if [ -n "$LDAP_SERVICE_USER" ]; then
        ask "Service account password:"
        read -rs LDAP_SERVICE_PASS; echo ""
    fi
fi

echo ""
log "── Admin access (new) ──────────────────────────────"
ask "Admin/manager password (Enter generates a random one):"
read -rs MANAGER_PASS; echo ""
if [ -z "$MANAGER_PASS" ]; then
    MANAGER_PASS="$(tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 16)"
    warn "Generated password: ${MANAGER_PASS}  — write it down now, it will not be shown again."
fi

echo ""
log "Summary:"
log "  Web:     ${WEB_ORIGIN}"
log "  Socket:  ${SOCKET_URL}"
log "  LDAP:    ${LDAP_URL:-disabled}"
log "  TZ:      ${TZ_VAL}"
ask "Confirm and install? [Y/n]:"
read -r CONFIRM
[ "${CONFIRM,,}" = "n" ] && err "Cancelled."

# ══════════════════════════════════════════════════════════════════════════
# 3. OFFLINE DEPENDENCIES (pnpm store + Docker images)
# ══════════════════════════════════════════════════════════════════════════
echo ""
log "Extracting offline dependencies..."
"$REPO_DIR/offline/prepare.sh"

# ══════════════════════════════════════════════════════════════════════════
# 4. CLEAN DATA — config/, 3D avatars, no game data at all
# ══════════════════════════════════════════════════════════════════════════
echo ""
if [ -f "$DATA_DIR/rahoot.db" ]; then
    warn "Existing game database found at $DATA_DIR/rahoot.db."
    ask "Delete it and start from scratch? [y/N]:"
    read -r WIPE
    if [ "${WIPE,,}" = "y" ]; then rm -f "$DATA_DIR/rahoot.db"; ok "database removed"; else warn "database kept"; fi
fi

mkdir -p "$DATA_DIR/quizz" "$IMAGES_DIR"

# game.json with the NEW admin password
cat > "$DATA_DIR/game.json" <<EOF
{
  "managerPassword": "${MANAGER_PASS}"
}
EOF
ok "game.json created with the new admin password"

# Example quiz (only if the folder is empty)
if [ -z "$(ls -A "$DATA_DIR/quizz" 2>/dev/null)" ] && [ -d "$REPO_DIR/config/quizz" ]; then
    cp -r "$REPO_DIR/config/quizz/." "$DATA_DIR/quizz/"
    ok "example quiz copied"
fi

# 3D avatars, icons and animations — extracted from the repository package
if [ ! -f "$DATA_DIR/avatars-3d/catalog.json" ]; then
    if ls "$REPO_DIR"/offline/assets/avatars-3d.tar.gz.part-* >/dev/null 2>&1; then
        log "Extracting 3D avatars (~590MB)..."
        cat "$REPO_DIR"/offline/assets/avatars-3d.tar.gz.part-* | tar -xzf - -C "$DATA_DIR"
        ok "3D avatars extracted to $DATA_DIR/avatars-3d/"
    else
        warn "Avatar package not found in offline/assets/ — 3D avatars unavailable"
    fi
else
    ok "3D avatars already present — skipping extraction"
fi

# ══════════════════════════════════════════════════════════════════════════
# 5. .ENV AND NGINX (generated locally — never committed)
# ══════════════════════════════════════════════════════════════════════════
cat > "$REPO_DIR/.env" <<EOF
WEB_ORIGIN=${WEB_ORIGIN}
SOCKET_URL=${SOCKET_URL}
TZ=${TZ_VAL}
WEB_PORT=${WEB_PORT}
SOCKET_PORT=${SOCKET_PORT}
NGINX_PORT=${NGINX_PORT}
LDAP_URL=${LDAP_URL}
LDAP_DOMAIN=${LDAP_DOMAIN}
LDAP_SEARCH_BASE=${LDAP_SEARCH_BASE}
LDAP_SERVICE_USER=${LDAP_SERVICE_USER}
LDAP_SERVICE_PASS=${LDAP_SERVICE_PASS}
EOF
chmod 600 "$REPO_DIR/.env"
ok ".env generated (mode 600 — never committed)"

cat > "$REPO_DIR/nginx.conf" <<NGINXCONF
server {
    listen 80;
    server_name ${FQDN};

    client_max_body_size 50M;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;

    # Next.js static assets — aggressive caching
    location /_next/static/ {
        proxy_pass http://rahoot2:3000;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

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
ok "nginx.conf generated for ${FQDN}"

# ══════════════════════════════════════════════════════════════════════════
# 6. BUILD (100% OFFLINE) AND START
# ══════════════════════════════════════════════════════════════════════════
echo ""
log "Docker build (offline — using the vendored store)..."
cd "$REPO_DIR"
docker compose build
docker compose up -d

echo ""
ok "══════════════════════════════════════════════════"
ok " Platform is up — clean install finished"
ok "   Web access:    ${WEB_ORIGIN}"
ok "   Socket:        ${SOCKET_URL}"
ok "   Admin panel:   ${WEB_ORIGIN}/manager"
ok "   Logs:          docker compose logs -f"
ok "══════════════════════════════════════════════════"
warn "Store the admin password somewhere safe."
