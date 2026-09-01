#!/usr/bin/env bash
# ops.szchada.top — proxied A record → wjclaw :443 (same pattern as drsell.szchada.top).
#
# Manual (Cloudflare Dashboard → szchada.top):
#   1. Workers & Pages → drsell-origin-proxy → Domains → Remove ops.szchada.top (if present)
#   2. DNS → Add: Type A, Name ops, Content 163.7.7.160, Proxied ON
#   3. SSL/TLS → Full (origin uses self-signed cert on :8443)
#
# API: CF_API_TOKEN=... ./infra/cloudflare/configure-ops-dns.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/infra/cloudflare"

WJC_LAW_IP="${WJC_LAW_IP:-163.7.7.160}"
ZONE_ID="${CF_ZONE_ID:-a6b2986fbeb9f521b393bd4a64c4311f}"
API="https://api.cloudflare.com/client/v4"
DOMAIN="ops.szchada.top"
ACCT="5732310593ba6c86ed574f3997731071"

get_token() {
  if [[ -n "${CF_API_TOKEN:-}" ]]; then
    echo "$CF_API_TOKEN"
    return
  fi
  python3 - <<'PY'
import pathlib, re, sys
p = pathlib.Path.home() / "Library/Preferences/.wrangler/config/default.toml"
text = p.read_text()
m = re.search(r'oauth_token\s*=\s*"([^"]+)"', text)
sys.stdout.write(m.group(1) if m else "")
PY
}

TOKEN="$(get_token)"
if [[ -z "$TOKEN" ]]; then
  echo "Need CF_API_TOKEN or wrangler login oauth"
  exit 1
fi

echo "==> Remove Worker custom domain on ops (if present)"
domains=$(curl -sS -H "Authorization: Bearer ${TOKEN}" \
  "${API}/accounts/${ACCT}/workers/domains")
dom_id=$(echo "$domains" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for r in d.get('result') or []:
    if r.get('hostname') == '${DOMAIN}':
        print(r['id'])
        break
")
if [[ -n "${dom_id:-}" ]]; then
  curl -sS -X DELETE -H "Authorization: Bearer ${TOKEN}" \
    "${API}/accounts/${ACCT}/workers/domains/${dom_id}" >/dev/null || true
  echo "Removed Worker domain ${DOMAIN} (${dom_id})"
else
  echo "No Worker custom domain on ${DOMAIN}"
fi

if [[ -z "${CF_API_TOKEN:-}" ]]; then
  echo ""
  echo "No CF_API_TOKEN — add proxied A record manually (see header comments)."
  echo "Verify: curl -s https://${DOMAIN}/healthz"
  exit 0
fi

echo "==> Upsert proxied A ${DOMAIN} → ${WJC_LAW_IP}"
list=$(curl -sS -H "Authorization: Bearer ${TOKEN}" \
  "${API}/zones/${ZONE_ID}/dns_records?type=A&name=${DOMAIN}")
id=$(echo "$list" | python3 -c "import sys,json; d=json.load(sys.stdin); print((d.get('result') or [{}])[0].get('id','') if d.get('success') else '')")
body=$(python3 -c "import json; print(json.dumps({'type':'A','name':'ops','content':'${WJC_LAW_IP}','ttl':1,'proxied':True}))")
if [[ -n "$id" ]]; then
  curl -sS -X PUT -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" \
    --data "$body" "${API}/zones/${ZONE_ID}/dns_records/${id}" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print('A update', d.get('success'), d.get('errors'))"
else
  curl -sS -X POST -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" \
    --data "$body" "${API}/zones/${ZONE_ID}/dns_records" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print('A create', d.get('success'), d.get('errors'))"
fi

echo "==> Verify"
sleep 3
dig +short "${DOMAIN}" A @1.1.1.1 || true
curl -sS -m 25 -o /dev/null -w "https://${DOMAIN}/healthz -> %{http_code}\n" "https://${DOMAIN}/healthz" || true
curl -sS -m 25 -o /dev/null -w "https://${DOMAIN}/login -> %{http_code}\n" "https://${DOMAIN}/login" || true
