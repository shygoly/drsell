#!/usr/bin/env bash
# Deploy Drsell stack to wjclaw over SSH
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${DEPLOY_HOST:-wjclaw}"
REMOTE_DIR="${REMOTE_DIR:-/opt/drsell}"

bash "$ROOT/scripts/gen-certs.sh"

rsync -az --delete \
  --exclude node_modules \
  --exclude .next \
  --exclude dist \
  --exclude .git \
  --exclude chatbot \
  --exclude chatbotapi \
  --exclude chatbotadmin \
  "$ROOT/" "${HOST}:${REMOTE_DIR}/"

ssh "$HOST" bash -s <<EOF
set -euo pipefail
cd ${REMOTE_DIR}
# Harden: close public 5432/65432 if previously opened
if command -v ufw >/dev/null 2>&1; then
  ufw deny 5432/tcp || true
  ufw deny 65432/tcp || true
  ufw allow 80/tcp || true
  ufw allow 443/tcp || true
fi
# Stop publishing host postgres if docker published it
docker rm -f cb_postgres_public_map 2>/dev/null || true
mkdir -p infra/docker
cd infra/docker
docker compose pull || true
docker compose build
docker compose up -d
# Ensure no 65432 publish
docker compose ps
EOF

echo "Deployed to ${HOST}:${REMOTE_DIR}"
echo "PG public: wjclawpg.szchada.com:443 (SNI) sslmode=require"
echo "App: https://drsell.szchada.top"
