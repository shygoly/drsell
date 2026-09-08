#!/usr/bin/env bash
# drsell.szchada.top DNS — use orange-cloud A record (NOT Worker custom_domain).
#
# Why: Worker custom_domain creates a Workers DNS entry that blocks adding a plain
# A record, and Worker→origin fetch often 522/1003 on this host.
#
# 实况（2026-09-08 经 CF API 核对，勿再照抄旧注释）：
#   drsell.szchada.top  A 163.7.7.160  橙云 ttl=auto —— 没有 Worker 路由，也没有 custom domain
#   ops.szchada.top     A 163.7.7.160  橙云 ttl=auto —— 同上
#   Worker drsell-origin-proxy 已部署但未绑定任何域名，当前不在链路里
# 旧注释说「dingding.szchada.top 也是 proxied A → wjclaw」是错的：dingding 实际是
# Worker custom domain（script dingding-a1-spi），DNS 那条 AAAA 100:: 只是占位记录。
# szchada.top 上走 Worker custom domain 的是这 7 个：
#   api.kaoyan / dingding / api / web / mpc / chain / vault —— 它们都是 AAAA 100::。
#
# Manual steps (Cloudflare Dashboard → szchada.top):
#   1. Workers & Pages → drsell-origin-proxy → Settings → Domains & Routes
#      → Remove drsell.szchada.top (if present)
#   2. DNS → Add record: Type A, Name drsell, Content 163.7.7.160, Proxied ON
#   3. SSL/TLS → Overview → Full (not Strict) — origin uses self-signed cert
#
# Optional API (needs CF_API_TOKEN with Zone.DNS Edit):
#   CF_API_TOKEN=... ./configure-drsell-dns.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/infra/cloudflare"

DOMAIN="${DRSELL_DOMAIN:-drsell.szchada.top}"
ORIGIN_IP="${WJC_LAW_IP:-163.7.7.160}"
ZONE_ID="${CF_ZONE_ID:-a6b2986fbeb9f521b393bd4a64c4311f}"
API="https://api.cloudflare.com/client/v4"

echo "==> Remove Worker custom domain route (if wrangler OAuth has access)"
wrangler deploy 2>/dev/null || echo "(wrangler deploy skipped — run manually if needed)"

if [[ -z "${CF_API_TOKEN:-}" ]]; then
  echo ""
  echo "No CF_API_TOKEN — complete manual dashboard steps above."
  echo "Then verify: curl -s https://${DOMAIN}/api/health"
  exit 0
fi

echo "==> Upsert proxied A record ${DOMAIN} → ${ORIGIN_IP}"
list=$(curl -sS -H "Authorization: Bearer ${CF_API_TOKEN}" \
  "${API}/zones/${ZONE_ID}/dns_records?type=A&name=${DOMAIN}")
id=$(echo "$list" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result'][0]['id'] if d.get('result') else '')")
body=$(python3 -c "import json; print(json.dumps({'type':'A','name':'drsell','content':'${ORIGIN_IP}','ttl':1,'proxied':True}))")
if [[ -n "$id" ]]; then
  curl -sS -X PUT -H "Authorization: Bearer ${CF_API_TOKEN}" -H "Content-Type: application/json" \
    --data "$body" "${API}/zones/${ZONE_ID}/dns_records/${id}" | python3 -c "import sys,json; d=json.load(sys.stdin); print('A update', d.get('success'), d.get('errors'))"
else
  curl -sS -X POST -H "Authorization: Bearer ${CF_API_TOKEN}" -H "Content-Type: application/json" \
    --data "$body" "${API}/zones/${ZONE_ID}/dns_records" | python3 -c "import sys,json; d=json.load(sys.stdin); print('A create', d.get('success'), d.get('errors'))"
fi

echo "==> Verify"
sleep 2
dig +short "${DOMAIN}" A @1.1.1.1 || true
curl -sS -o /dev/null -w "https://${DOMAIN}/api/health -> %{http_code}\n" \
  "https://${DOMAIN}/api/health" || true
echo "Done. App URL: https://${DOMAIN}"
