#!/usr/bin/env bash
# Rahoot2 Rollback Tool
# Usage:
#   rollback.sh list                → list available backups
#   rollback.sh <tag>               → restore from backup tagged <tag>
#   rollback.sh <tag> --dry         → show what would happen, don't touch anything

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$ROOT/backups"
DRY=0

RED=$'\e[31m'; GREEN=$'\e[32m'; YELLOW=$'\e[33m'; BLUE=$'\e[34m'; RESET=$'\e[0m'
log()  { echo "${BLUE}[rollback]${RESET} $*"; }
warn() { echo "${YELLOW}[warn]${RESET} $*"; }
ok()   { echo "${GREEN}[ok]${RESET} $*"; }
err()  { echo "${RED}[err]${RESET} $*" >&2; }

usage() {
  cat <<EOF
Rahoot2 Rollback Tool

  $0 list              Lista backups disponíveis
  $0 <tag>             Restaura backup com essa tag
  $0 <tag> --dry       Dry run (mostra o que faria)
EOF
}

list_backups() {
  log "Backups em $BACKUP_DIR:"
  echo ""
  if [ ! -d "$BACKUP_DIR" ] || [ -z "$(ls -A "$BACKUP_DIR" 2>/dev/null)" ]; then
    warn "Nenhum backup encontrado."; return
  fi
  for f in "$BACKUP_DIR"/*.tar.gz; do
    [ -e "$f" ] || continue
    size=$(du -h "$f" | awk '{print $1}')
    date=$(date -r "$f" '+%Y-%m-%d %H:%M')
    name=$(basename "$f" .tar.gz)
    printf "  ${GREEN}%-40s${RESET}  %s  %s\n" "$name" "$size" "$date"
  done
  echo ""
  log "Imagens Docker de backup:"
  docker images --format "  {{.Repository}}:{{.Tag}}  {{.Size}}" 2>/dev/null | grep backup- || warn "Nenhuma imagem de backup"
}

find_backup() {
  local tag="$1"
  local match
  match=$(ls -t "$BACKUP_DIR"/${tag}*.tar.gz 2>/dev/null | head -1 || true)
  if [ -z "$match" ]; then
    err "Nenhum backup encontrado com tag '$tag'"; err "Rode: $0 list"; exit 1
  fi
  echo "$match"
}

find_docker_tag() {
  local tag="$1"
  docker images --format "{{.Repository}}:{{.Tag}}" 2>/dev/null | grep -iE "backup-${tag}" | head -1 || true
}

restore() {
  local tag="$1"
  local backup_file; backup_file=$(find_backup "$tag")
  local docker_tag;  docker_tag=$(find_docker_tag "$tag")

  log "═══════════════════════════════════════════════════"
  log "Restaurando: $tag  →  $backup_file ($(du -h "$backup_file" | awk '{print $1}'))"
  [ -n "$docker_tag" ] && log "Imagem Docker: $docker_tag" || warn "Sem imagem Docker correspondente"
  log "═══════════════════════════════════════════════════"

  if [ "$DRY" = "1" ]; then
    warn "DRY-RUN — nada será modificado"
    tar tzf "$backup_file" 2>&1 | head -20; echo "  ..."
    echo "  1) tar xzf $backup_file -C $ROOT"
    [ -n "$docker_tag" ] && echo "  2) docker tag $docker_tag rahoot2-rahoot2:latest"
    echo "  3) cd $SCRIPT_DIR && docker compose restart rahoot2"
    return
  fi

  log "ATENÇÃO: vai sobrescrever codigo-fonte e config"
  read -p "Confirmar? [y/N] " -n 1 -r; echo
  [[ $REPLY =~ ^[Yy]$ ]] || { warn "Abortado"; exit 0; }

  local pre="$BACKUP_DIR/pre-rollback-$(date +%Y%m%d-%H%M).tar.gz"
  log "Snapshot de segurança: $(basename "$pre")"
  tar czf "$pre" \
    --exclude='codigo-fonte/node_modules' --exclude='codigo-fonte/.pnpm-store' \
    --exclude='codigo-fonte/packages/*/node_modules' \
    --exclude='codigo-fonte/packages/*/.next' \
    --exclude='codigo-fonte/packages/*/dist' \
    -C "$ROOT" codigo-fonte config docker-compose.yml 2>/dev/null || true

  tar xzf "$backup_file" -C "$ROOT"
  ok "Arquivos restaurados"

  if [ -n "$docker_tag" ]; then
    docker tag "$docker_tag" rahoot2-rahoot2:latest
    ok "Imagem restaurada"
  fi

  cd "$SCRIPT_DIR" && docker compose restart rahoot2 2>&1 | tail -5
  ok "Rollback concluído. Snapshot salvo em: $pre"
}

if [ $# -lt 1 ]; then usage; exit 1; fi
case "$1" in
  list|ls|-l)   list_backups ;;
  -h|--help)    usage ;;
  *)
    TAG="$1"; shift
    [ $# -gt 0 ] && [ "$1" = "--dry" ] && DRY=1
    restore "$TAG"
    ;;
esac
