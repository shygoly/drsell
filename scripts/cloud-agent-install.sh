#!/usr/bin/env bash
# Cloud Agent install: idempotent repository setup for the Drsell monorepo.
# Runs after the repo is checked out. Safe to run repeatedly.
set -euo pipefail
cd "$(dirname "$0")/.."

# 1) System services (normally already present from the base snapshot; guard for
#    a fresh base image so the script is self-contained).
if ! command -v psql >/dev/null 2>&1 || ! command -v redis-server >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    postgresql postgresql-contrib redis-server
fi

# 2) Node dependencies (pinned pnpm + frozen lockfile).
pnpm install --frozen-lockfile

# 3) Build the shared packages that the apps import.
pnpm --filter @drsell/shared build
pnpm --filter @drsell/adp build
pnpm --filter @drsell/shopify build
pnpm --filter @drsell/openclaw build

# 4) Prisma client.
pnpm db:generate

# 5) Local env files (never committed; created from the tracked examples).
[ -f apps/api/.env ] || cp apps/api/.env.example apps/api/.env
[ -f apps/web/.env ] || cp apps/web/.env.example apps/web/.env

# 6) Bring up PostgreSQL so we can provision the role/db and run migrations.
sudo pg_ctlcluster 16 main start 2>/dev/null || true
for _ in $(seq 1 30); do
  pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1 && break
  sleep 1
done

# 7) Provision role + database from the DATABASE_URL in apps/api/.env
#    (no secrets hardcoded here — read from the uncommitted env file).
read -r DB_USER DB_PASS DB_NAME < <(python3 - "$(grep -E '^DATABASE_URL=' apps/api/.env | head -1 | cut -d= -f2- | tr -d '"')" <<'PY'
import sys, urllib.parse as u
p = u.urlparse(sys.argv[1])
print(u.unquote(p.username or ""), u.unquote(p.password or ""), (p.path or "").lstrip("/").split("?")[0])
PY
)

sudo -u postgres psql -v ON_ERROR_STOP=1 \
  -v usr="$DB_USER" -v pwd="$DB_PASS" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'usr', :'pwd')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'usr')
\gexec
SQL

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"
fi

# 8) Apply migrations.
pnpm db:migrate

echo "cloud-agent-install: done"
