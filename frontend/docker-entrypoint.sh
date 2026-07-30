#!/bin/sh
set -e
export PORT="${PORT:-80}"
export BACKEND_HOST="${BACKEND_HOST:-backend-production-a841.up.railway.app}"
envsubst '${PORT} ${BACKEND_HOST}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'
