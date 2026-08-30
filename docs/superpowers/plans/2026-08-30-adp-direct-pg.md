# ADP 直连 PG Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 ADP 智能体经 `adp_reader` 角色只读查询商家商品与订单，隔离性由脚本证明；替换 `upsertKnowledgeDocument` 那个返回假成功的 stub。

**Architecture:** `adp_reader` 对任何表零权限，只能执行三个 `SECURITY DEFINER` 函数。函数由 `drsell_app`（表属主）拥有，内部经 `"Shop"` 外键定位租户。SQL 无法强制 WHERE，但「只给函数、不给表」使调用方必须传店铺参数——租户作用域由此成为数据库层强制。

**Tech Stack:** PostgreSQL 16、plain SQL（`LANGUAGE sql` + `SECURITY DEFINER`）、bash 验证脚本、Docker（本地镜像环境）。零新增 npm 依赖。

**Spec:** [2026-08-30-adp-direct-pg-design.md](../specs/2026-08-30-adp-direct-pg-design.md)

---

## 前置事实（已实测，实施时无需重新验证）

| 事实 | 值 |
|---|---|
| 实际服务的 PG | wjclaw 上的 Docker 容器 **`cb_postgres`**（`postgres:16-alpine`，host 网络） |
| **不生效的配置** | `/etc/postgresql/16/main/*` 是 Debian 包残留，**改它无任何效果** |
| 生效的 `pg_hba` 末行 | `host all all all scram-sha-256` —— ADP **无需任何 pg_hba 改动即可连接** |
| `ssl` | `off` |
| `drsell_app` | `rolsuper=f`、**`rolcreaterole=f`**、`rolcreatedb=t`；拥有 `drsell` 库全部 14 张表 |
| `medusa` | `rolsuper=t` —— **建角色必须用它** |
| 表名 | `products` / `orders` / `customers` 为小写；其余为 `"Shop"` / `"Tenant"` 等带引号 PascalCase |
| `updatedAt` / `updated_at` | Prisma 的 `@updatedAt` **不产生 DB 默认值**，种子数据必须显式赋值 |
| 本地工具 | Docker 28.5.1 ✓、psql 15.14 ✓ |

## 文件结构

| 文件 | 职责 |
|---|---|
| `apps/api/prisma/sql/adp-reader.sql` | 撤权 + 三个函数 + 授权。幂等，**不含密码、不含 CREATE ROLE** |
| `scripts/setup-adp-reader.sh` | 用 admin 连接建角色注密码，再执行上面的 SQL |
| `scripts/verify-adp-isolation.sh` | 12 条断言。**这是本计划的测试** |
| `scripts/dev-pg-up.sh` | 起本地镜像环境（含权限结构镜像 + 双店铺种子） |
| `apps/api/prisma/sql/seed-adp-test.sql` | 双租户双店铺种子，供跨店隔离断言使用 |
| `docs/adp-pg-access.md` | 运维手册：生效配置位置、收窄建议、密码轮换 |

> **TDD 映射**：本项目无单元测试框架，`verify-adp-isolation.sh` 就是测试。
> 每个 Task 先加断言、跑出红，再实现、跑出绿。

---

## Chunk 1：本地镜像环境与失败的验证

### Task 1：本地 PG 镜像生产权限结构

**Files:**
- Create: `scripts/dev-pg-up.sh`, `apps/api/prisma/sql/seed-adp-test.sql`

- [ ] **Step 1: 写 `scripts/dev-pg-up.sh`**

容器超级用户命名为 `medusa`、库属主为非超级用户 `drsell_app`，**与生产一致**。
若本地用 `POSTGRES_USER=drsell_app`，它会成为超级用户，测试将无法证明生产行为。

```bash
#!/usr/bin/env bash
# 起本地 PG，镜像 wjclaw 的权限结构：medusa=超级用户，drsell_app=非超级用户且无 CREATEROLE。
set -euo pipefail

NAME="${PG_CONTAINER:-drsell-pg-test}"
PORT="${PG_PORT:-55433}"
ADMIN_PW="${PG_ADMIN_PASSWORD:-devadmin}"
APP_PW="${PG_APP_PASSWORD:-devapp}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ -n "$(docker ps -aq -f name="^${NAME}$")" ]; then
  echo "容器 ${NAME} 已存在，先删除以保证干净起点"
  docker rm -f "$NAME" >/dev/null
fi

docker run -d --name "$NAME" \
  -e POSTGRES_USER=medusa \
  -e POSTGRES_PASSWORD="$ADMIN_PW" \
  -e POSTGRES_DB=postgres \
  -p "${PORT}:5432" \
  postgres:16-alpine >/dev/null

echo -n "等待 PG 就绪"
for _ in $(seq 1 30); do
  if docker exec "$NAME" pg_isready -U medusa -d postgres >/dev/null 2>&1; then break; fi
  echo -n "."; sleep 1
done
echo

ADMIN="postgres://medusa:${ADMIN_PW}@127.0.0.1:${PORT}/postgres"
psql "$ADMIN" -v ON_ERROR_STOP=1 -v pw="$APP_PW" <<'SQL'
CREATE ROLE drsell_app LOGIN PASSWORD :'pw' NOSUPERUSER NOCREATEROLE CREATEDB;
SQL
psql "$ADMIN" -v ON_ERROR_STOP=1 -c 'CREATE DATABASE drsell OWNER drsell_app'

APP_DSN="postgres://drsell_app:${APP_PW}@127.0.0.1:${PORT}/drsell"
echo "应用 Prisma schema..."
( cd "$ROOT" && DATABASE_URL="$APP_DSN" pnpm --filter @drsell/api exec prisma db push --skip-generate )

echo "灌入测试种子..."
psql "$APP_DSN" -v ON_ERROR_STOP=1 -f "$ROOT/apps/api/prisma/sql/seed-adp-test.sql"

cat <<EOF

本地环境就绪：
  ADMIN_DSN=postgres://medusa:${ADMIN_PW}@127.0.0.1:${PORT}/drsell
  APP_DSN=${APP_DSN}
EOF
```

- [ ] **Step 2: 写 `apps/api/prisma/sql/seed-adp-test.sql`**

两个租户各一个店铺，商品名刻意互不重叠，使跨店交集断言有意义。
`updated_at` / `"updatedAt"` 必须显式赋值——Prisma 的 `@updatedAt` 不产生 DB 默认值。

```sql
-- 双租户双店铺测试种子。幂等：先清后插。
BEGIN;

DELETE FROM orders   WHERE tenant_id IN ('t_alpha','t_beta');
DELETE FROM products WHERE tenant_id IN ('t_alpha','t_beta');
DELETE FROM "Shop"   WHERE id IN ('s_alpha','s_beta');
DELETE FROM "Tenant" WHERE id IN ('t_alpha','t_beta');

INSERT INTO "Tenant"(id, name, "createdAt", "updatedAt") VALUES
  ('t_alpha','Alpha Store', now(), now()),
  ('t_beta', 'Beta Store',  now(), now());

INSERT INTO "Shop"(id, "shopDomain", "tenantId", "accessToken", "installedAt", "createdAt", "updatedAt") VALUES
  ('s_alpha','alpha.myshopify.com','t_alpha','shpat_ALPHA_SECRET', now(), now(), now()),
  ('s_beta', 'beta.myshopify.com', 't_beta', 'shpat_BETA_SECRET',  now(), now(), now());

INSERT INTO products(id, tenant_id, shop_id, shopify_product_id, name, price, description,
                     category, stock, handle, vendor, status, tags,
                     synced_at, created_at, updated_at) VALUES
  ('p_a1','t_alpha','s_alpha','gid://1','Alpha Running Shoe', 79.90,'Lightweight running shoe','shoes',12,'alpha-run','AlphaCo','ACTIVE','sport,shoes', now(),now(),now()),
  ('p_a2','t_alpha','s_alpha','gid://2','Alpha Yoga Mat',     29.50,'Non-slip yoga mat',       'fitness',30,'alpha-mat','AlphaCo','ACTIVE','yoga',      now(),now(),now()),
  ('p_a3','t_alpha',NULL,     'gid://3','Alpha Legacy Item',   9.90,'No shop_id on purpose',   'misc',    5,'alpha-legacy','AlphaCo','ACTIVE','legacy', now(),now(),now()),
  ('p_b1','t_beta', 's_beta', 'gid://4','Beta Coffee Grinder',49.00,'Burr grinder',            'kitchen',  8,'beta-grind','BetaCo','ACTIVE','coffee',  now(),now(),now()),
  ('p_b2','t_beta', 's_beta', 'gid://5','Beta Espresso Cup',  12.00,'Ceramic cup',             'kitchen', 40,'beta-cup','BetaCo','ACTIVE','coffee',    now(),now(),now());

INSERT INTO orders(id, tenant_id, shop_id, shopify_order_id, status, financial_status,
                   fulfillment_status, total, billing_address, shipping_address,
                   shopify_created_at, synced_at, created_at, updated_at) VALUES
  ('o_a1','t_alpha','s_alpha','1001','open','paid','fulfilled',   109.40,'ALPHA BILLING PII','ALPHA SHIPPING PII', now(),now(),now(),now()),
  ('o_b1','t_beta', 's_beta', '2001','open','pending','unfulfilled',61.00,'BETA BILLING PII', 'BETA SHIPPING PII',  now(),now(),now(),now());

COMMIT;
```

- [ ] **Step 3: 起环境**

Run: `bash scripts/dev-pg-up.sh`
Expected: 打印 `本地环境就绪` 与两个 DSN。若 `prisma db push` 报 Prisma Client 缺失，先跑
`pnpm --filter @drsell/api exec prisma generate`（试点报告 §10 #12 记过这个坑）。

- [ ] **Step 4: 核对权限结构与生产一致**

Run:
```bash
psql "postgres://medusa:devadmin@127.0.0.1:55433/drsell" -tAc \
  "select rolname, rolsuper, rolcreaterole from pg_roles where rolname in ('medusa','drsell_app') order by 1"
```
Expected：
```
drsell_app|f|f
medusa|t|t
```
`drsell_app` 两列都必须是 `f`。若为 `t`，说明容器建反了，测试将无法证明生产行为——**必须修正后再继续**。

- [ ] **Step 5: Commit**

```bash
git add scripts/dev-pg-up.sh apps/api/prisma/sql/seed-adp-test.sql
git commit -m "test: 本地 PG 镜像环境（镜像生产权限结构 + 双店铺种子）"
```

---

### Task 2：验证脚本骨架 + 表权限断言（先红）

**Files:**
- Create: `scripts/verify-adp-isolation.sh`

- [ ] **Step 1: 写脚本**

关键设计：每条「必须被拒」的断言分两步——先以 owner 确认表存在，再以 `adp_reader` 确认被拒。
只测第二步会让「表名写错 → relation does not exist」伪装成通过。

```bash
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

# 断言 1–8：四张表，各两步
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

# 断言 12：不得是超级用户
if [ "$(psql "$ADP_DSN" -tAc "select current_setting('is_superuser')" 2>&1)" = "off" ]; then
  pass "adp_reader 非超级用户"
else
  fail "adp_reader 是超级用户"
fi

# 断言 9：函数可执行
if [ -z "$SHOP_A" ]; then
  skip "断言 9–11 需要 SHOP_A"
else
  if psql "$ADP_DSN" -tAc "select 1 from adp_shop_summary('$SHOP_A')" >/dev/null 2>&1; then
    pass "adp_shop_summary('$SHOP_A') 可执行"
  else
    fail "adp_shop_summary('$SHOP_A') 执行失败"
  fi

  # 断言 10a：函数返回行数 == owner 口径行数（多返回即为越权泄漏）
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

  # 断言 11：不存在的店铺返回 0 行
  if [ "$(psql "$ADP_DSN" -tAc "select count(*) from adp_search_products('nope.myshopify.com', null, 50)" 2>&1)" = "0" ]; then
    pass "未知店铺返回 0 行"
  else
    fail "未知店铺返回了数据"
  fi
fi

# 断言 10b：两店结果交集为空（需两个店铺且商品名不重叠）
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
```

- [ ] **Step 2: 跑出红**

Run:
```bash
ADMIN_DSN="postgres://medusa:devadmin@127.0.0.1:55433/drsell" \
ADP_DSN="postgres://adp_reader:devadp@127.0.0.1:55433/drsell" \
SHOP_A=alpha.myshopify.com SHOP_B=beta.myshopify.com \
bash scripts/verify-adp-isolation.sh
```
Expected: 退出 1。`adp_reader` 角色尚不存在，所有以 `ADP_DSN` 发起的断言都会失败。
**这正是要看到的**——证明断言不会在空实现下伪装通过。

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-adp-isolation.sh
git commit -m "test: adp_reader 隔离验证脚本（当前全红）"
```

---

## Chunk 2：角色与函数

### Task 3：角色与撤权 → 断言 1–8、12 转绿

**Files:**
- Create: `apps/api/prisma/sql/adp-reader.sql`, `scripts/setup-adp-reader.sh`
- Modify: `apps/api/.env.example`

- [ ] **Step 1: 写 `apps/api/prisma/sql/adp-reader.sql`（本轮只含撤权部分）**

```sql
-- ADP 智能体只读接入：函数式访问，零表权限。
-- 幂等，可重复执行。不含密码，不含 CREATE ROLE（角色创建见 setup-adp-reader.sh）。
\set ON_ERROR_STOP on

ALTER ROLE adp_reader CONNECTION LIMIT 5;
ALTER ROLE adp_reader SET statement_timeout = '5s';
ALTER ROLE adp_reader SET idle_in_transaction_session_timeout = '10s';

-- 表默认只有 owner 有权，无需撤销；此处显式撤一遍以防历史授权残留。
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM adp_reader;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM adp_reader;
-- PG 默认把 EXECUTE 授予 PUBLIC，必须连 PUBLIC 一起撤，否则任何角色都能调函数。
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM adp_reader;

GRANT USAGE ON SCHEMA public TO adp_reader;
```

- [ ] **Step 2: 写 `scripts/setup-adp-reader.sh`**

角色创建需要 `CREATEROLE`（生产上只有 `medusa` 有），函数创建需由表属主 `drsell_app` 执行。
超级用户 `medusa` 两件事都能做，故统一用 `ADMIN_DSN`，再显式把函数属主改成 `drsell_app`。

```bash
#!/usr/bin/env bash
# 创建 adp_reader 角色并应用 adp-reader.sql。
# 用法：ADMIN_DSN=... ADP_READER_PASSWORD=... bash scripts/setup-adp-reader.sh
set -euo pipefail

: "${ADMIN_DSN:?需要 ADMIN_DSN（须具备 CREATEROLE，生产上为 medusa）}"
: "${ADP_READER_PASSWORD:?需要 ADP_READER_PASSWORD}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

exists="$(psql "$ADMIN_DSN" -tAc "select 1 from pg_roles where rolname='adp_reader'")"
if [ -z "$exists" ]; then
  psql "$ADMIN_DSN" -v ON_ERROR_STOP=1 -v pw="$ADP_READER_PASSWORD" \
    -c "CREATE ROLE adp_reader LOGIN PASSWORD :'pw' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT"
  echo "已创建角色 adp_reader"
else
  psql "$ADMIN_DSN" -v ON_ERROR_STOP=1 -v pw="$ADP_READER_PASSWORD" \
    -c "ALTER ROLE adp_reader LOGIN PASSWORD :'pw' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT"
  echo "已更新角色 adp_reader 密码与属性"
fi

psql "$ADMIN_DSN" -v ON_ERROR_STOP=1 -f "$ROOT/apps/api/prisma/sql/adp-reader.sql"
echo "adp-reader.sql 应用完成"
```

- [ ] **Step 3: `apps/api/.env.example` 追加键名（无值）**

```
ADP_READER_PASSWORD=""
```

- [ ] **Step 4: 执行并跑验证**

Run:
```bash
ADMIN_DSN="postgres://medusa:devadmin@127.0.0.1:55433/drsell" \
ADP_READER_PASSWORD=devadp bash scripts/setup-adp-reader.sh

ADMIN_DSN="postgres://medusa:devadmin@127.0.0.1:55433/drsell" \
ADP_DSN="postgres://adp_reader:devadp@127.0.0.1:55433/drsell" \
SHOP_A=alpha.myshopify.com SHOP_B=beta.myshopify.com \
bash scripts/verify-adp-isolation.sh
```
Expected: 退出仍为 1，但**断言 1–8 与 12 已转绿**（四张表全部 permission denied、非超级用户）。
断言 9–11 仍红——函数还没建。

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/sql/adp-reader.sql scripts/setup-adp-reader.sh apps/api/.env.example
git commit -m "feat: adp_reader 角色与零表权限撤权"
```

---

### Task 4：`adp_shop_summary` → 断言 9 转绿

**Files:**
- Modify: `apps/api/prisma/sql/adp-reader.sql`

- [ ] **Step 1: 追加函数**

`SECURITY DEFINER` 必须固定 `search_path`，否则可被 search_path 劫持。

> **命名风险**：`RETURNS TABLE` 的输出列名（`name`、`price`、`status` …）与表列同名。
> 函数体内**每一处列引用都必须带表别名前缀**（`p.name` 而非 `name`），
> 否则 PG 可能报 `column reference is ambiguous`。本计划中的函数体已全部限定；
> 若执行时仍报该错，是限定漏了某处，补上别名即可，**不要改输出列名**——
> ADP 侧要靠这些列名读数据。

```sql
CREATE OR REPLACE FUNCTION adp_shop_summary(p_shop text)
RETURNS TABLE (
  product_count bigint,
  categories    text,
  price_min     numeric,
  price_max     numeric,
  last_synced   timestamp
) LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $fn$
  SELECT count(*),
         string_agg(DISTINCT p.category, ', ' ORDER BY p.category),
         min(p.price),
         max(p.price),
         max(p.synced_at)
  FROM products p
  JOIN "Shop" s ON s."tenantId" = p.tenant_id
  WHERE s."shopDomain" = p_shop
    AND s."uninstalledAt" IS NULL
    AND (p.shop_id IS NULL OR p.shop_id = s.id);
$fn$;

ALTER FUNCTION adp_shop_summary(text) OWNER TO drsell_app;
REVOKE ALL ON FUNCTION adp_shop_summary(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION adp_shop_summary(text) TO adp_reader;
```

- [ ] **Step 2: 重跑 setup + 验证**

Run: 同 Task 3 Step 4 的两条命令
Expected: 断言 9 转绿；10–11 仍红。

- [ ] **Step 3: 手工确认属主正确**

Run:
```bash
psql "postgres://medusa:devadmin@127.0.0.1:55433/drsell" -tAc \
  "select proname, pg_get_userbyid(proowner), prosecdef from pg_proc where proname like 'adp_%'"
```
Expected: `adp_shop_summary|drsell_app|t`。属主若是 `medusa`，函数将以超级用户身份执行——
**必须修正**，否则 `SECURITY DEFINER` 会绕过一切限制。

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/sql/adp-reader.sql
git commit -m "feat: adp_shop_summary 函数"
```

---

### Task 5：`adp_search_products` → 断言 10、11 转绿

**Files:**
- Modify: `apps/api/prisma/sql/adp-reader.sql`

- [ ] **Step 1: 追加函数**

```sql
CREATE OR REPLACE FUNCTION adp_search_products(
  p_shop text, p_query text DEFAULT NULL, p_limit int DEFAULT 20
) RETURNS TABLE (
  name text, price numeric, stock int, category text,
  vendor text, handle text, status text, tags text, description text
) LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $fn$
  SELECT p.name, p.price, p.stock, p.category,
         p.vendor, p.handle, p.status, p.tags, left(p.description, 500)
  FROM products p
  JOIN "Shop" s ON s."tenantId" = p.tenant_id
  WHERE s."shopDomain" = p_shop
    AND s."uninstalledAt" IS NULL
    AND (p.shop_id IS NULL OR p.shop_id = s.id)
    AND (p_query IS NULL OR p_query = ''
         OR p.name        ILIKE '%' || p_query || '%'
         OR p.category    ILIKE '%' || p_query || '%'
         OR p.tags        ILIKE '%' || p_query || '%'
         OR p.description ILIKE '%' || p_query || '%')
  ORDER BY p.name
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
$fn$;

ALTER FUNCTION adp_search_products(text, text, int) OWNER TO drsell_app;
REVOKE ALL ON FUNCTION adp_search_products(text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION adp_search_products(text, text, int) TO adp_reader;
```

- [ ] **Step 2: 重跑 setup + 验证**

Expected: **全部 12 条断言通过，退出 0。**
断言 10a 的期望值为 3（Alpha 的 `p_a1`/`p_a2` 加上 `shop_id IS NULL` 的 `p_a3`）。

- [ ] **Step 3: 确认敏感数据确实取不到**

Run:
```bash
psql "postgres://adp_reader:devadp@127.0.0.1:55433/drsell" -tAc \
  "select * from adp_search_products('alpha.myshopify.com', null, 50)" | grep -i "SECRET\|PII" && echo "泄漏" || echo "无敏感字段泄漏"
```
Expected: `无敏感字段泄漏`（种子里的 `shpat_ALPHA_SECRET` 与 `ALPHA BILLING PII` 都不该出现）。

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/sql/adp-reader.sql
git commit -m "feat: adp_search_products 函数（跨店隔离已验证）"
```

---

### Task 6：`adp_get_order`

**Files:**
- Modify: `apps/api/prisma/sql/adp-reader.sql`, `scripts/verify-adp-isolation.sh`

- [ ] **Step 1: 先加断言（地址字段必须不可得）**

在 `verify-adp-isolation.sh` 的 `SHOP_A` 分支内追加：

```bash
  cols="$(psql "$ADP_DSN" -tAc \
    "select pg_get_function_result(oid) from pg_proc where proname = 'adp_get_order'" 2>&1)"
  if printf '%s' "$cols" | grep -qiE "address|customer_id|total_tax"; then
    fail "adp_get_order 返回了应排除的字段：$cols"
  else
    pass "adp_get_order 未暴露地址/顾客ID/税额"
  fi
```

- [ ] **Step 2: 跑出红**

Expected: 该断言失败（函数不存在，`cols` 为空或报错）。

- [ ] **Step 3: 追加函数**

```sql
CREATE OR REPLACE FUNCTION adp_get_order(p_shop text, p_order_id text)
RETURNS TABLE (
  shopify_order_id   text,
  status             text,
  financial_status   text,
  fulfillment_status text,
  total              numeric,
  ordered_at         timestamp
) LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $fn$
  SELECT o.shopify_order_id, o.status, o.financial_status,
         o.fulfillment_status, o.total, o.shopify_created_at
  FROM orders o
  JOIN "Shop" s ON s."tenantId" = o.tenant_id
  WHERE s."shopDomain" = p_shop
    AND s."uninstalledAt" IS NULL
    AND (o.shop_id IS NULL OR o.shop_id = s.id)
    AND o.shopify_order_id = p_order_id;
$fn$;

ALTER FUNCTION adp_get_order(text, text) OWNER TO drsell_app;
REVOKE ALL ON FUNCTION adp_get_order(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION adp_get_order(text, text) TO adp_reader;
```

- [ ] **Step 4: 转绿 + 跨店抽查**

Run:
```bash
psql "postgres://adp_reader:devadp@127.0.0.1:55433/drsell" -tAc \
  "select count(*) from adp_get_order('alpha.myshopify.com','2001')"
```
Expected: `0` —— Alpha 店查不到 Beta 店的订单 `2001`。

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/sql/adp-reader.sql scripts/verify-adp-isolation.sh
git commit -m "feat: adp_get_order 函数（排除地址与顾客标识）"
```

---

## Chunk 3：应用侧、登记、交付

### Task 7：stub 改为显式失败

**Files:**
- Modify: `packages/adp/src/index.ts`, `apps/api/src/shopify/shopify.service.ts`

- [ ] **Step 1: 改 `upsertKnowledgeDocument`**

当前实现校验参数后 `return { ok: true }` 而从不发请求，导致 `KnowledgeSyncJob` 标记成功、
onboarding 向商家显示「同步完成」。直连方案下商品知识**不再需要同步**，继续保留
一个「看起来成功」的空操作就是继续对商家撒谎。

```ts
  /**
   * 知识库文档上传。
   *
   * 已停用：ADP 智能体改为经 adp_reader 角色直连 PG 实时查询（ADR-7），
   * 商品知识不再向 ADP 单向同步。调用方应改为不再调用本方法。
   */
  async upsertKnowledgeDocument(_params: {
    appKey: string;
    title: string;
    content: string;
    externalId: string;
  }): Promise<never> {
    throw new Error(
      'ADP 知识库上传已停用：智能体改为直连 PG 实时查询（见 ADR-7）。' +
        '此前的实现从不发送请求却返回成功，属误导，已移除。',
    );
  }
```

- [ ] **Step 2: 调用方标记为 skipped 而非 ok**

`apps/api/src/shopify/shopify.service.ts:546` 调用 `this.adp.syncKnowledge(...)`。
改为不再调用，并把该 kind 的 job 状态写为 `skipped`，附说明。
**具体改法需先读 536–556 行的上下文**，保持既有 job 生命周期不被破坏。

- [ ] **Step 3: 类型检查**

Run: `pnpm --filter @drsell/api exec tsc -p tsconfig.json --noEmit`
Expected: 0 error。若报 `PrismaService.xxx 不存在`，先跑
`pnpm --filter @drsell/api exec prisma generate`（试点报告 §10 #12）。

- [ ] **Step 4: Commit**

```bash
git add packages/adp/src/index.ts apps/api/src/shopify/shopify.service.ts
git commit -m "fix: 停用返回假成功的知识库上传 stub，改为显式失败"
```

---

### Task 8：元语登记 `ADR-7` / `INV-2`

**Files:**
- Modify: `DECISIONS.md`

- [ ] **Step 1: §1 INV 表追加**

```
| `INV-2` | `adp_reader` 不得持有任何表、视图或序列的权限 | `scripts/verify-adp-isolation.sh` 断言 1–8 |
```

- [ ] **Step 2: §2 ADR 表追加**

```
| `ADR-7` | ADP 智能体经 `adp_reader` 直连 PG，仅可执行 `adp_*` 函数 | `apps/api/prisma/sql/adp-reader.sql` | 已守护 |
```

- [ ] **Step 3: 更新 §0 命名空间表的数量列**

`INV-n` 由 1 改为 2，`ADR-n` 由 6 改为 7。

- [ ] **Step 4: 门禁必须仍绿**

Run: `pnpm spec`
Expected: 4/4 通过，退出 0。

`check-ratchet` 的 `unconfigured_adr` 应仍为 `3`——`ADR-7` 状态是「已守护」，
不增加欠账。**若该值变成 4，说明状态列写成了「未配」，退回改正**。

- [ ] **Step 5: Commit**

```bash
git add DECISIONS.md && git commit -m "docs: 登记 ADR-7 / INV-2"
```

---

### Task 9：运维手册

**Files:**
- Create: `docs/adp-pg-access.md`

- [ ] **Step 1: 写手册**

必须包含且**不得省略**以下四点：

1. **生效配置在容器内**：`docker exec cb_postgres cat /var/lib/postgresql/data/pg_hba.conf`。
   `/etc/postgresql/16/main/` 是 Debian 包残留，**改它无任何效果**——这是本项目实测踩过的坑。
2. **ADP 无需任何 pg_hba 改动**：末行 `host all all all scram-sha-256` 已允许任意来源。
3. **收窄建议**（用户自行决定是否执行，影响同实例的 `medusa_db` / `pubmedclaw` / `sapbasic`）：
   把末行替换为按库/角色/来源的具体条目，并开启 `ssl`（当前 `off`，查询结果在公网明文传输）。
   Reload：`docker exec cb_postgres psql -U medusa -d postgres -c 'select pg_reload_conf()'`
4. **密码轮换**：重跑 `setup-adp-reader.sh` 并换新 `ADP_READER_PASSWORD` 即可（脚本幂等），
   随后在 ADP 控制台更新连接配置。

- [ ] **Step 2: Commit**

```bash
git add docs/adp-pg-access.md && git commit -m "docs: ADP 直连 PG 运维手册"
```

---

### Task 10：部署到 wjclaw 并验收

> **前置阻塞**：本 Task 开始前必须先确认 **ADP 智能体支持自定义 SQL 调用函数**。
> 若 ADP 只能浏览表、无法执行 `select * from adp_search_products(...)`，
> 函数式方案不可用，**须停下回到设计阶段**，不要改用授予表权限来绕过——
> 那会直接推翻 `INV-2` 和整个隔离设计。

- [ ] **Step 1: 生产建角色**

密码自行生成，不要复用本地的 `devadp`：

```bash
ssh wjclaw 'docker exec -i cb_postgres psql -U medusa -d drsell' < apps/api/prisma/sql/adp-reader.sql
```
角色创建先单独执行（`setup-adp-reader.sh` 需要能连到生产；若本机不便直连，
把脚本 rsync 到 wjclaw 上以容器内 `psql` 执行）。

- [ ] **Step 2: 生产跑验证**

Run（在 wjclaw 上，经 `127.0.0.1` 连接）：
```bash
ADMIN_DSN="postgres://medusa:<pw>@127.0.0.1:5432/drsell" \
ADP_DSN="postgres://adp_reader:<pw>@127.0.0.1:5432/drsell" \
SHOP_A="<真实店铺域名>" \
bash scripts/verify-adp-isolation.sh
```
Expected: 断言 1–9、11、12 通过。断言 10b 大概率 SKIP（生产可能只有一个店铺）——
**SKIP 必须被明确打印并记录，不得当作通过**。

- [ ] **Step 3: 多店铺隐患抽查**

Run:
```bash
ssh wjclaw 'docker exec cb_postgres psql -U medusa -d drsell -tAc "select tenant_id, count(*) from \"Shop\" group by 1 having count(*) > 1"'
```
Expected: 无输出。若有输出，说明存在一租户多店铺，`shop_id IS NULL` 的历史商品会跨店可见
（spec §残留风险 #2），须先回填 `shop_id` 再上线。

- [ ] **Step 4: 全量门禁**

Run: `pnpm spec && pnpm spec:negative`
Expected: 两条都退出 0。

- [ ] **Step 5: Commit**

```bash
git commit --allow-empty -m "chore: ADP 直连 PG 验收通过"
```

---

## 完成判据

1. 本地 `bash scripts/verify-adp-isolation.sh` 12 条断言全过，退出 0
2. `setup-adp-reader.sh` 重跑仍成功（幂等）
3. `adp_search_products` 结果中不含 `shpat_`、地址、顾客标识
4. 三个函数属主均为 `drsell_app`、`prosecdef = t`
5. `pnpm spec` 4/4 绿，`ADR-7` / `INV-2` 在册，`unconfigured_adr` 仍为 3
6. `docs/adp-pg-access.md` 明确写出「生效配置在容器内」这一坑
7. 生产验证通过，且断言 10b 若 SKIP 已被明确记录

## 交接

- **子项目 B**（`TBD-1` 决策 + 商家看板）与 **C**（真实 Inbox）见 spec 附录 A
- **未处理但已知的高优先级风险**（均超出本子项目范围）：
  1. PG 实例对全网开放认证、`ssl = off`、无防火墙，且与两个超级用户角色共用实例
  2. `Shop.accessToken` 明文存储（已单独挂任务）
