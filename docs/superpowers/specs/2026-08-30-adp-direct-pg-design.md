# ADP 智能体直连 PG（子项目 A）— Design Spec

**Date:** 2026-08-30
**Status:** Approved
**子项目:** P1 分解的第 A 项（共 3 项，见附录 A）
**依据:** `docs/MVP_SCOPE.md` P1「产品/订单/客户同步 → ADP 知识库」

## Summary

让 ADP 智能体能实时查询商家的商品与订单数据，替换 `packages/adp/src/index.ts` 中
`upsertKnowledgeDocument` 那个**返回假成功、从不发 HTTP 请求**的 stub。

接入方式为 **PostgreSQL 直连 + 函数式只读访问**：`adp_reader` 角色对任何表和视图
零权限，只能执行三个 `SECURITY DEFINER` 函数。SQL 无法强制 WHERE 子句，
但「只给函数、不给表」使 ADP **必须传店铺参数**才拿得到数据——
租户作用域由此从约定变为数据库层强制，`Shop.accessToken` 也从根上不可达。

## 锁定决策

| 议题 | 结论 | 备注 |
|---|---|---|
| 接入方式 | PG 直连，函数式只读 | 用户在知情残留风险后选定（见 §残留风险） |
| 隔离机制 | 零表权限 + `SECURITY DEFINER` 函数强制传店铺 | 直连前提下的最强隔离 |
| `customers` 表 | **完全不开放** | 顾客姓名/邮箱/电话无检索必要 |
| 地址字段 | `orders.billing_address` / `shipping_address` 排除 | PII |
| 连接层变更 | **无需变更**，实例已对全网开放认证 | 收窄建议写入运维手册，由用户执行 |
| 传输加密 | 当前 `ssl = off`，**无加密** | 开启 TLS 属跨项目运维决定，不在本子项目内 |

## 目标

- ADP 智能体能按店铺检索商品、查订单状态、取店铺概览
- `adp_reader` 无法读取任何表——包括 `"Shop"`（存 Shopify access token）
- 隔离性由可重复执行的脚本证明，而非靠代码审查相信
- 脚本幂等，可安全重跑

## 非目标（防镀金，违反会被拒绝合并）

1. **不修改 `pg_hba.conf` 或防火墙**：这是安全配置变更，由用户执行。本 spec 只提供需要添加的配置行文本。
2. **不开放 `customers` 表**：即使加了脱敏也不开。AI 客服回答商品问题不需要顾客名单。
3. **不做应用层 HTTP 工具接口**：那是已被否决的备选方案，不要"顺手也做一个"。
4. **不处理 `Shop.accessToken` 明文存储**：真实问题，但属独立任务，不在本子项目范围。
5. **不删除 `upsertKnowledgeDocument` stub**：本轮只让它显式失败（见 §交付物 ⑤），彻底移除留给调用方改造完成后。

## 前置事实（已实测）

| 事实 | 值 |
|---|---|
| 部署主机 | `wjclaw` = 163.7.7.160，`drsell-api` / `drsell-web` 由 pm2 托管 |
| **实际服务的 PG** | Docker 容器 `cb_postgres`（`postgres:16-alpine`，host 网络）。`/etc/postgresql/16/main` 是**不生效**的 Debian 包配置，勿改 |
| 生效的 `pg_hba.conf` | 容器内 `/var/lib/postgresql/data/pg_hba.conf`，末行为 **`host all all all scram-sha-256`**——任意来源 IP、任意库、任意角色 |
| `listen_addresses` / `ssl` | `'*'` / **`off`**（无传输加密） |
| 实例上的库 | `drsell`(owner `drsell_app`)、`medusa_db`、`postgres`、`pubmedclaw`、`sapbasic` —— **多项目共用实例** |
| 可登录角色 | `drsell_app`(非super)、`openclaw_mcp`(非super)、`medusa`(**super**)、`pubmedclaw`(**super**) |
| 主机防火墙 | `firewall-cmd` / `ufw` / `iptables` 查询均无输出——无第二层防护 |
| 表名映射 | 仅 `Product`/`Order`/`Customer` 有 `@@map`（→ `products`/`orders`/`customers`，snake_case 列）；其余为 Prisma 默认 PascalCase 带引号表名（`"Shop"` 等，camelCase 列） |
| `ali29`(120.55.53.86) | **与 Drsell 无关**，跑的是 medtrust 项目 + listmonk |

## 交付物

```
apps/api/prisma/sql/adp-reader.sql     角色限额/撤权/函数/授权（幂等，无密码）
scripts/setup-adp-reader.sh            创建角色并注入密码，然后执行上面的 SQL
scripts/verify-adp-isolation.sh        隔离验证，任一断言失败退出 1
docs/adp-pg-access.md                  运维手册：用户需自行添加的 pg_hba 行与 ADP 控制台配置
apps/api/.env.example                  新增 ADP_READER_PASSWORD（键名，无值）
DECISIONS.md                           登记 ADR-7 / INV-2
packages/adp/src/index.ts              stub 改为显式抛错（§交付物 ⑤）
```

## SQL 设计

### ① 角色与撤权（`adp-reader.sql` 前半）

```sql
ALTER ROLE adp_reader CONNECTION LIMIT 5;
ALTER ROLE adp_reader SET statement_timeout = '5s';
ALTER ROLE adp_reader SET idle_in_transaction_session_timeout = '10s';

REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM adp_reader;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM adp_reader;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM adp_reader;
GRANT USAGE ON SCHEMA public TO adp_reader;
```

角色创建（含密码）不在 SQL 文件里，由 `setup-adp-reader.sh` 用 `psql -v` 注入，
避免密码进入版本库。

> **PUBLIC 继承注意**：PG 默认把 `EXECUTE` 授予 `PUBLIC`。因此每个新函数必须显式
> `REVOKE ALL ... FROM PUBLIC` 再 `GRANT EXECUTE ... TO adp_reader`，
> 否则任何角色都能调。表则相反——默认只有 owner 有权，无需额外撤销。

### ② 三个函数

全部 `SECURITY DEFINER` + `STABLE` + `SET search_path = public, pg_temp`
（固定 search_path 是 `SECURITY DEFINER` 的必备防护，否则可被 search_path 劫持）。

**店铺定位子句**（三个函数共用）：

```sql
JOIN "Shop" s ON s."tenantId" = p.tenant_id
WHERE s."shopDomain" = p_shop
  AND s."uninstalledAt" IS NULL
  AND (p.shop_id IS NULL OR p.shop_id = s.id)
```

`products.shop_id` 可空，故先按 `tenant_id` 关联、再在 `shop_id` 存在时收紧。
`uninstalledAt IS NULL` 使已卸载店铺立即失去查询能力。

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
```

`adp_get_order(p_shop, p_order_id)` 返回
`shopify_order_id / status / financial_status / fulfillment_status / total / shopify_created_at`。
**不返回** `billing_address`、`shipping_address`、`customer_id`、`total_tax`。

`adp_shop_summary(p_shop)` 返回 `product_count / categories / price_min / price_max / last_synced`，
供智能体开场时了解店铺概况。

每个函数后紧跟：

```sql
REVOKE ALL ON FUNCTION <签名> FROM PUBLIC;
GRANT EXECUTE ON FUNCTION <签名> TO adp_reader;
```

### ③ 连接层（**无需变更**，但需收窄）

**ADP 不需要任何 `pg_hba.conf` 改动**——生效配置的末行 `host all all all scram-sha-256`
已允许任意来源连接。`adp_reader` 创建后即可从公网使用。

因此本 spec 的连接层工作**不是开放，而是记录一个已存在的暴露面**，并给出收窄建议。
`docs/adp-pg-access.md` 须包含：

- 生效配置的位置是**容器内** `/var/lib/postgresql/data/pg_hba.conf`，
  不是 `/etc/postgresql/16/main/pg_hba.conf`（后者不生效，改了没用）
- 建议把末行 `host all all all scram-sha-256` 替换为按库/角色/来源的具体条目，例如：
  ```
  hostssl  drsell  adp_reader  <ADP_EGRESS_IP>/32  scram-sha-256
  hostssl  drsell  drsell_app  127.0.0.1/32        scram-sha-256
  ```
- 打开 `ssl`（当前 `off`，查询结果含 access token 在公网明文传输）
- 改后 `docker exec cb_postgres psql -U medusa -d postgres -c 'select pg_reload_conf()'`

> **这些变更由用户执行，不在本子项目交付物内。** 它们影响同实例上的
> `medusa_db` / `pubmedclaw` / `sapbasic`（含两个超级用户角色），
> 属跨项目运维决定。

### ④ 隔离验证（`verify-adp-isolation.sh`）

**每个"必须被拒"的断言分两步**：先以 owner 身份确认表存在，再以 `adp_reader`
确认被拒。只测第二步会让「表名写错 → relation does not exist」伪装成通过。

| # | 断言 | 期望 |
|---|---|---|
| 1 | owner 可 `SELECT 1 FROM "Shop" LIMIT 1` | 成功（证明表存在） |
| 2 | `adp_reader` 同一查询 | **permission denied** |
| 3–8 | 对 `products` / `orders` / `customers` 重复 1–2 | 同上 |
| 9 | `adp_reader` 执行 `adp_shop_summary(<真实店铺>)` | 成功 |
| 10 | `adp_search_products(A店, NULL, 50)` 结果 ∩ `adp_search_products(B店, NULL, 50)` 结果 | **交集为空** |
| 11 | `adp_search_products(<不存在的店铺>, NULL, 50)` | 0 行 |
| 12 | `adp_reader` 执行 `SELECT current_setting('is_superuser')` | `off` |

断言 10 需要库中存在 ≥2 个店铺。若不足，脚本应 **SKIP 并明确打印**，
不得静默通过——否则最关键的隔离断言会在单店环境下形同虚设。

### ⑤ stub 改为显式失败

`packages/adp/src/index.ts` 的 `upsertKnowledgeDocument` 当前返回 `{ ok: true }`
而从不发请求，导致 `KnowledgeSyncJob` 标记成功、onboarding 向商家显示"同步完成"。
本轮改为抛出明确错误，并让 `AdpService.syncKnowledge` 的调用方
（`shopify.service.ts:546`）把该 kind 的 job 标记为 `skipped` 而非 `ok`。

理由：直连方案下商品知识**不再需要同步**，ADP 实时查库。继续保留一个
"看起来成功"的空操作，就是继续对商家撒谎。

## 元语登记（同一提交）

| ID | 内容 | 守护 |
|---|---|---|
| `ADR-7` | ADP 智能体经 `adp_reader` 角色直连 PG，仅可执行 `adp_*` 函数 | `scripts/verify-adp-isolation.sh` |
| `INV-2` | `adp_reader` 不得持有任何表、视图或序列的权限 | `scripts/verify-adp-isolation.sh` 断言 1–8 |

`DECISIONS.md` §7 的 `TBD-2`（extension 令牌源）不受影响。
`INV-1`（租户数据经 Shop 外键可达）与 `ADR-7` 相关但不冲突——
函数正是靠 `Shop` 外键定位租户。

## 残留风险

| # | 风险 | 处置 |
|---|---|---|
| 1 | **函数强制传店铺，但不验证传的是否为"当前会话所属"店铺**。若 ADP 让 LLM 自由拼参数，理论上可传其他店铺域名（前提是它得先知道该域名） | 直连方案无法消除。唯一根治是应用层带鉴权令牌的 HTTP 接口——已被否决。**用户已在知情下选定本方案** |
| 2 | 同一 `Tenant` 下有多个 `Shop` 时，`shop_id IS NULL` 的历史商品会同时出现在两个店铺的检索结果中 | 实际安装为 1 租户 1 店铺。上线前应跑一次 `SELECT tenant_id, count(*) FROM "Shop" GROUP BY 1 HAVING count(*) > 1` 确认为空 |
| 3 | **实例已对全网开放认证**（`host all all all`）、`ssl = off`、无防火墙，且与 `medusa_db` / `pubmedclaw`(super) 等共用。`drsell` 表中的 Shopify access token 面临公网密码爆破与明文传输 | **优先级高于本子项目**。超出范围（跨项目运维决定），`docs/adp-pg-access.md` 如实记录并给出收窄建议 |
| 4 | `adp_reader` 密码若泄露，攻击者可从任一放行 IP 调用三个函数枚举全部店铺商品 | 限额（5 连接 / 5s 超时）降低批量抓取效率；密码轮换步骤写入运维手册 |
| 5 | ADP 是否支持自定义 SQL 或仅支持表浏览尚未确认 | 若 ADP 需要表/视图才能自省 schema，函数式方案不可用。**实施第一步即验证此点**，不通过则回到设计阶段 |

## 验收标准

1. `bash scripts/setup-adp-reader.sh` 在干净库上成功，重跑仍成功（幂等）
2. `bash scripts/verify-adp-isolation.sh` 12 条断言全过（断言 10 若 SKIP 须明确打印原因）
3. `pnpm spec` 仍 4/4 绿，`ADR-7` / `INV-2` 在册
4. `docs/adp-pg-access.md` 明确写出「生效配置在容器内、`/etc/postgresql/16/main` 无效」，并含收窄用的 `pg_hba.conf` 条目与 reload 命令
5. `apps/api/.env.example` 含 `ADP_READER_PASSWORD=""`
6. 以 `adp_reader` 身份 `SELECT * FROM "Shop"` 报 permission denied（人工复核一次）

## 附录 A：P1 分解

| # | 子项目 | 范围 | 状态 |
|---|---|---|---|
| **A** | ADP 直连 PG（本 spec） | 函数式只读接入，替换假成功 stub | 设计已确认 |
| **B** | `TBD-1` 决策 + 商家看板 | 决定前端落 `apps/web` 还是 `apps/storefront`，然后做今日对话统计展示 | 阻塞于 `TBD-1` |
| **C** | 真实 Inbox | 新增 `Conversation`/`Message` 模型 + 落库 + 查询 API + 前端 | 阻塞于 `TBD-1`，依赖 B |

**B/C 的共同阻塞**：`apps/web` 是 Polaris 空壳（`/app/page.tsx` 51 行、
`/app/inbox/page.tsx` 23 行 mock），`apps/storefront` 有完整 dashboard UI
但零 Shopify 集成，商家进不去。谁是权威商家 UI 必须先决。

**C 的额外事实**：Prisma 中**没有** `Conversation` / `Message` 模型，
`public/chat` 是纯 SSE 代理，对话不落库——Inbox 是从零开始。

## 附录 B：P1-2 今日对话统计现状

与 MVP_SCOPE 的描述不同，这块**后端已完成**：
`adp.service.ts:81` 写 `chatStatDaily`，`shopify.service.ts:556` 的 `todayChatStats` 读，
`GET /api/shopify/chat-stats/today` 已暴露。缺的只是前端展示，故归入子项目 B。

注：`ChatStatDaily` 用 `shopDomain: String` 软关联，无外键，是 `DECISIONS.md` §6
中 `INV-1` 偏离的三个 model 之一。
