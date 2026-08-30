#!/usr/bin/env bash
# 起本地 PG，镜像 wjclaw 的权限结构：medusa=超级用户，drsell_app=非超级用户且无 CREATEROLE。
set -euo pipefail

NAME="${PG_CONTAINER:-drsell-pg-test}"
PORT="${PG_PORT:-55433}"
ADMIN_PW="${PG_ADMIN_PASSWORD:-devadmin}"
APP_PW="${PG_APP_PASSWORD:-devapp}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CERT_DIR="$ROOT/infra/docker/certs/pg"

# PG TLS 证书（自签，供本地 ssl 验证）
if [[ ! -f "$CERT_DIR/server.crt" ]]; then
  mkdir -p "$CERT_DIR"
  openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
    -keyout "$CERT_DIR/server.key" \
    -out "$CERT_DIR/server.crt" \
    -subj "/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" 2>/dev/null
  chmod 600 "$CERT_DIR/server.key"
fi

if [ -n "$(docker ps -aq -f name="^${NAME}$")" ]; then
  echo "容器 ${NAME} 已存在，先删除以保证干净起点"
  docker rm -f "$NAME" >/dev/null
fi

docker run -d --name "$NAME" \
  -e POSTGRES_USER=medusa \
  -e POSTGRES_PASSWORD="$ADMIN_PW" \
  -e POSTGRES_DB=postgres \
  -p "${PORT}:5432" \
  -v "$CERT_DIR:/certs:ro" \
  postgres:16-alpine \
  -c ssl=on \
  -c ssl_cert_file=/certs/server.crt \
  -c ssl_key_file=/certs/server.key \
  >/dev/null

echo -n "等待 PG 就绪"
for _ in $(seq 1 30); do
  if docker exec "$NAME" pg_isready -U medusa -d postgres >/dev/null 2>&1; then break; fi
  echo -n "."; sleep 1
done
echo

ADMIN="postgres://medusa:${ADMIN_PW}@127.0.0.1:${PORT}/postgres?sslmode=disable"
psql "$ADMIN" -v ON_ERROR_STOP=1 -v pw="$APP_PW" <<'SQL'
CREATE ROLE drsell_app LOGIN PASSWORD :'pw' NOSUPERUSER NOCREATEROLE CREATEDB;
SQL
psql "$ADMIN" -v ON_ERROR_STOP=1 -c 'CREATE DATABASE drsell OWNER drsell_app'

APP_DSN="postgres://drsell_app:${APP_PW}@127.0.0.1:${PORT}/drsell?sslmode=disable"
echo "应用 Prisma schema..."
( cd "$ROOT" && DATABASE_URL="$APP_DSN" pnpm --filter @drsell/api exec prisma db push --skip-generate )

echo "灌入测试种子..."
psql "$APP_DSN" -v ON_ERROR_STOP=1 -f "$ROOT/apps/api/prisma/sql/seed-adp-test.sql"

cat <<EOF

本地环境就绪：
  ADMIN_DSN=postgres://medusa:${ADMIN_PW}@127.0.0.1:${PORT}/drsell?sslmode=disable
  APP_DSN=${APP_DSN}
  SSL_DSN=postgres://drsell_app:${APP_PW}@127.0.0.1:${PORT}/drsell?sslmode=require
  PG_SSL_CERT=${CERT_DIR}/server.crt
EOF
