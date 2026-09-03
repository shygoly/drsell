#!/usr/bin/env bash
# stitch-to-shadcn-pro 阶段 A：对 ops 四屏 Stitch 稿做盒模型测量 + baseline 渲染。
# 阶段 B 目标：apps/ops（Tailwind v4 + shadcn/ui，见 ADR-12）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENGINE="${ENGINE:-$HOME/.cursor/skills/stitch-to-shadcn-pro}"
NODE_BIN="${NODE_BIN:-node}"
VIEWPORT="${VIEWPORT:-1440}"

if [[ ! -d "$ENGINE/scripts" ]]; then
  echo "stitch-to-shadcn-pro not found at $ENGINE" >&2
  echo "Set ENGINE= to your skill install path." >&2
  exit 1
fi

if [[ -z "${STITCH_DEPS_DIR:-}" ]]; then
  echo "STITCH_DEPS_DIR is not set (playwright + pixelmatch + pngjs). See $ENGINE/PORTING.md" >&2
  exit 1
fi

PAGES=(expiry_queue shop_detail account_detail audit_log)

for page in "${PAGES[@]}"; do
  src="$ROOT/.stitch/designs/${page}.html"
  if [[ ! -f "$src" ]]; then
    echo "skip $page — missing $src" >&2
    continue
  fi
  mkdir -p "$ROOT/.stitch/spec" "$ROOT/.stitch/reports/${page}" "$ROOT/.stitch/rebuild"
  echo "measure $page"
  "$NODE_BIN" "$ENGINE/scripts/measure.js" \
    --input "$src" \
    --out "$ROOT/.stitch/spec/${page}.spec.json" \
    --viewport "$VIEWPORT"
  echo "render baseline $page"
  "$NODE_BIN" "$ENGINE/scripts/render.js" \
    --input "$src" \
    --out "$ROOT/.stitch/reports/${page}/baseline.png" \
    --viewport "$VIEWPORT"
  cp "$src" "$ROOT/.stitch/rebuild/${page}.html"
done

echo "Ops stitch integrate done. Next: align apps/ops pages with .stitch/rebuild/ + run phase C diff after dev server."
