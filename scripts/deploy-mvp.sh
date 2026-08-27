#!/usr/bin/env bash
# Drsell MVP: local build → rsync → pm2 on wjclaw (no remote Docker build)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${DEPLOY_HOST:-wjclaw}"
REMOTE="${REMOTE_DIR:-/opt/drsell-run}"

cd "$ROOT"

echo "==> Build packages + api + web"
pnpm --filter @drsell/shared build
pnpm --filter @drsell/shopify build
pnpm --filter @drsell/adp build
pnpm --filter @drsell/api exec prisma generate
pnpm --filter @drsell/api build
# shellcheck disable=SC1091
set -a
# load keys for next build if present
[[ -f apps/web/.env ]] && . apps/web/.env || true
set +a
pnpm --filter @drsell/web build

echo "==> Prepare remote layout"
ssh "$HOST" "mkdir -p ${REMOTE}/apps/api ${REMOTE}/apps/web ${REMOTE}/packages/{shared,shopify,adp} ${REMOTE}/node_modules"

# Sync runtime artifacts (not full monorepo node_modules)
rsync -az --delete \
  "$ROOT/apps/api/dist/" "${HOST}:${REMOTE}/apps/api/dist/"
rsync -az \
  "$ROOT/apps/api/package.json" "$ROOT/apps/api/prisma/" \
  "${HOST}:${REMOTE}/apps/api/"
# prisma needs schema at apps/api/prisma
rsync -az --delete "$ROOT/apps/api/prisma/" "${HOST}:${REMOTE}/apps/api/prisma/"

for pkg in shared shopify adp; do
  rsync -az "$ROOT/packages/$pkg/package.json" "${HOST}:${REMOTE}/packages/$pkg/package.json"
  rsync -az --delete "$ROOT/packages/$pkg/dist/" "${HOST}:${REMOTE}/packages/$pkg/dist/"
done

# Next standalone already bundles deps
rsync -az --delete "$ROOT/apps/web/.next/standalone/" "${HOST}:${REMOTE}/apps/web/standalone/"
mkdir -p "$ROOT/apps/web/.next/static"
rsync -az --delete "$ROOT/apps/web/.next/static/" "${HOST}:${REMOTE}/apps/web/standalone/apps/web/.next/static/"
rsync -az --delete "$ROOT/apps/web/public/" "${HOST}:${REMOTE}/apps/web/standalone/apps/web/public/" 2>/dev/null || true

# Env files
rsync -az "$ROOT/apps/api/.env" "${HOST}:${REMOTE}/apps/api/.env"
rsync -az "$ROOT/apps/web/.env" "${HOST}:${REMOTE}/apps/web/.env"

# Workspace stubs for pnpm install of api deps only
rsync -az "$ROOT/package.json" "$ROOT/pnpm-workspace.yaml" "$ROOT/pnpm-lock.yaml" "${HOST}:${REMOTE}/"

echo "==> Install API prod deps on server + migrate + pm2"
ssh "$HOST" bash -s <<EOF
set -euo pipefail
cd ${REMOTE}

# Point DATABASE_URL at host-mapped postgres (cb_postgres :5432)
# Override docker hostname if present
if grep -q 'postgres:5432' apps/api/.env; then
  sed -i 's|@postgres:5432|@127.0.0.1:5432|g' apps/api/.env
fi
# Ensure API listens on 5011
grep -q '^PORT=' apps/api/.env && sed -i 's/^PORT=.*/PORT=5011/' apps/api/.env || echo 'PORT=5011' >> apps/api/.env

# Rewrite workspace deps so pnpm can install on server
cd ${REMOTE}
corepack enable
corepack prepare pnpm@8.15.4 --activate
pnpm install --prod --filter @drsell/api... --frozen-lockfile || pnpm install --prod --filter @drsell/api...

cd apps/api
export \$(grep -v '^#' .env | xargs)
pnpm exec prisma migrate deploy || pnpm exec prisma db push --accept-data-loss

# pm2
pm2 delete drsell-api 2>/dev/null || true
pm2 delete drsell-web 2>/dev/null || true
cd ${REMOTE}/apps/api
pm2 start dist/main.js --name drsell-api --env production
cd ${REMOTE}/apps/web/standalone/apps/web
PORT=5010 HOSTNAME=127.0.0.1 pm2 start server.js --name drsell-web
pm2 save
pm2 status
curl -sf http://127.0.0.1:5011/api/health && echo
curl -sf -o /dev/null -w "web:%{http_code}\n" http://127.0.0.1:5010/ || true
EOF

echo "==> Reload nginx vhost"
ssh "$HOST" 'docker exec webrtc-ws-proxy nginx -t && docker exec webrtc-ws-proxy nginx -s reload && echo nginx_ok'

echo "Done."
echo "App URL should be https://drsell.szchada.top (set Cloudflare A → 163.7.7.160 orange cloud)"
