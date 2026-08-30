#!/usr/bin/env bash
# 创建 adp_reader 角色并应用 adp-reader.sql。
# 用法：ADMIN_DSN=... ADP_READER_PASSWORD=... bash scripts/setup-adp-reader.sh
set -euo pipefail

: "${ADMIN_DSN:?需要 ADMIN_DSN（须具备 CREATEROLE，生产上为 medusa）}"
: "${ADP_READER_PASSWORD:?需要 ADP_READER_PASSWORD}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

exists="$(psql "$ADMIN_DSN" -tAc "select 1 from pg_roles where rolname='adp_reader'")"
if [ -z "$exists" ]; then
  psql "$ADMIN_DSN" -v ON_ERROR_STOP=1 -v pw="$ADP_READER_PASSWORD" <<'SQL'
CREATE ROLE adp_reader LOGIN PASSWORD :'pw' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
SQL
  echo "已创建角色 adp_reader"
else
  psql "$ADMIN_DSN" -v ON_ERROR_STOP=1 -v pw="$ADP_READER_PASSWORD" <<'SQL'
ALTER ROLE adp_reader LOGIN PASSWORD :'pw' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
SQL
  echo "已更新角色 adp_reader 密码与属性"
fi

psql "$ADMIN_DSN" -v ON_ERROR_STOP=1 -f "$ROOT/apps/api/prisma/sql/adp-reader.sql"
echo "adp-reader.sql 应用完成"
