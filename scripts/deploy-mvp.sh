#!/usr/bin/env bash
# Drsell MVP: local build → rsync → pm2 on wjclaw (no remote Docker build)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${DEPLOY_HOST:-wjclaw}"
REMOTE="${REMOTE_DIR:-/opt/drsell-run}"
NGINX_CONF_DIR="${NGINX_CONF_DIR:-/opt/webrtc-ws-proxy/conf.d}"

cd "$ROOT"

echo "==> Build packages + prisma generate (sequential — apps 依赖 packages 的 dist)"
pnpm --filter @drsell/shared build
pnpm --filter @drsell/shopify build
pnpm --filter @drsell/adp build
pnpm --filter @drsell/openclaw build
pnpm --filter @drsell/api exec prisma generate

# 四个重构建并行跑：每个 app 在独立子壳里 source 自己的 .env 并 export 覆盖项，
# 互不泄漏（历史上 ASSET_PREFIX 这类 env 串台会造成 /app 资产事故，见 AGENTS.md 陷阱 2）。
echo "==> Build api + web + storefront + ops (parallel, per-app env isolated)"
LOGDIR="$(mktemp -d /tmp/drsell-deploy.XXXXXX)"

(
  pnpm --filter @drsell/api build
) >"$LOGDIR/api.log" 2>&1 & P_API=$!

(
  set -a
  [[ -f apps/web/.env ]] && . apps/web/.env || true
  # Production: client calls /api via nginx; server routes use API_INTERNAL_URL at runtime.
  export API_INTERNAL_URL="http://127.0.0.1:5011"
  export NEXT_PUBLIC_API_BASE="/api"
  export NEXT_PUBLIC_SHOPIFY_API_KEY="${NEXT_PUBLIC_SHOPIFY_API_KEY:-${SHOPIFY_API_KEY:-}}"
  # 与 storefront 共用域名根，静态资产隔离到 /app/_next/（见 apps/web/next.config.ts）
  export ASSET_PREFIX="/app"
  set +a
  pnpm --filter @drsell/web build
) >"$LOGDIR/web.log" 2>&1 & P_WEB=$!

(
  set -a
  [[ -f apps/storefront/.env ]] && . apps/storefront/.env || true
  export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-https://drsell.szchada.top/api}"
  export NEXT_PUBLIC_SHOPIFY_API_KEY="${NEXT_PUBLIC_SHOPIFY_API_KEY:-${SHOPIFY_API_KEY:-}}"
  set +a
  pnpm --filter @drsell/storefront build
) >"$LOGDIR/storefront.log" 2>&1 & P_STOREFRONT=$!

(
  set -a
  [[ -f apps/ops/.env ]] && . apps/ops/.env || true
  export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-https://ops.szchada.top/api}"
  set +a
  pnpm --filter @drsell/ops build
) >"$LOGDIR/ops.log" 2>&1 & P_OPS=$!

BUILD_FAIL=0
for p in "$P_API" "$P_WEB" "$P_STOREFRONT" "$P_OPS"; do
  wait "$p" || BUILD_FAIL=1
done
if [[ "$BUILD_FAIL" -ne 0 ]]; then
  echo "Build failed — per-app logs:"
  for n in api web storefront ops; do
    echo "----- $n -----"
    cat "$LOGDIR/$n.log"
  done
  rm -rf "$LOGDIR"
  exit 1
fi
rm -rf "$LOGDIR"

echo "==> Prepare remote layout"
ssh "$HOST" "mkdir -p ${REMOTE}/apps/{api,web,storefront,ops} ${REMOTE}/packages/{shared,shopify,adp,openclaw} ${REMOTE}/node_modules"

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

rsync -az --delete "$ROOT/apps/web/.next/standalone/" "${HOST}:${REMOTE}/apps/web/standalone/"
mkdir -p "$ROOT/apps/web/.next/static"
rsync -az --delete "$ROOT/apps/web/.next/static/" "${HOST}:${REMOTE}/apps/web/standalone/apps/web/.next/static/"
rsync -az --delete "$ROOT/apps/web/public/" "${HOST}:${REMOTE}/apps/web/standalone/apps/web/public/" 2>/dev/null || true

rsync -az --delete "$ROOT/apps/storefront/.next/standalone/" "${HOST}:${REMOTE}/apps/storefront/standalone/"
mkdir -p "$ROOT/apps/storefront/.next/static"
rsync -az --delete "$ROOT/apps/storefront/.next/static/" "${HOST}:${REMOTE}/apps/storefront/standalone/apps/storefront/.next/static/"
rsync -az --delete "$ROOT/apps/storefront/public/" "${HOST}:${REMOTE}/apps/storefront/standalone/apps/storefront/public/" 2>/dev/null || true

rsync -az --delete "$ROOT/apps/ops/.next/standalone/" "${HOST}:${REMOTE}/apps/ops/standalone/"
mkdir -p "$ROOT/apps/ops/.next/static"
rsync -az --delete "$ROOT/apps/ops/.next/static/" "${HOST}:${REMOTE}/apps/ops/standalone/apps/ops/.next/static/" 2>/dev/null || true
# ops 的 /brand 图标走 public/ 静态目录（middleware 已豁免 brand 路径）——漏同步会让 favicon 全 404
rsync -az --delete "$ROOT/apps/ops/public/" "${HOST}:${REMOTE}/apps/ops/standalone/apps/ops/public/" 2>/dev/null || true

rsync -az "$ROOT/apps/api/.env" "${HOST}:${REMOTE}/apps/api/.env"
rsync -az "$ROOT/apps/web/.env" "${HOST}:${REMOTE}/apps/web/.env"
if [[ -f apps/storefront/.env ]]; then
  rsync -az "$ROOT/apps/storefront/.env" "${HOST}:${REMOTE}/apps/storefront/.env"
fi

rsync -az "$ROOT/package.json" "$ROOT/pnpm-workspace.yaml" "$ROOT/pnpm-lock.yaml" "${HOST}:${REMOTE}/"

echo "==> Sync nginx vhost"
rsync -az "$ROOT/infra/nginx/drsell.szchada.top.conf" "${HOST}:${NGINX_CONF_DIR}/drsell.szchada.top.conf"
rsync -az "$ROOT/infra/nginx/ops.szchada.top.conf" "${HOST}:${NGINX_CONF_DIR}/ops.szchada.top.conf"
rsync -az "$ROOT/infra/nginx/drsell-proxy-headers.inc" "${HOST}:${NGINX_CONF_DIR}/drsell-proxy-headers.inc"
ssh "$HOST" "rm -f ${NGINX_CONF_DIR}/ops.drsell.szchada.top.conf 2>/dev/null; \
  if [ ! -f /opt/webrtc-ws-proxy/certs/ops.szchada.top.crt ]; then \
    openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
      -keyout /opt/webrtc-ws-proxy/certs/ops.szchada.top.key \
      -out /opt/webrtc-ws-proxy/certs/ops.szchada.top.crt \
      -subj '/CN=ops.szchada.top'; \
  fi"

echo "==> Install API prod deps on server + migrate + pm2"
ssh "$HOST" bash -s <<EOF
set -euo pipefail
cd ${REMOTE}

if grep -q 'postgres:5432' apps/api/.env; then
  sed -i 's|@postgres:5432|@127.0.0.1:5432|g' apps/api/.env
fi
grep -q '^PORT=' apps/api/.env && sed -i 's/^PORT=.*/PORT=5011/' apps/api/.env || echo 'PORT=5011' >> apps/api/.env
grep -q '^STOREFRONT_DEFAULT_SHOP=' apps/api/.env || echo 'STOREFRONT_DEFAULT_SHOP=' >> apps/api/.env

# web standalone needs internal API URL for OAuth callback + webhooks
grep -q '^API_INTERNAL_URL=' apps/web/.env && \
  sed -i 's|^API_INTERNAL_URL=.*|API_INTERNAL_URL=http://127.0.0.1:5011|' apps/web/.env || \
  echo 'API_INTERNAL_URL=http://127.0.0.1:5011' >> apps/web/.env
grep -q '^NEXT_PUBLIC_API_BASE=' apps/web/.env && \
  sed -i 's|^NEXT_PUBLIC_API_BASE=.*|NEXT_PUBLIC_API_BASE=/api|' apps/web/.env || \
  echo 'NEXT_PUBLIC_API_BASE=/api' >> apps/web/.env

corepack enable
corepack prepare pnpm@8.15.4 --activate
pnpm install --prod --filter @drsell/api... --frozen-lockfile || pnpm install --prod --filter @drsell/api...

cd apps/api
export DATABASE_URL=\$(grep '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"' | tr -d "'")
pnpm dlx prisma@6.9.0 migrate deploy
pnpm dlx prisma@6.9.0 generate

pm2 delete drsell-api 2>/dev/null || true
pm2 delete drsell-web 2>/dev/null || true
pm2 delete drsell-storefront 2>/dev/null || true
pm2 delete drsell-ops 2>/dev/null || true

cd ${REMOTE}/apps/api
pm2 start dist/main.js --name drsell-api --env production

cd ${REMOTE}/apps/storefront/standalone/apps/storefront
PORT=5010 HOSTNAME=127.0.0.1 pm2 start server.js --name drsell-storefront

cd ${REMOTE}/apps/web/standalone/apps/web
PORT=5012 HOSTNAME=127.0.0.1 pm2 start server.js --name drsell-web

cd ${REMOTE}/apps/ops/standalone/apps/ops
PORT=5013 HOSTNAME=127.0.0.1 pm2 start server.js --name drsell-ops

pm2 save
pm2 status

curl -sf http://127.0.0.1:5011/api/health && echo
curl -sf -o /dev/null -w "storefront:%{http_code}\n" http://127.0.0.1:5010/ || true
curl -sf -o /dev/null -w "shopify-web:%{http_code}\n" http://127.0.0.1:5012/app || true
curl -sf -o /dev/null -w "ops:%{http_code}\n" http://127.0.0.1:5013/login || true
EOF

echo "==> Reload nginx vhost"
ssh "$HOST" 'docker exec webrtc-ws-proxy nginx -t && docker exec webrtc-ws-proxy nginx -s reload && echo nginx_ok'

echo "==> Prune stale drsell nginx backups on wjclaw"
ssh "$HOST" "rm -f ${NGINX_CONF_DIR}/drsell.szchada.com.conf.bak ${NGINX_CONF_DIR}/default.conf.bak 2>/dev/null || true"

echo "==> Cloudflare: ops.szchada.top proxied A (optional — needs CF_API_TOKEN)"
bash "$ROOT/infra/cloudflare/configure-ops-dns.sh" || echo "(configure-ops-dns skipped — run manually if DNS not set)"

echo "Done."
echo "Storefront: https://drsell.szchada.top/"
echo "Ops console: https://ops.szchada.top/"
echo "OAuth: https://drsell.szchada.top/api/auth?shop=YOUR_STORE.myshopify.com"
