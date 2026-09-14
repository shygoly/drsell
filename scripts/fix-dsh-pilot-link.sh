#!/usr/bin/env bash
# scripts/fix-dsh-pilot-link.sh — 修复 dsh-pilot 在 DSH web profile 里的安装。
#
# 背景（2026-09-13 实测）：
#   `pnpm add dsh-pilot` 在这个 profile 上会产出一个**指向自己的符号链接**
#   （node_modules/dsh-pilot -> /…/node_modules/dsh-pilot），任何 import 都报
#   ELOOP ("Too many levels of symbolic links")。playwright-core 正常，只有
#   dsh-pilot 复现，是 pnpm hoisted linker 在这个包上的 bug。
#   即使手工删掉重链，pnpm 下次 install 又会重建同样的自指链接。
#
#   另外一个坑：cordis loader 解析插件入口时**不读 package.json 的 `main`**，
#   而是硬取 `<pkg>/index.js`。dsh-pilot 的入口是 lib/index.js，所以还需要在包
#   根补一个 index.js。
#
#   还有：插件必须位于 **node_modules 内部**，否则它自己 `import
#   '@deepseek-ai/schemastery'` 等 peer 依赖解析不到（链接到 node_modules 之外
#   实测失败）。
#
# 本脚本把这三条一次修好，幂等可重跑。`pnpm install --force` 之后、或 GUI 里
# pilot_* 工具消失时，跑一次即可。
set -euo pipefail

PROFILE_DIR="${DSH_PROFILE_DIR:-$HOME/.dsh/profiles/web}"
NM="$PROFILE_DIR/node_modules"
PKG="$NM/dsh-pilot"
REAL="$NM/dsh-pilot.real"

echo "== fix-dsh-pilot-link =="

if [ ! -f "$PROFILE_DIR/package.json" ]; then
  echo "✗ 找不到 profile：$PROFILE_DIR" >&2
  exit 1
fi

# 1. 取一份干净的包内容：优先用 pnpm 已下载的产物，否则从 npm 拉。
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if [ -f "$PKG/package.json" ] && [ ! -L "$PKG" ]; then
  echo "  · 复用已有 node_modules/dsh-pilot"
  cp -R "$PKG/." "$TMP/"
else
  echo "  · 从 registry 下载 dsh-pilot tgz"
  url="$(curl -sS https://registry.npmjs.org/dsh-pilot | python3 -c '
import json,sys
d=json.load(sys.stdin)
print(d["versions"][d["dist-tags"]["latest"]]["dist"]["tarball"])')"
  curl -sSL "$url" -o "$TMP/pkg.tgz"
  tar -xzf "$TMP/pkg.tgz" -C "$TMP" --strip-components=1
  rm -f "$TMP/pkg.tgz"
  echo "  · 下载 $url"
fi

if [ ! -f "$TMP/lib/index.js" ]; then
  echo "✗ 包里没有 lib/index.js，来源不对" >&2
  exit 1
fi

# 2. 落到 dsh-pilot.real（在 node_modules 内，peer 依赖才解析得到）
rm -rf "$REAL"
mkdir -p "$REAL"
cp -R "$TMP/." "$REAL/"

# 3. loader 硬取 <pkg>/index.js，不读 main —— 补一个。
if [ ! -e "$REAL/index.js" ]; then
  ln -s lib/index.js "$REAL/index.js"
  echo "  · 补 index.js → lib/index.js（loader 不读 main）"
fi

# 4. 用**相对**链接，避免绝对路径自指
rm -f "$PKG"
ln -s dsh-pilot.real "$PKG"
echo "  · dsh-pilot → dsh-pilot.real"

# 5. 验证：真的 import 一次，而不是只看文件在不在。
cd "$PROFILE_DIR"
if node --input-type=module -e "
import('dsh-pilot').then(m => {
  const need = ['Config','apply','inject','name'];
  const missing = need.filter(k => !(k in m));
  if (missing.length) { console.error('缺导出:', missing.join(',')); process.exit(1); }
  console.log('✓ import OK');
}).catch(e => { console.error('✗ import 失败:', e.code, e.message); process.exit(1); });
"; then
  echo "== 完成：dsh-pilot 链接已修复 =="
  echo "   若 GUI 里 pilot_* 工具仍不可见，重启 dsh web。"
else
  echo "✗ 修复后 import 仍失败" >&2
  exit 1
fi
