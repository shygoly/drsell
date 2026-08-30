#!/usr/bin/env bash
# 为 cb_postgres 容器启用 TLS 并收窄 pg_hba（生产运维用）。
# 用法：在 wjclaw 上以 root 执行，或参考 docs/adp-pg-access.md 手工操作。
set -euo pipefail

CONTAINER="${PG_CONTAINER:-cb_postgres}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CERT_DIR="$ROOT/infra/docker/certs/pg"

if [[ ! -f "$CERT_DIR/server.crt" ]]; then
  bash "$ROOT/scripts/gen-certs.sh"
  mkdir -p "$CERT_DIR"
  cp "$ROOT/infra/docker/certs/server.crt" "$CERT_DIR/server.crt"
  cp "$ROOT/infra/docker/certs/server.key" "$CERT_DIR/server.key"
fi

echo "== 复制证书到容器 =="
docker cp "$CERT_DIR/server.crt" "$CONTAINER:/var/lib/postgresql/data/server.crt"
docker cp "$CERT_DIR/server.key" "$CONTAINER:/var/lib/postgresql/data/server.key"
docker exec -u postgres "$CONTAINER" chmod 600 /var/lib/postgresql/data/server.key
docker exec -u postgres "$CONTAINER" chmod 644 /var/lib/postgresql/data/server.crt

echo "== 开启 ssl =="
docker exec -u postgres "$CONTAINER" psql -U medusa -d postgres -v ON_ERROR_STOP=1 -c \
  "ALTER SYSTEM SET ssl = on;
   ALTER SYSTEM SET ssl_cert_file = 'server.crt';
   ALTER SYSTEM SET ssl_key_file = 'server.key';"

echo "== 重载配置 =="
docker exec -u postgres "$CONTAINER" psql -U medusa -d postgres -c "SELECT pg_reload_conf()"

echo ""
echo "证书已部署、ssl=on。pg_hba 收窄须按 docs/adp-pg-access.md 手工替换末行后 reload。"
echo "验证：psql \"\$DSN?sslmode=require\" -c 'show ssl'"
