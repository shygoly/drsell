#!/usr/bin/env bash
# Generate remaining ops console screens via Stitch MCP and fetch HTML/PNG exports.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEY="${STITCH_API_KEY:?STITCH_API_KEY required}"
PROJECT_ID="${STITCH_PROJECT_ID:-9964189885845765199}"
DS="${STITCH_DESIGN_SYSTEM:-assets/2762659709350514189}"

call_mcp() {
  local tool="$1" args="$2" out="$3"
  curl -sS -X POST "https://stitch.googleapis.com/mcp" \
    -H "Content-Type: application/json" \
    -H "X-Goog-Api-Key: ${KEY}" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":${RANDOM},\"method\":\"tools/call\",\"params\":{\"name\":\"${tool}\",\"arguments\":${args}}}" \
    > "${out}"
}

fetch_screen() {
  local slug="$1" response="$2"
  python3 - "${slug}" "${response}" "${ROOT}" <<'PY'
import json, sys, shutil, urllib.request
slug, resp_path, root = sys.argv[1:4]
data = json.load(open(resp_path))
text = data["result"]["content"][0]["text"]
obj = json.loads(text)
screen = obj["outputComponents"][1]["design"]["screens"][0]
html_url = screen["htmlCode"]["downloadUrl"]
png_url = screen["screenshot"]["downloadUrl"]
export_dir = f"{root}/design/stitch-export/drsell_ops_console/{slug}"
for url, name in [(html_url, "code.html"), (png_url, "screen.png")]:
    req = urllib.request.Request(url, headers={"User-Agent": "drsell-stitch-fetch/1"})
    with urllib.request.urlopen(req, timeout=120) as r:
        open(f"{export_dir}/{name}", "wb").write(r.read())
shutil.copy(f"{export_dir}/code.html", f"{root}/.stitch/designs/{slug}.html")
print(f"saved {slug}: {screen.get('id')} {screen.get('title')}")
PY
}

generate_and_fetch() {
  local slug="$1" prompt="$2"
  local tmp="/tmp/stitch-gen-${slug}.json"
  echo "Generating ${slug}..."
  python3 -c "
import json
print(json.dumps({
  'projectId': '${PROJECT_ID}',
  'designSystem': '${DS}',
  'deviceType': 'DESKTOP',
  'modelId': 'GEMINI_3_1_PRO',
  'prompt': '''${prompt}'''
}))
" | {
    read -r args
    call_mcp "generate_screen_from_text" "${args}" "${tmp}"
  }
  fetch_screen "${slug}" "${tmp}"
}

STYLE='Same Drsell Ops Console as previous screens. Ledger-stock aesthetic. Palette page #e6ebe7, cards #fafcfa NEVER white, ink #14211e, secondary #55635d, trial #4b3fa8, frozen #a66009, terminal #8e3b2f. NO Shopify green. Sidebar 200px identical: 运营台 nav 到期队列 店铺 账号 审计日志 套餐配置. Bricolage Grotesque headings, Martian Mono data. 4px corners, 1px #c4cdc7 borders.'

generate_and_fetch shop_detail "${STYLE} Screen 2 of 4 shop detail. Same sidebar. Header nordic-cycles.myshopify.com Martian Mono, 归属 mia@nordiccycles.se · 名下 2 家店 · 安装于 2026-03-12, FROZEN chip ochre. Three equal panels: 计费 definition list, 本周期用量 meters with over-quota rust hatching, 可用期 huge 4 days countdown 52px ochre + runway bar. Footer buttons: 发催缴提醒 · 延长解冻期 · 改指定计费店 · 重跑同步 · 代登录 · 停用聊天窗 rust."

generate_and_fetch account_detail "${STYLE} Screen 3 of 4 account detail. Sidebar 账号 active. Header mia@nordiccycles.se, Google 登录 · 注册于 2026-02-02 · 最近登录 3h ago. Button 代登录. Table 名下店铺 5 columns 店铺 角色 订阅 计费店 安装时间 two rows nordic-cycles and atlas-outfitters. Section 最近操作 4 audit preview rows."

generate_and_fetch audit_log "${STYLE} Screen 4 of 4 audit log. Sidebar 审计日志 active. Filter bar search 搜索店铺或操作者 plus dropdowns 动作 操作者 时间范围. Dense 6-column table 时间 操作者 动作 对象店铺 结果 IP, 8 rows, one 失败 in rust. Pagination 共 2,481 条. Most boring screen, no cards metrics charts."

echo "Done."
