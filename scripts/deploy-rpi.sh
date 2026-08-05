#!/usr/bin/env bash
# Pull latest swarm_webapp from GitHub and rebuild the Pi Docker stack.
# Usage:
#   ./scripts/deploy-rpi.sh              # pull + rebuild if changed
#   ./scripts/deploy-rpi.sh --force      # rebuild even if no git changes
#   ./scripts/deploy-rpi.sh --pull-only  # git pull only, no docker
#
# Optional cron (check every 10 min):
#   */10 * * * * cd /home/swarm/swarm_webapp && ./scripts/deploy-rpi.sh >> /var/log/swarm-deploy.log 2>&1

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

REMOTE="${SWARM_GIT_REMOTE:-swarm}"
BRANCH="${SWARM_GIT_BRANCH:-main}"
COMPOSE_FILE="${SWARM_COMPOSE_FILE:-docker-compose.rpi.yml}"
ENV_FILE="${SWARM_ENV_FILE:-.env.rpi}"
FORCE=false
PULL_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --force) FORCE=true ;;
    --pull-only) PULL_ONLY=true ;;
  esac
done

log() { echo "[$(date -Iseconds)] $*"; }

if ! git remote get-url "$REMOTE" &>/dev/null; then
  log "ERROR: git remote '$REMOTE' not found. Add it:"
  log "  git remote add swarm https://github.com/swarmnfi-svg/swarm_webapp.git"
  exit 1
fi

BEFORE="$(git rev-parse HEAD)"
git fetch "$REMOTE" "$BRANCH"
git checkout "$BRANCH" 2>/dev/null || git checkout -b "$BRANCH" "$REMOTE/$BRANCH"
git pull --ff-only "$REMOTE" "$BRANCH"
AFTER="$(git rev-parse HEAD)"

if [[ "$BEFORE" == "$AFTER" && "$FORCE" != true ]]; then
  log "No new commits on $REMOTE/$BRANCH — skipping docker rebuild."
  exit 0
fi

log "Updated $BEFORE -> $AFTER"

if [[ "$PULL_ONLY" == true ]]; then
  log "Pull-only mode — done."
  exit 0
fi

if [[ ! -f "$COMPOSE_FILE" ]]; then
  log "ERROR: $COMPOSE_FILE not found"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  log "ERROR: $ENV_FILE missing — copy from .env.rpi.example and set JWT_SECRET, SWARM_PUBLIC_API_URL, VITE_API_URL."
  exit 1
fi

log "Rebuilding containers ($COMPOSE_FILE) with $ENV_FILE..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build --pull
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

log "Deploy complete. Health:"
curl -sf "http://localhost:${BACKEND_HOST_PORT:-8080}/api/health" || log "WARN: backend health check failed"
