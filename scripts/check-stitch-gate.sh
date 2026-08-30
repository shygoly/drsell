#!/usr/bin/env bash
# Stitch → shadcn 转化质量门禁（P8）
# 用法: bash scripts/check-stitch-gate.sh
# 规则来源: docs/stitch-to-shadcn-plan.md 第 10 章
set -u

TARGET_DIR="apps/storefront/src/components/business"
LAYOUT_DIR="apps/storefront/src/components/layout"
FAIL=0

echo "== Stitch 转化质量门禁 =="

# 1. 硬编码尺寸（任意值 px）
if grep -rn -- '--\[[0-9]\+px\]' "$TARGET_DIR" "$LAYOUT_DIR" 2>/dev/null; then
  echo "FAIL: 业务/布局组件存在硬编码尺寸（w-[336px] 之类）"
  FAIL=1
else
  echo "PASS: 无硬编码尺寸"
fi

# 2. 硬编码十六进制颜色（排除注释行）
if grep -rn -- '#[0-9A-Fa-f]\{6\}' "$TARGET_DIR" "$LAYOUT_DIR" 2>/dev/null | grep -vE '^\S+:[0-9]+:\s*(//|\*|/\*)' | grep -vE ':\s*\*.*#'; then
  echo "FAIL: 业务/布局组件存在硬编码十六进制颜色"
  FAIL=1
else
  echo "PASS: 无硬编码颜色"
fi

# 3. 遗留 Material Symbols 图标字体
if grep -rni 'material-symbols' "$TARGET_DIR" "$LAYOUT_DIR" 2>/dev/null; then
  echo "FAIL: 存在 Material Symbols 遗留引用（应替换为 lucide-react）"
  FAIL=1
else
  echo "PASS: 无 Material Symbols 遗留"
fi

# 4. Tailwind CDN 遗留
if grep -rn 'cdn.tailwindcss.com' "$TARGET_DIR" "$LAYOUT_DIR" 2>/dev/null; then
  echo "FAIL: 存在 Tailwind CDN 引用"
  FAIL=1
else
  echo "PASS: 无 Tailwind CDN 引用"
fi

# 5. globals.css 必须包含令牌映射注释与关键变量
for tok in '--primary:' '--ring:' '--border:' 'primary'; do
  if ! grep -q -- "$tok" apps/storefront/src/app/globals.css 2>/dev/null; then
    echo "FAIL: globals.css 缺少令牌 $tok"
    FAIL=1
  fi
done
[ "$FAIL" -eq 0 ] && echo "PASS: 令牌文件完整"

# 6. 语义化令牌使用率抽查（业务组件应使用 primary/muted/accent 等语义色）
SEM_COUNT=$(grep -rEo '(bg|text|border)-(primary|muted|accent|destructive|secondary|card|chart-[1-5])(/[0-9]+)?' "$TARGET_DIR" 2>/dev/null | wc -l | tr -d ' ')
echo "INFO: 业务组件语义令牌引用次数 = $SEM_COUNT"
if [ "$SEM_COUNT" -lt 10 ]; then
  echo "WARN: 语义令牌引用偏少（<10），检查是否回退到任意值"
fi

if [ "$FAIL" -eq 1 ]; then
  echo "== 门禁未通过 =="
  exit 1
fi
echo "== 门禁全部通过 =="
