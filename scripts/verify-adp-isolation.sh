#!/usr/bin/env bash
# scripts/verify-adp-isolation.sh — 证明 adp_reader 的隔离真的成立。
# 用法：
#   ADMIN_DSN=postgres://medusa:pw@host:port/drsell \
#   ADP_DSN=postgres://adp_reader:pw@host:port/drsell \
#   SHOP_A=alpha.myshopify.com SHOP_B=beta.myshopify.com \
#   bash scripts/verify-adp-isolation.sh
set -uo pipefail

: "${ADMIN_DSN:?需要 ADMIN_DSN}"
: "${ADP_DSN:?需要 ADP_DSN}"
SHOP_A="${SHOP_A:-}"
SHOP_B="${SHOP_B:-}"

FAIL=0
pass(){ echo "  ✓ $1"; }
fail(){ echo "  ✗ $1"; FAIL=1; }
skip(){ echo "  ! SKIP $1"; }

echo "== verify-adp-isolation =="

assert_denied() {
  local tbl="$1"
  if ! psql "$ADMIN_DSN" -tAc "select 1 from \"$tbl\" limit 1" >/dev/null 2>&1; then
    fail "$tbl —— owner 也读不到，表名可能有误，断言无效"
    return
  fi
  local out
  out="$(psql "$ADP_DSN" -tAc "select 1 from \"$tbl\" limit 1" 2>&1)"
  if printf '%s' "$out" | grep -qiE "permission denied"; then
    pass "$tbl 对 adp_reader 拒绝访问"
  else
    fail "$tbl 未被拒绝 → $out"
  fi
}
for t in Shop products orders customers; do assert_denied "$t"; done

if [ "$(psql "$ADP_DSN" -tAc "select current_setting('is_superuser')" 2>&1)" = "off" ]; then
  pass "adp_reader 非超级用户"
else
  fail "adp_reader 是超级用户"
fi

if [ -z "$SHOP_A" ]; then
  skip "断言 9–11 需要 SHOP_A"
else
  if psql "$ADP_DSN" -tAc "select 1 from adp_shop_summary('$SHOP_A')" >/dev/null 2>&1; then
    pass "adp_shop_summary('$SHOP_A') 可执行"
  else
    fail "adp_shop_summary('$SHOP_A') 执行失败"
  fi

  expected="$(psql "$ADMIN_DSN" -tAc "
    select count(*) from products p join \"Shop\" s on s.\"tenantId\" = p.tenant_id
    where s.\"shopDomain\" = '$SHOP_A' and s.\"uninstalledAt\" is null
      and (p.shop_id is null or p.shop_id = s.id)" 2>&1)"
  actual="$(psql "$ADP_DSN" -tAc "select count(*) from adp_search_products('$SHOP_A', null, 50)" 2>&1)"
  if [ "$expected" = "$actual" ]; then
    pass "adp_search_products('$SHOP_A') 行数 $actual 与 owner 口径一致"
  else
    fail "行数不符：owner=$expected 函数=$actual"
  fi

  if [ "$(psql "$ADP_DSN" -tAc "select count(*) from adp_search_products('nope.myshopify.com', null, 50)" 2>&1)" = "0" ]; then
    pass "未知店铺返回 0 行"
  else
    fail "未知店铺返回了数据"
  fi

  cols="$(psql "$ADP_DSN" -tAc \
    "select pg_get_function_result(oid) from pg_proc where proname = 'adp_get_order'" 2>&1)"
  if printf '%s' "$cols" | grep -qiE "address|customer_id|total_tax"; then
    fail "adp_get_order 返回了应排除的字段：$cols"
  else
    pass "adp_get_order 未暴露地址/顾客ID/税额"
  fi
fi

if [ -z "$SHOP_B" ]; then
  skip "断言 10b 需要 SHOP_B —— 单店环境下最关键的跨店隔离断言未被验证"
else
  n="$(psql "$ADP_DSN" -tAc "
    select count(*) from (
      select name from adp_search_products('$SHOP_A', null, 50)
      intersect
      select name from adp_search_products('$SHOP_B', null, 50)
    ) t" 2>&1)"
  if [ "$n" = "0" ]; then
    pass "两店检索结果交集为空"
  else
    fail "两店结果有 $n 条重名——可能是跨店泄漏，也可能是真实重名，需人工判定"
  fi
fi

echo "== $([ "$FAIL" -eq 0 ] && echo 全部通过 || echo 存在失败) =="
exit "$FAIL"
