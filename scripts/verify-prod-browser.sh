#!/usr/bin/env bash
# scripts/verify-prod-browser.sh —— 公网页面的**真实浏览器**体检（渲染 + console 错误）。
#
# 与 verify-prod.sh / deploy-mvp.sh 的 verify_public 的关系：
#   那两者断言的是**内容特征**（HTTP 200 且正文含某串）。它们抓不住的一类是
#   ——**200、内容对，但页面在浏览器里是坏的**：JS 运行时报错、静态资源 404、
#   布局塌陷、组件根本没挂载。AGENTS.md 陷阱 3 记的「200 但内容错」是其中一种，
#   这里补的是「200、内容也对，但页面不可用」。
#
# 为什么是「打印规格」而不是直接跑断言：
#   dsh-pilot 是**进程内工具**（pilot_navigate/snapshot/act），没有 HTTP 接口，
#   bash 调不动它。所以本脚本负责把「该验什么」确定性地列出来，实际的浏览器操作
#   由 agent 用 pilot_* 工具执行，结果回填到下面同一份清单里。
#
#   这是刻意的分工：**判据在脚本里（可评审、可 diff），执行在 agent 里（能看渲染）**。
#   不要让 agent 自己决定验什么——那样每次标准都不一样。
#
# 用法：
#   bash scripts/verify-prod-browser.sh          # 打印验证规格
#   bash scripts/verify-prod-browser.sh --check  # 额外做无浏览器的前置检查
set -uo pipefail

HOST="${DRSELL_HOST:-wjclaw}"
CHECK=0
[[ "${1:-}" == "--check" ]] && CHECK=1

# 每个目标：URL | 期望在快照里出现的内容特征 | 该页特有的失败征兆
# 「内容特征」用于交叉验证浏览器渲染出的**文本**与 curl 断言一致——
# 两者都通过才算这一页真的活着。
TARGETS=(
  "https://drsell.szchada.top/|AI customer support|storefront 首页：应为营销页，不该是 /app 商家后台"
  "https://drsell.szchada.top/api/health|\"service\":\"drsell-api\"|API 健康检查：走 nginx → :5011"
  "https://ops.szchada.top/login|Drsell|运营台登录页：应为深色超管面，不是商家端"
)

echo "== verify-prod-browser：公网浏览器体检规格 =="
echo
echo "对每个目标，agent 应依次执行："
echo "  1. pilot_navigate goto <url>"
echo "  2. pilot_snapshot                      → 断言内容特征出现"
echo "  3. 读取 navigate 返回的 console errors → 必须为空"
echo "  4. pilot_screenshot                    → 存档供人复核"
echo "  5. pilot_close"
echo
echo "判定规则（任一不满足即本次部署验证失败）："
echo "  ✗ navigate 返回非 200 或被 origin 策略拒绝"
echo "  ✗ console errors 非空（404 静态资源、JS 异常都算）"
echo "  ✗ 快照里找不到内容特征"
echo
echo "目标清单："
printf '%s\n' "──────────────────────────────────────────────────────────────"
i=0
for t in "${TARGETS[@]}"; do
  i=$((i+1))
  IFS='|' read -r url needle note <<<"$t"
  printf '%d. %s\n' "$i" "$url"
  printf '   期望命中: %s\n' "$needle"
  printf '   说明:     %s\n' "$note"
done
printf '%s\n' "──────────────────────────────────────────────────────────────"
echo
echo "为什么 console 错误是硬判据："
echo "  内容断言看的是 HTML 文本，JS 报错不影响它；但顾客看到的是白屏或残页。"
echo "  静态资源 404 尤其典型——assetPrefix/nginx location 配错时，HTML 正常返回，"
echo "  /_next/ 下的 chunk 全 404，curl 断言全绿而页面根本不可用。"

if [[ "$CHECK" == "1" ]]; then
  echo
  echo "== 前置检查（无浏览器） =="
  fail=0
  for t in "${TARGETS[@]}"; do
    IFS='|' read -r url needle _ <<<"$t"
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$url" 2>/dev/null || echo 000)
    if [[ "$code" == "200" ]]; then
      echo "  ok  $url (HTTP $code)"
    else
      echo "  !!  $url (HTTP $code) —— 浏览器验证大概率也过不了"
      fail=1
    fi
  done
  if [[ "$fail" != "0" ]]; then
    echo
    echo "前置检查有失败项。先修连通性，再跑浏览器验证。"
    exit 1
  fi
  echo "前置检查通过。接着用 pilot_* 跑上面的规格。"
fi

echo
echo "提示：origin 必须已在 profile 的 cordis.patch.yml 里放行，否则 pilot_navigate"
echo "      会以 'origin ... was rejected by the user' 拒绝。改完 patch 需**重启** dsh web"
echo "      （config 在 apply() 时被捕获，热重载不会重读 patch 层）。"
