#!/usr/bin/env bash
# DTC 独立站（Medusa 引擎 + 内容式官网店面）的部署脚本。
#
# 为什么单独一个脚本：`deploy-mvp.sh` 管的是 drsell(Shopify) 侧，实测它对 Medusa 侧
# 零命中——跑完一次它，medusa.szchada.top 上一个字节都不变（DEPLOY.md §0）。
# 两条链路构建方式根本不同：drsell 侧本机构建后 rsync，Medusa 侧**必须在服务器上构建**
# （`@medusajs/*` 重依赖树不入本机 workspace）。
#
# 幂等、可重复跑。改动前先读 DEPLOY.md §6。
set -euo pipefail

HOST="${DEPLOY_HOST:-wjclaw}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SHOP_BUILD="${SHOP_BUILD:-/root/drsell-shop-build/shop}"
SW_DIR="${SW_DIR:-/opt/drsell-shop-web}"
NGINX_CONF_DIR="${NGINX_CONF_DIR:-/opt/webrtc-ws-proxy/conf.d}"

cd "$ROOT"

echo "==> 0. 前置检查：本地必须有店面源文件"
for f in apps/shop-web/index.html apps/shop-web/server.mjs; do
  [[ -f "$f" ]] || { echo "缺少 $f" >&2; exit 1; }
done

echo "==> 1. 同步 Medusa 自定义源码（module + API 路由 + admin 扩展 + lib/subscribers）"
# 只同步**手写的 wire-up**；scaffold 生成产物不入库（见 apps/shop/README.md）。
ssh "$HOST" "mkdir -p ${SHOP_BUILD}/apps/backend/src/{modules,api,admin,lib,subscribers,scripts}"
for d in modules api admin lib subscribers scripts; do
  [[ -d "apps/shop/apps/backend/src/$d" ]] || continue
  rsync -az "apps/shop/apps/backend/src/$d/" "${HOST}:${SHOP_BUILD}/apps/backend/src/$d/"
done

echo "==> 2. 同步 medusa-config.ts（module 注册）"
if [[ -f apps/shop/apps/backend/medusa-config.ts ]]; then
  ssh "$HOST" "cp ${SHOP_BUILD}/apps/backend/medusa-config.ts ${SHOP_BUILD}/apps/backend/medusa-config.ts.bak.\$(date +%Y%m%d-%H%M%S) 2>/dev/null || true"
  rsync -az apps/shop/apps/backend/medusa-config.ts "${HOST}:${SHOP_BUILD}/apps/backend/medusa-config.ts"
else
  echo "  (仓库无 medusa-config.ts，跳过——注意 modules 注册需在服务器上手改)"
fi

echo "==> 3. 迁移（建表）+ 构建"
ssh "$HOST" bash -s <<EOF
set -euo pipefail
cd ${SHOP_BUILD}/apps/backend
set -a; . .env; set +a
echo "  -- db:migrate"
npx medusa db:migrate 2>&1 | tail -4
echo "  -- build"
npx medusa build 2>&1 | tail -6
EOF

echo "==> 4. 构建产物补 .env"
# `medusa build` 会**删掉整个 .medusa/server** 再重建，因此：
#   a) 里面不会有 .env，而 Medusa 从 cwd 读 .env —— 不补就起不来
#      （症状：http.jwtSecret not found）
#   b) 旧 pm2 条目若指向 .medusa/server/node_modules/.bin/medusa 会变成悬空路径
#      （症状：MODULE_NOT_FOUND）——故下面统一用**工作区根**的 CLI 路径，它不随构建消失。
ssh "$HOST" bash -s <<EOF
set -euo pipefail
B=${SHOP_BUILD}/apps/backend
S=\$B/.medusa/server
grep -q '^DATABASE_URL=' \$B/.env || { echo "!! \$B/.env 缺 DATABASE_URL" >&2; exit 1; }
cp \$B/.env \$S/.env
# Redis 系列来自 root-only 的 shop.env（不入库）
grep -E '^(REDIS_URL|EVENTS_REDIS_URL|CACHE_REDIS_URL|REDIS_PREFIX)=' /root/drsell-shop/shop.env >> \$S/.env 2>/dev/null || true
sort -u \$S/.env -o \$S/.env
chmod 600 \$S/.env
echo "  .env -> \$S/.env"

CLI=${SHOP_BUILD}/node_modules/@medusajs/cli/cli.js
[[ -f \$CLI ]] || { echo "!! 找不到 CLI: \$CLI" >&2; exit 1; }
pm2 delete drsell-shop-medusa >/dev/null 2>&1 || true
cd \$S
pm2 start \$CLI --name drsell-shop-medusa --interpreter /usr/bin/node -- start
pm2 save >/dev/null 2>&1 || true
EOF

echo "==> 5. 部署店面（静态页 + 注入发布密钥）"
scp -q apps/shop-web/index.html "wjclaw:${SW_DIR}/index.html.new"
scp -q apps/shop-web/server.mjs "wjclaw:${SW_DIR}/server.mjs"
ssh "$HOST" bash -s <<EOF
set -euo pipefail
SW=${SW_DIR}
# 发布密钥与 region 是前端公开值，但**不入库**：从现网页面取旧值回填占位符。
PK=\$(grep -o 'pk_[a-f0-9]*' \$SW/index.html 2>/dev/null | head -1 || true)
REG=\$(grep -o 'reg_[A-Za-z0-9]*' \$SW/index.html 2>/dev/null | head -1 || true)
if [[ -z "\$PK" || -z "\$REG" ]]; then
  echo "!! 现网页面取不到 pk/region —— 首次部署请手动注入，勿让占位符上线" >&2
  exit 1
fi
sed -i "s|__PUBLISHABLE_KEY__|\$PK|; s|__REGION_ID__|\$REG|" \$SW/index.html.new
if grep -q '__PUBLISHABLE_KEY__\|__REGION_ID__' \$SW/index.html.new; then
  echo "!! 占位符未被替换，中止" >&2; exit 1
fi
mv \$SW/index.html.new \$SW/index.html
echo "  storefront -> \$SW/index.html (pk \${PK:0:12}..., \$REG)"
# 店面是无构建静态服务：重启只为清缓存，不清也能生效
pm2 restart drsell-shop-web --update-env >/dev/null 2>&1 || \
  PORT=5020 SHOP_WEB_ROOT=\$SW pm2 start \$SW/server.mjs --name drsell-shop-web
pm2 save >/dev/null 2>&1 || true
EOF

echo "==> 6. 同步 nginx vhost"
if [[ -f infra/nginx/medusa.szchada.top.conf ]]; then
  rsync -az infra/nginx/medusa.szchada.top.conf "${HOST}:${NGINX_CONF_DIR}/medusa.szchada.top.conf"
  ssh "$HOST" 'docker exec webrtc-ws-proxy nginx -t && docker exec webrtc-ws-proxy nginx -s reload && echo nginx_ok'
else
  echo "  (仓库无 medusa vhost，跳过)"
fi

echo "==> 7. 公网验证（断言内容，不只看状态码 —— AGENTS.md 陷阱 3）"
verify() {
  local url="$1" needle="$2" code body
  for _ in 1 2 3 4 5 6; do
    body=$(curl -s --max-time 25 "$url" 2>/dev/null || true)
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 25 "$url" 2>/dev/null || echo 000)
    if [[ "$code" == "200" && "$body" == *"$needle"* ]]; then
      echo "  ok  $url  (命中 \"$needle\")"; return 0
    fi
    sleep 4
  done
  echo "  FAIL  $url  HTTP=$code 未命中 \"$needle\""; return 1
}
FAIL=0
verify "https://medusa.szchada.top/health"      "OK"            || FAIL=1
verify "https://medusa.szchada.top/"            "内容式官网"     || FAIL=1
verify "https://medusa.szchada.top/"            "drsell-chat-root" || FAIL=1
if [[ "$FAIL" != 0 ]]; then
  echo "公网验证未通过——不要当作部署成功。" >&2
  exit 1
fi

echo "==> 8. 反向断言 + 询价写路径（本次新增的唯一写路径，必须真跑一次）"
# 公开端点不得列举线索；管理端必须鉴权。这两个断言任一破了都是事故，故不与上面合并计数。
code_store=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "https://medusa.szchada.top/store/inquiries")
code_admin=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "https://medusa.szchada.top/admin/inquiries")
echo "  GET /store/inquiries -> $code_store (期望 400：无 pk 被 Medusa 中间件先拦；**绝不能是 200**)"
# /admin 由 **Medusa 自己**鉴权（无 token → Medusa 的 JSON 401）。
# ⚠ 这里**不能**是 nginx 的 HTML 401——那说明 Basic 被误加到了 /admin，
#   会让后台「登录成功但整页空白」（Authorization 头一次只能一种方案，见 DEPLOY.md §6.4e）。
echo "  GET /admin/inquiries -> $code_admin (期望 401，且必须是 Medusa 的 JSON)"
if [[ "$code_store" == "200" ]]; then
  echo "!! 线索可被公开列举——检查 store 路由的 GET 是否被移除" >&2
  exit 1
fi
if [[ "$code_admin" != "401" ]]; then
  echo "!! 后台未受保护（$code_admin）——应为 Medusa 的 401" >&2
  exit 1
fi
# 区分「Medusa 的 JSON 401」与「nginx 的 HTML 401」：后者是 Basic 误配到 /admin
admin_body="$(curl -s --max-time 20 "https://medusa.szchada.top/admin/inquiries")"
if [[ "$admin_body" == *"401 Authorization Required"* || "$admin_body" == *"<center>nginx</center>"* ]]; then
  echo "!! /admin 被 nginx Basic 拦截了——后台会「登录成功但空白」。" >&2
  echo "   Authorization 头一次只能承载一种方案：SPA 发 Bearer 就没有 Basic。" >&2
  echo "   Basic 只应加在 /app，见 infra/nginx/medusa.szchada.top.conf。" >&2
  exit 1
fi
echo "  ok  401 来自 Medusa（非 nginx Basic），后台数据接口可用"

echo "==> 8b. 后台访问保护 + 公开侧未被牵连（四条全测，只测 401 会漏掉 500 那类故障）"
for path in "/app/login" "/"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "https://medusa.szchada.top${path}")
  if [[ "$path" == "/app/login" ]]; then
    [[ "$code" == "401" ]] && echo "  ok  $path 无凭据 -> 401" || { echo "!! $path 未受保护（$code）" >&2; exit 1; }
  else
    [[ "$code" == "200" ]] && echo "  ok  $path 公开可访问 -> 200" || { echo "!! 公开侧被牵连（$code）" >&2; exit 1; }
  fi
done
# 公开 API 也必须活着：/store 若被误加 Basic，顾客侧询价与商品渲染会全挂
for p in "/health" "/store/products"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "https://medusa.szchada.top${p}")
  [[ "$code" == "200" || "$code" == "400" ]] || { echo "!! 公开 API $p 异常（$code）——检查是否被误加 auth_basic" >&2; exit 1; }
done
echo "  ok  /health · /store/products 公开侧正常"

# ★ 后台数据面**必须真的能用**：只测「401 受保护」会漏掉「保护过头导致整页空白」。
# 这是 2026-09-13 那个 bug 的回归断言——当时 /admin 被 Basic 拦死，后台登录成功却空白。
# 注意：这条需要服务器上的 admin 凭据，故在服务器上跑，失败不阻断部署（改为明确告警）。
if ssh "$HOST" 'test -f /root/drsell-shop/shop.env' 2>/dev/null; then
  ADMIN_OK=$(ssh "$HOST" '
    set -e
    BASE=http://127.0.0.1:9000
    E=$(grep -oP "(?<=^ADMIN_EMAIL=).*" /root/drsell-shop/shop.env)
    P=$(grep -oP "(?<=^ADMIN_PASSWORD=).*" /root/drsell-shop/shop.env)
    T=$(curl -s -X POST $BASE/auth/user/emailpass -H "Content-Type: application/json" \
      -d "{\"email\":\"$E\",\"password\":\"$P\"}" | python3 -c "import json,sys;print(json.load(sys.stdin)[\"token\"])")
    # 经**公网**（走 nginx）带 Bearer 拉一次，这正是 SPA 的调用方式
    curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $T" \
      "https://medusa.szchada.top/admin/products?limit=1"
  ' 2>/dev/null || echo "000")
  if [[ "$ADMIN_OK" == "200" ]]; then
    echo "  ok  后台数据面可用（Bearer 经公网 /admin/products -> 200）"
  else
    echo "  !! 后台数据面异常（$ADMIN_OK）——后台可能登录成功但空白。" >&2
    echo "     检查 /admin 是否被误加 auth_basic（应只加 /app）" >&2
    exit 1
  fi
else
  echo "  (跳过后台数据面断言：服务器上无 shop.env)"
fi

PKV="$(curl -s --max-time 25 https://medusa.szchada.top/ | grep -o 'pk_[a-f0-9]*' | head -1)"
if [[ -z "$PKV" ]]; then
  echo "!! 页面取不到 publishable key，无法验证写路径" >&2
  exit 1
fi
RESP=$(curl -s --max-time 25 -X POST "https://medusa.szchada.top/store/inquiries" \
  -H "Content-Type: application/json" -H "x-publishable-api-key: $PKV" \
  -d '{"contactRole":"purchaser","inquiryType":"doc","contactName":"部署自检","contactPhone":"13800000000","applicationScene":"deploy-shop.sh 自动自检，可删"}')
if [[ "$RESP" == *'"ok":true'* ]]; then
  echo "  POST /store/inquiries -> 201 已落库"
  echo "  注意：自检行进了 drsell_shop.inquiry（contactName='部署自检'），需要时清理"
else
  echo "!! 询价提交失败：$RESP" >&2
  exit 1
fi

echo "==> 9. 规格数据（metadata.specs）+ 管理端页面契约"
# 规格是**数据**：页面从 metadata 读，不再是前端硬编码（DEPLOY.md §6.3b / 缺口 8.13）。
# 这两条断言防的是「代码在、数据没写」与「页面已改名但断言没跟上」。
# seed-shop-specs.sh 读 /root/drsell-shop/shop.env 与现网页面，**必须在服务器上跑**。
rsync -az "$ROOT/scripts/seed-shop-specs.sh" "${HOST}:/root/seed-shop-specs.sh"
ssh "$HOST" 'bash /root/seed-shop-specs.sh' 2>&1 | tail -9 || {
  echo "!! 规格数据写入/回读失败" >&2; exit 1; }

# 管理端询价页必须真的编译进产物。别只测 200——整页是 SPA，路由错也返回 200。
if ssh "$HOST" "grep -rq '询价线索' ${SHOP_BUILD}/apps/backend/.medusa/server/public/admin/" 2>/dev/null; then
  echo "  ok  管理端已编译「询价线索」页"
else
  echo "!! 管理端产物里找不到询价页——src/admin/routes/inquiries 没同步或没重新 build" >&2
  exit 1
fi

echo "Done. https://medusa.szchada.top/"
