#!/usr/bin/env bash
# Drsell MVP: local build → rsync → pm2 on wjclaw (no remote Docker build)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${DEPLOY_HOST:-wjclaw}"
REMOTE="${REMOTE_DIR:-/opt/drsell-run}"

cd "$ROOT"

echo "==> Build packages + api + storefront"
pnpm --filter @drsell/shared build
pnpm --filter @drsell/shopify build
pnpm --filter @drsell/adp build
pnpm --filter @drsell/openclaw build
pnpm --filter @drsell/api exec prisma generate
pnpm --filter @drsell/api build

# shellcheck disable=SC1091
set -a
[[ -f apps/storefront/.env ]] && . apps/storefront/.env || true
export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-https://drsell.szchada.top/api}"
set +a
pnpm --filter @drsell/storefront build

echo "==> Prepare remote layout"
ssh "$HOST" "mkdir -p ${REMOTE}/apps/api ${REMOTE}/apps/storefront ${REMOTE}/packages/{shared,shopify,adp,openclaw} ${REMOTE}/node_modules"

# Sync runtime artifacts (not full monorepo node_modules)
rsync -az --delete \
  "$ROOT/apps/api/dist/" "${HOST}:${REMOTE}/apps/api/dist/"
rsync -az \
  "$ROOT/apps/api/package.json" "$ROOT/apps/api/prisma/" \
  "${HOST}:${REMOTE}/apps/api/"
rsync -az --delete "$ROOT/apps/api/prisma/" "${HOST}:${REMOTE}/apps/api/prisma/"

for pkg in shared shopify adp openclaw; do
  rsync -az "$ROOT/packages/$pkg/package.json" "${HOST}:${REMOTE}/packages/$pkg/package.json"
  rsync -az --delete "$ROOT/packages/$pkg/dist/" "${HOST}:${REMOTE}/packages/$pkg/dist/"
done

# Next standalone already bundles deps
rsync -az --delete "$ROOT/apps/storefront/.next/standalone/" "${HOST}:${REMOTE}/apps/storefront/standalone/"
mkdir -p "$ROOT/apps/storefront/.next/static"
rsync -az --delete "$ROOT/apps/storefront/.next/static/" "${HOST}:${REMOTE}/apps/storefront/standalone/apps/storefront/.next/static/"
rsync -az --delete "$ROOT/apps/storefront/public/" "${HOST}:${REMOTE}/apps/storefront/standalone/apps/storefront/public/" 2>/dev/null || true

# Env files
rsync -az "$ROOT/apps/api/.env" "${HOST}:${REMOTE}/apps/api/.env"
if [[ -f apps/storefront/.env ]]; then
  rsync -az "$ROOT/apps/storefront/.env" "${HOST}:${REMOTE}/apps/storefront/.env"
fi

# Workspace stubs for pnpm install of api deps only
rsync -az "$ROOT/package.json" "$ROOT/pnpm-workspace.yaml" "$ROOT/pnpm-lock.yaml" "${HOST}:${REMOTE}/"

echo "==> Install API prod deps on server + migrate + pm2"
ssh "$HOST" bash -s <<EOF
set -euo pipefail
cd ${REMOTE}

if grep -q 'postgres:5432' apps/api/.env; then
  sed -i 's|@postgres:5432|@127.0.0.1:5432|g' apps/api/.env
fi
grep -q '^PORT=' apps/api/.env && sed -i 's/^PORT=.*/PORT=5011/' apps/api/.env || echo 'PORT=5011' >> apps/api/.env
grep -q '^STOREFRONT_DEFAULT_SHOP=' apps/api/.env || echo 'STOREFRONT_DEFAULT_SHOP=' >> apps/api/.env

cd ${REMOTE}
corepack enable
corepack prepare pnpm@8.15.4 --activate
pnpm install --prod --filter @drsell/api... --frozen-lockfile || pnpm install --prod --filter @drsell/api...

cd apps/api
export DATABASE_URL=\$(grep '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"' | tr -d "'")
pnpm dlx prisma@6.9.0 migrate deploy

pm2 delete drsell-api 2>/dev/null || true
pm2 delete drsell-web 2>/dev/null || true
pm2 delete drsell-storefront 2>/dev/null || true
cd ${REMOTE}/apps/api
pm2 start dist/main.js --name drsell-api --env production
cd ${REMOTE}/apps/storefront/standalone/apps/storefront
PORT=5010 HOSTNAME=127.0.0.1 pm2 start server.js --name drsell-storefront
pm2 save
pm2 status
curl -sf http://127.0.0.1:5011/api/health && echo
curl -sf -o /dev/null -w "storefront:%{http_code}\n" http://127.0.0.1:5010/ || true
EOF

echo "==> Reload nginx vhost"
ssh "$HOST" 'docker exec webrtc-ws-proxy nginx -t && docker exec webrtc-ws-proxy nginx -s reload && echo nginx_ok'

echo "Done."
echo "App URL: https://drsell.szchada.top (storefront on :5010, api on :5011)"
