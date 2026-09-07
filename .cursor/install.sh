#!/usr/bin/env bash
# Idempotent Cloud Agent bootstrap for the Drsell monorepo.
# Installs system services (PostgreSQL + Redis), workspace deps, builds the
# shared packages, prepares local .env files, and applies DB migrations.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

DB_USER="drsell_app"
DB_PASS='Dr$7gK_m9Qx!vR2p#Lw8nTz@Y4uH'
DB_NAME="drsell"

echo "==> Installing system packages (PostgreSQL, Redis)"
if ! command -v psql >/dev/null 2>&1 || ! command -v redis-server >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    postgresql postgresql-contrib redis-server
fi

echo "==> Starting PostgreSQL + Redis (needed for migrations)"
bash "$REPO_ROOT/.cursor/start.sh"

echo "==> Provisioning database role + database"
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}';
  END IF;
END\$\$;
SQL
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" \
  | grep -q 1 || sudo -u postgres createdb -O "${DB_USER}" "${DB_NAME}"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};" >/dev/null

echo "==> Preparing .env files (from examples, only if missing)"
[ -f apps/api/.env ] || cp apps/api/.env.example apps/api/.env
[ -f apps/web/.env ] || cp apps/web/.env.example apps/web/.env

echo "==> Installing workspace dependencies"
corepack enable >/dev/null 2>&1 || true
pnpm install --frozen-lockfile

echo "==> Building shared packages"
pnpm --filter @drsell/shared build
pnpm --filter @drsell/adp build
pnpm --filter @drsell/shopify build
pnpm --filter @drsell/openclaw build

echo "==> Prisma generate + migrate"
pnpm --filter @drsell/api exec prisma generate
pnpm --filter @drsell/api exec prisma migrate deploy

echo "==> Install complete."
