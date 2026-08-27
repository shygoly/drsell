#!/usr/bin/env bash
# Upsert DNS for Drsell on szchada.top
# Requires: CF_API_TOKEN with Zone.DNS Edit (and Zone.Read) on szchada.top
#
# Create token: https://dash.cloudflare.com/profile/api-tokens
#   Template "Edit zone DNS" → Zone = szchada.top
#
# Usage:
#   CF_API_TOKEN=xxx ./infra/cloudflare/upsert-dns.sh
set -euo pipefail

CF_API_TOKEN="${CF_API_TOKEN:?Set CF_API_TOKEN (Zone.DNS Edit on szchada.top)}"
CF_ZONE_ID="${CF_ZONE_ID:-a6b2986fbeb9f521b393bd4a64c4311f}"
WJC_LAW_IP="${WJC_LAW_IP:-163.7.7.160}"
API="https://api.cloudflare.com/client/v4"

upsert_a() {
  local name="$1"
  local proxied="$2"
  local list id body
  list=$(curl -sS -H "Authorization: Bearer ${CF_API_TOKEN}" \
    "${API}/zones/${CF_ZONE_ID}/dns_records?type=A&name=${name}")
  id=$(echo "$list" | python3 -c "import sys,json; d=json.load(sys.stdin); print((d.get('result') or [{}])[0].get('id','') if d.get('success') else '')")
  body=$(python3 -c "import json; print(json.dumps({'type':'A','name':'${name}','content':'${WJC_LAW_IP}','ttl':1,'proxied':${proxied}}))")
  if [[ -n "$id" ]]; then
    echo "Updating A ${name} (${id})"
    curl -sS -X PUT -H "Authorization: Bearer ${CF_API_TOKEN}" -H "Content-Type: application/json" \
      --data "$body" "${API}/zones/${CF_ZONE_ID}/dns_records/${id}" \
      | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if d.get('success') else d)"
  else
    echo "Creating A ${name}"
    curl -sS -X POST -H "Authorization: Bearer ${CF_API_TOKEN}" -H "Content-Type: application/json" \
      --data "$body" "${API}/zones/${CF_ZONE_ID}/dns_records" \
      | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if d.get('success') else d)"
  fi
}

echo "Zone szchada.top (${CF_ZONE_ID}) → ${WJC_LAW_IP}"
upsert_a "drsell.szchada.top" "True"
# Optional PG public hostname (DNS only / gray cloud) — skip unless requested
# upsert_a "wjclawpg.szchada.top" "False"

echo "Verify:"
dig +short drsell.szchada.top A @1.1.1.1 || true
curl -sS -m 15 -o /dev/null -w "https://drsell.szchada.top/api/health -> %{http_code}\n" \
  https://drsell.szchada.top/api/health || true
