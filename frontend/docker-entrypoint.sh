#!/bin/sh
set -e
export PORT="${PORT:-80}"
export API_PROXY_URL="${API_PROXY_URL:-https://backend-production-a841.up.railway.app/api/}"
envsubst '${PORT} ${API_PROXY_URL}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'
