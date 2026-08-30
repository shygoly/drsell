#!/usr/bin/env bash
# wjclaw 上一键初始化 DrSell OpenClaw profile + adp_reader（在仓库根目录执行）。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
STATE_DIR="${OPENCLAW_STATE_DIR:-/root/.openclaw-drsell}"
WORKSPACE="/root/.openclaw/workspace-drsell"

: "${DEEPSEEK_API_KEY:?需要 DEEPSEEK_API_KEY（复用 wjclaw 现有 DeepSeek）}"

if [[ -z "${OPENCLAW_GATEWAY_TOKEN:-}" ]]; then
  OPENCLAW_GATEWAY_TOKEN="$(openssl rand -hex 24)"
  echo "生成 OPENCLAW_GATEWAY_TOKEN"
fi
if [[ -z "${ADP_READER_PASSWORD:-}" ]]; then
  ADP_READER_PASSWORD="$(openssl rand -hex 16)"
  echo "生成 ADP_READER_PASSWORD"
fi

echo "== 1. adp_reader 角色与函数 =="
ADMIN_DSN="${ADMIN_DSN:-postgres://medusa@127.0.0.1:5432/drsell}" \
ADP_READER_PASSWORD="$ADP_READER_PASSWORD" \
bash "$ROOT/scripts/setup-adp-reader.sh"

echo "== 2. OpenClaw 配置 =="
mkdir -p "$STATE_DIR" "$WORKSPACE/skills/drsell-pg"
cp "$ROOT/infra/openclaw/drsell/workspace/SOUL.md" "$WORKSPACE/"
cp "$ROOT/infra/openclaw/drsell/workspace/IDENTITY.md" "$WORKSPACE/"
cp "$ROOT/infra/openclaw/drsell/workspace/skills/drsell-pg/SKILL.md" "$WORKSPACE/skills/drsell-pg/"

sed -e "s/REPLACE_WITH_DEEPSEEK_API_KEY/${DEEPSEEK_API_KEY}/" \
    -e "s/REPLACE_WITH_GATEWAY_TOKEN/${OPENCLAW_GATEWAY_TOKEN}/" \
    -e "s/REPLACE_ADP_READER_PASSWORD/${ADP_READER_PASSWORD}/" \
    "$ROOT/infra/openclaw/drsell/openclaw.json.example" > "$STATE_DIR/openclaw.json"

echo "== 3. pm2 openclaw-drsell =="
pm2 delete openclaw-drsell 2>/dev/null || true
pm2 start "$ROOT/infra/openclaw/drsell/ecosystem.config.cjs"
pm2 save

SECRETS_FILE="${STATE_DIR}/drsell-secrets.env"
cat > "$SECRETS_FILE" <<EOF
# DrSell OpenClaw — 勿提交 git
OPENCLAW_GATEWAY_URL=http://127.0.0.1:18790
OPENCLAW_GATEWAY_TOKEN=${OPENCLAW_GATEWAY_TOKEN}
OPENCLAW_AGENT_ID=main
ADP_READER_PASSWORD=${ADP_READER_PASSWORD}
EOF
chmod 600 "$SECRETS_FILE"

echo ""
echo "完成。密钥已写入 ${SECRETS_FILE}"
echo "将 OPENCLAW_* 追加到 /opt/drsell-run/apps/api/.env 后 pm2 restart drsell-api"
