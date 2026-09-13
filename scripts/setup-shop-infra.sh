#!/usr/bin/env bash
# 为 DTC 独立站（Medusa 引擎，openspec change dtc-store-medusa）在 wjclaw 供置基建。
#
# 幂等。要点：
# - wjclaw 的 PG（cb_postgres_5433）是共享的，已有别的项目（medusa 超管 + medusa_db）。
#   本店用 drsell 命名空间隔离：数据库 drsell_shop、角色 drsell_shop_app（NOSUPERUSER）。
# - Redis 已在 127.0.0.1:6379 运行（db0 在用）；本店用 db2 + 键前缀 drsellshop:。
# - 角色密码在服务器现场随机生成，仅写入 root-only 的 /root/drsell-shop/shop.env，
#   不入库、不回显。
#
# 用超管角色经容器 socket（trust）执行 DDL——不需要在别处保存超管密码。
set -euo pipefail

PGC="${PG_CONTAINER:-cb_postgres_5433}"
PGPORT="${PG_INNER_PORT:-5433}"
SUPER="${PG_SUPERUSER:-medusa}"   # 本机 cb_postgres 的簇超管角色名（见 pg_roles）
DB="drsell_shop"
ROLE="drsell_shop_app"
ENVDIR="/root/drsell-shop"
ENVFILE="$ENVDIR/shop.env"

psql_super() { docker exec -i "$PGC" psql -U "$SUPER" -p "$PGPORT" -d postgres -v ON_ERROR_STOP=1 "$@"; }

PW="$(openssl rand -hex 24)"

# 角色（幂等）
if [ "$(psql_super -tAc "select 1 from pg_roles where rolname='$ROLE'")" = "1" ]; then
  psql_super -c "ALTER ROLE $ROLE LOGIN PASSWORD '$PW'"
  echo "role $ROLE: password rotated"
else
  psql_super -c "CREATE ROLE $ROLE LOGIN PASSWORD '$PW' NOSUPERUSER NOCREATEROLE NOCREATEDB"
  echo "role $ROLE: created"
fi

# 数据库（幂等）
if [ "$(psql_super -tAc "select 1 from pg_database where datname='$DB'")" = "1" ]; then
  echo "database $DB: already exists"
else
  psql_super -c "CREATE DATABASE $DB OWNER $ROLE"
  echo "database $DB: created (owner $ROLE)"
fi

# 凭据落地（root-only，不入库）
mkdir -p "$ENVDIR"
umask 077
cat > "$ENVFILE" <<ENV
# Medusa (drsell DTC 独立站) 基建凭据 —— 生成于 $(date -u +%FT%TZ)。勿入库、勿外传。
DATABASE_URL=postgres://$ROLE:$PW@127.0.0.1:5433/$DB
REDIS_URL=redis://127.0.0.1:6379/2
EVENTS_REDIS_URL=redis://127.0.0.1:6379/2
CACHE_REDIS_URL=redis://127.0.0.1:6379/2
REDIS_PREFIX=drsellshop:
ENV
chmod 600 "$ENVFILE"
echo "creds -> $ENVFILE (perm $(stat -c %a "$ENVFILE"))"

# 连通性自检（TCP + 密码，模拟 Medusa 的连接路径），密码不回显
if docker exec -e PGPASSWORD="$PW" "$PGC" psql -h 127.0.0.1 -p "$PGPORT" -U "$ROLE" -d "$DB" -tAc "select 'conn-ok'" | grep -q conn-ok; then
  echo "tcp+password connectivity: OK"
else
  echo "tcp+password connectivity: FAILED — 检查 pg_hba（cb_postgres 曾收窄，可能需为 $ROLE 放行 127.0.0.1）" >&2
  exit 1
fi
