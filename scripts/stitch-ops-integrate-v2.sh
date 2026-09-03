#!/usr/bin/env bash
# stitch-to-shadcn-pro 阶段 A —— 新设计源（Stitch 项目 11226504772808429506）的
# superadmin-dark 四屏。旧四屏的脚本是 stitch-ops-integrate.sh，两者并存。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/.stitch/project-11226504772808429506"
OUT="$SRC/work"
ENGINE="${ENGINE:-$HOME/.cursor/skills/stitch-to-shadcn-pro}"
NODE_BIN="${NODE_BIN:-node}"
VIEWPORT="${VIEWPORT:-1440}"

[[ -d "$ENGINE/scripts" ]] || { echo "stitch-to-shadcn-pro not found at $ENGINE" >&2; exit 1; }
[[ -n "${STITCH_DEPS_DIR:-}" ]] || { echo "STITCH_DEPS_DIR is not set" >&2; exit 1; }

# 屏 → 短名（短名用于 reports/ 目录与阶段 C 的路由映射）
declare -a PAGES=(
  "02_Accounts_&_Membership_Overview:accounts"
  "05_System_Health_&_Global_Config:system"
  "07_Active_Support_Session_(Impersonation):impersonation"
  "08_Store_&_Subscription_Details:shop_detail"
)

for entry in "${PAGES[@]}"; do
  file="${entry%%:*}"; name="${entry##*:}"
  src="$SRC/designs/${file}.html"
  [[ -f "$src" ]] || { echo "skip $name — missing $src" >&2; continue; }
  mkdir -p "$OUT/spec" "$OUT/reports/$name" "$OUT/rebuild"
  echo "measure $name"
  "$NODE_BIN" "$ENGINE/scripts/measure.js" --input "$src" \
    --out "$OUT/spec/${name}.spec.json" --viewport "$VIEWPORT"
  # rebuild/ 是可编辑副本 —— 目标图是**我们的设计**，不是 Stitch 原样输出。
  # 已存在则不覆盖（保留已打入的刻意偏离）。
  [[ -f "$OUT/rebuild/${name}.html" ]] || cp "$src" "$OUT/rebuild/${name}.html"
  echo "render baseline $name (from rebuild)"
  "$NODE_BIN" "$ENGINE/scripts/render.js" --input "$OUT/rebuild/${name}.html" \
    --out "$OUT/reports/${name}/baseline.png" --viewport "$VIEWPORT"
  "$NODE_BIN" "$ENGINE/scripts/mask-text.js" --input "$OUT/rebuild/${name}.html" \
    --out "$OUT/reports/${name}/textMask.png" --viewport "$VIEWPORT"
done

echo "阶段 A 完成 → $OUT"
