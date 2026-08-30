# ADP 直连 PostgreSQL — 运维手册

## 生效配置在容器内

生产 PG 由 Docker 容器 **`cb_postgres`**（`postgres:16-alpine`，host 网络）提供服务。

```bash
docker exec cb_postgres cat /var/lib/postgresql/data/pg_hba.conf
docker exec cb_postgres psql -U medusa -d postgres -c "SHOW ssl"
```

**`/etc/postgresql/16/main/` 是 Debian 包残留，改它无任何效果。** 本项目实测踩过的坑。

## ADP 连接

`adp_reader` 角色由 `scripts/setup-adp-reader.sh` 创建，SQL 在 `apps/api/prisma/sql/adp-reader.sql`。

```bash
ADMIN_DSN="postgres://medusa:<pw>@127.0.0.1:5432/drsell" \
ADP_READER_PASSWORD="<强密码>" \
bash scripts/setup-adp-reader.sh
```

ADP 控制台连接串示例（启用 TLS 后）：

```
postgres://adp_reader:<pw>@163.7.7.160:5432/drsell?sslmode=require
```

智能体通过 SQL 调用函数，例如：

```sql
SELECT * FROM adp_search_products('your-store.myshopify.com', 'shoe', 20);
SELECT * FROM adp_get_order('your-store.myshopify.com', '1001');
SELECT * FROM adp_shop_summary('your-store.myshopify.com');
```

## 传输加密（SSL）

当前生产 `ssl = off`，查询结果在公网明文传输。**必须开启 TLS。**

### 一键部署证书（wjclaw）

```bash
bash scripts/setup-pg-ssl.sh
```

脚本将 `infra/docker/certs/pg/` 下的证书复制进容器并 `ALTER SYSTEM SET ssl = on`。

### 收窄 pg_hba（影响同实例 medusa_db / pubmedclaw / sapbasic，须人工确认）

把容器内 `pg_hba.conf` 末行 `host all all all scram-sha-256` 替换为按库/角色/来源的具体条目，例如：

```
# TYPE  DATABASE  USER         ADDRESS              METHOD
hostssl  drsell    adp_reader   <ADP_EGRESS_IP>/32   scram-sha-256
hostssl  drsell    drsell_app   127.0.0.1/32         scram-sha-256
host     all       all          127.0.0.1/32         scram-sha-256
```

Reload：

```bash
docker exec cb_postgres psql -U medusa -d postgres -c 'SELECT pg_reload_conf()'
```

验证：

```bash
psql "$DSN?sslmode=require" -c "SHOW ssl"   # 应显示 on
```

本地测试环境 `scripts/dev-pg-up.sh` 已默认 `ssl=on`，可用 `?sslmode=require` 连接。

## Shop.accessToken 加密（应用层）

`Shop.accessToken` 在 API 写入时用 AES-256-GCM 加密（`SHOP_ACCESS_TOKEN_KEY`），落库格式 `v1:<base64>`。
历史明文 token 在读取时透明兼容，下次 OAuth 更新时自动加密。

```bash
# 生成 32 字节密钥（示例）
openssl rand -base64 32
```

在 `apps/api/.env` 设置：

```
SHOP_ACCESS_TOKEN_KEY="<base64-32-bytes>"
```

**`adp_reader` 对 `"Shop"` 表零权限**，即使 PG 实例暴露，ADP 也无法读到 access token。

## 隔离验证

```bash
ADMIN_DSN="postgres://medusa:<pw>@127.0.0.1:5432/drsell" \
ADP_DSN="postgres://adp_reader:<pw>@127.0.0.1:5432/drsell" \
SHOP_A="<店铺A>" SHOP_B="<店铺B>" \
bash scripts/verify-adp-isolation.sh
```

任一断言失败退出 1。单店环境断言 10b 会 SKIP 并打印，不得当作通过。

## 密码轮换

重跑 `setup-adp-reader.sh` 并换新 `ADP_READER_PASSWORD`（脚本幂等），随后在 ADP 控制台更新连接配置。

## 多店铺隐患

上线前确认无一租户多店铺：

```sql
SELECT "tenantId", count(*) FROM "Shop" GROUP BY 1 HAVING count(*) > 1;
```

若有输出，`shop_id IS NULL` 的历史商品会跨店可见，须先回填 `shop_id`。
