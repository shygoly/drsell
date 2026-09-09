#!/usr/bin/env bash
# scripts/verify-prod.sh —— 生产实况的只读体检。不改任何东西。
#
# 为什么要有它：本仓的验证规矩（AGENTS.md 陷阱 3、DEPLOY.md §4）此前只以文字存在，
# 每次核对都靠临时拼 ssh 命令——既不可复用，别人也复现不了。2026-09-09 一天之内
# 因此漏判过三次：误报部署成功、用裸 curl 判 OAuth 坏了、把「没有证据」当成
# 「证据表明没有」。这个脚本把那些判据固化成可执行的断言。
#
# 用法：
#   bash scripts/verify-prod.sh          # 全量体检，任一硬断言失败则 exit 1
#   bash scripts/verify-prod.sh --quiet  # 只打失败项
#
# 只读保证：全部是 GET / SELECT；不写库、不重启进程、不改配置。
# 输出只含指纹（sha256 前 12 位），绝不含密钥、令牌或连接串。
set -uo pipefail   # 故意不加 -e：所有检查都要跑完，一次看全，而不是停在第一个失败

# 本脚本的消息是中文，而 bash 在 `$var（` 这种写法里会把全角字符吞进变量名
# （2026-09-09 实测报「未绑定的变量」）。所以所有内插一律写 `${var}`。

HOST="${DRSELL_HOST:-wjclaw}"
REMOTE="${DRSELL_REMOTE:-/opt/drsell-run}"
QUIET=0
[[ "${1:-}" == "--quiet" ]] && QUIET=1

# 浏览器 UA 是必需的，不是讲究：@shopify/shopify-api 的 auth.begin() 开头有
# isbot(userAgent)，命中就返 410 且不设 Location，路由随即 500。
# curl 默认 UA 会被判成 bot——据此判过一次「OAuth 对所有店都坏了」，是假警报。
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
CLIENT_ID='0b36b70772220b71b2fe296b3deba914'   # AGENTS.md 陷阱 4：唯一合法身份

fails=0; warns=0
ok()   { [[ $QUIET -eq 1 ]] || printf '  \033[32mok\033[0m    %s\n' "$1"; }
bad()  { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; fails=$((fails+1)); }
warn() { printf '  \033[33mwarn\033[0m  %s\n' "$1"; warns=$((warns+1)); }
head_() { [[ $QUIET -eq 1 ]] || printf '\n\033[1m%s\033[0m\n' "$1"; }

# ── 1. 公网入口：必须走域名并断言内容 ───────────────────────────────
# 纯状态码覆盖不了「200 但内容是另一个站」——nginx location 指错时正是这样。
head_ "1. 公网入口（走域名 + 断言内容）"
check_public() {
  local url="$1" needle="$2" body code
  body=$(curl -sS --max-time 20 -A "$UA" -w $'\n%{http_code}' "$url" 2>/dev/null) || { bad "$url 无法访问"; return; }
  code="${body##*$'\n'}"; body="${body%$'\n'*}"
  if [[ "$code" != "200" ]]; then bad "$url → HTTP $code"; return; fi
  if [[ "$body" != *"$needle"* ]]; then bad "$url → 200 但内容不含 \"$needle\"（可能指错了应用）"; return; fi
  ok "$url （200，命中 \"$needle\"）"
}
check_public "https://drsell.szchada.top/"           "AI customer support"
check_public "https://drsell.szchada.top/api/health" '"service":"drsell-api"'
check_public "https://ops.szchada.top/login"         "Drsell"

# ── 2. OAuth 入口 ──────────────────────────────────────────────────
head_ "2. OAuth 入口（必须带浏览器 UA）"
oauth=$(curl -sS --max-time 20 -A "$UA" -o /dev/null -w '%{http_code} %{redirect_url}' \
  "https://drsell.szchada.top/api/auth?shop=example-store.myshopify.com" 2>/dev/null)
oauth_code="${oauth%% *}"; oauth_url="${oauth#* }"
if [[ "$oauth_code" != "307" && "$oauth_code" != "302" ]]; then
  bad "OAuth 入口 → HTTP ${oauth_code}（健康时应为 307 跳 Shopify 授权页）"
elif [[ "$oauth_url" != *"client_id=$CLIENT_ID"* ]]; then
  bad "OAuth 跳转的 client_id 不是唯一合法身份（AGENTS.md 陷阱 4）"
else
  ok "OAuth 入口 → ${oauth_code}，client_id 正确"
fi

# ── 3. 服务器侧只读查询 ────────────────────────────────────────────
# ops 接口要 superadmin。令牌在服务器上用 JWT_SECRET 现签、10 分钟过期、只读用途；
# 密钥不出服务器。
head_ "3. 部署与配置实况（ops 只读接口）"
payload=$(ssh -o ConnectTimeout=10 -o ServerAliveInterval=15 "$HOST" bash -s <<REMOTE_EOF 2>/dev/null
cd "$REMOTE/apps/api" || exit 9
T=\$(node -e '
const fs=require("fs"),crypto=require("crypto");
for(const l of fs.readFileSync(".env","utf8").split("\n")){const m=l.match(/^([A-Z0-9_]+)=(.*)\$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^"(.*)"\$/,"\$1");}
const b64=o=>Buffer.from(JSON.stringify(o)).toString("base64url");const n=Math.floor(Date.now()/1000);
const h=b64({alg:"HS256",typ:"JWT"}),p=b64({sub:"verify-prod",email:"verify@local",role:"superadmin",typ:"admin",iat:n,exp:n+600});
process.stdout.write(h+"."+p+"."+crypto.createHmac("sha256",process.env.JWT_SECRET).update(h+"."+p).digest("base64url"));
') || exit 9
printf '{"deploy":%s,"secret":%s,"gate":%s}' \\
  "\$(curl -sS -H "Authorization: Bearer \$T" http://127.0.0.1:5011/api/ops/deploy)" \\
  "\$(curl -sS -H "Authorization: Bearer \$T" http://127.0.0.1:5011/api/ops/webhook-secret)" \\
  "\$(curl -sS -H "Authorization: Bearer \$T" http://127.0.0.1:5011/api/ops/subscription-gate)"
REMOTE_EOF
)
if [[ -z "$payload" ]]; then
  bad "无法从 $HOST 读取 ops 接口（ssh 不通，或 API 未运行）"
else
  report=$(printf '%s' "$payload" | node "$(dirname "$0")/verify-prod-report.mjs" 2>&1) || true
  if [[ -z "$report" ]]; then
    bad "ops 接口返回无法解析"
  else
    while IFS='|' read -r level msg; do
      case "$level" in
        ok) ok "$msg" ;; warn) warn "$msg" ;; fail) bad "$msg" ;;
        *) [[ -n "${level:-}" ]] && ok "$level" ;;
      esac
    done <<< "$report"
  fi
fi

printf '\n'
if [[ $fails -gt 0 ]]; then
  printf '\033[31m%d 项失败\033[0m，%d 项提醒\n' "$fails" "$warns"
  exit 1
fi
printf '\033[32m全部通过\033[0m（%d 项提醒）\n' "$warns"
