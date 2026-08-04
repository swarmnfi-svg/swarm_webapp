#!/usr/bin/env bash
# Hourly RPi -> Railway MySQL sync (full dump + optional restore).
# Run on Raspberry Pi. Requires: mysqldump, mysql client, gzip.
#
# Usage:
#   ./scripts/sync-to-railway.sh              # dump + restore
#   ./scripts/sync-to-railway.sh --dry-run    # show commands only
#   ./scripts/sync-to-railway.sh --dump-only  # backup locally, skip Railway restore
#
# Env: load from .env.rpi in repo root, or export variables manually.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${ENV_FILE:-${REPO_ROOT}/.env.rpi}"

DRY_RUN=false
DUMP_ONLY=false

usage() {
  cat <<'EOF'
sync-to-railway.sh — push primary MySQL snapshot to Railway standby

Options:
  --dry-run     Print actions without executing
  --dump-only   Create local gzip dump only (no Railway restore)
  -h, --help    Show this help

Required env (set in .env.rpi or environment):
  LOCAL_DB_HOST, LOCAL_DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
  RAILWAY_MYSQL_HOST, RAILWAY_MYSQL_PORT, RAILWAY_MYSQL_USER,
  RAILWAY_MYSQL_PASSWORD, RAILWAY_MYSQL_DATABASE
  SYNC_BACKUP_DIR (optional, default: ./data/backups)

Cron example (hourly):
  0 * * * * cd /home/pi/swarm_webapp && ./scripts/sync-to-railway.sh >> /var/log/swarm-sync.log 2>&1
EOF
}

log() {
  echo "[$(date -Iseconds)] $*"
}

run_cmd() {
  if [[ "${DRY_RUN}" == "true" ]]; then
    log "DRY-RUN: $*"
  else
    log "RUN: $*"
    eval "$@"
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true ;;
    --dump-only) DUMP_ONLY=true ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
  shift
done

if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "${ENV_FILE}"
  set +a
  log "Loaded ${ENV_FILE}"
fi

LOCAL_DB_HOST="${LOCAL_DB_HOST:-127.0.0.1}"
LOCAL_DB_PORT="${LOCAL_DB_PORT:-3306}"
DB_NAME="${DB_NAME:-biopower_db}"
DB_USER="${DB_USER:-biopower}"
SYNC_BACKUP_DIR="${SYNC_BACKUP_DIR:-${REPO_ROOT}/data/backups}"
TIMESTAMP="$(date +%Y%m%d%H%M)"
DUMP_FILE="${SYNC_BACKUP_DIR}/swarm-${TIMESTAMP}.sql.gz"

required_vars=(DB_PASSWORD)
if [[ "${DUMP_ONLY}" != "true" ]]; then
  required_vars+=(RAILWAY_MYSQL_HOST RAILWAY_MYSQL_PASSWORD RAILWAY_MYSQL_DATABASE)
fi

for var in "${required_vars[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    echo "Missing required variable: ${var}" >&2
    exit 1
  fi
done

mkdir -p "${SYNC_BACKUP_DIR}"

log "Dumping ${DB_NAME} from ${LOCAL_DB_HOST}:${LOCAL_DB_PORT}"
if [[ "${DRY_RUN}" == "true" ]]; then
  log "DRY-RUN: mysqldump ... | gzip > ${DUMP_FILE}"
else
  mysqldump \
    --host="${LOCAL_DB_HOST}" \
    --port="${LOCAL_DB_PORT}" \
    --user="${DB_USER}" \
    --password="${DB_PASSWORD}" \
    --single-transaction \
    --routines \
    --triggers \
    "${DB_NAME}" | gzip > "${DUMP_FILE}"
  log "Dump written: ${DUMP_FILE} ($(du -h "${DUMP_FILE}" | cut -f1))"
fi

if [[ "${DUMP_ONLY}" == "true" ]]; then
  log "Dump-only mode; skipping Railway restore"
  exit 0
fi

RAILWAY_MYSQL_PORT="${RAILWAY_MYSQL_PORT:-3306}"
RAILWAY_MYSQL_USER="${RAILWAY_MYSQL_USER:-root}"

log "Restoring to Railway MySQL ${RAILWAY_MYSQL_HOST}:${RAILWAY_MYSQL_PORT}/${RAILWAY_MYSQL_DATABASE}"
if [[ "${DRY_RUN}" == "true" ]]; then
  log "DRY-RUN: gunzip -c ${DUMP_FILE} | mysql ... ${RAILWAY_MYSQL_DATABASE}"
else
  gunzip -c "${DUMP_FILE}" | mysql \
    --host="${RAILWAY_MYSQL_HOST}" \
    --port="${RAILWAY_MYSQL_PORT}" \
    --user="${RAILWAY_MYSQL_USER}" \
    --password="${RAILWAY_MYSQL_PASSWORD}" \
    "${RAILWAY_MYSQL_DATABASE}"
  log "Railway restore complete"
fi

# Keep last 48 hourly dumps (~2 days)
if [[ "${DRY_RUN}" != "true" ]]; then
  find "${SYNC_BACKUP_DIR}" -name 'swarm-*.sql.gz' -type f | sort -r | tail -n +49 | xargs -r rm -f
  log "Pruned old backups (keeping latest 48)"
fi

log "Sync finished"
