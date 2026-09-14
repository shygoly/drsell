-- ADP 智能体只读接入：函数式访问，零表权限。
-- 幂等，可重复执行。不含密码，不含 CREATE ROLE（角色创建见 setup-adp-reader.sh）。
\set ON_ERROR_STOP on

ALTER ROLE adp_reader CONNECTION LIMIT 5;
ALTER ROLE adp_reader SET statement_timeout = '5s';
ALTER ROLE adp_reader SET idle_in_transaction_session_timeout = '10s';

REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM adp_reader;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM adp_reader;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM adp_reader;

GRANT USAGE ON SCHEMA public TO adp_reader;

-- adp_shop_summary
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

-- adp_search_products
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

-- adp_get_order
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

-- adp_get_after_sales —— 售后（退货/换货/理赔）查询。按店铺隔离，与 adp_get_order 同风格。
-- p_order_id 可选：给了就只返回该订单的售后。返回列刻意精简，不含顾客 PII。
-- 注：这是「按店铺 + 订单号」的查询，隐私边界与 adp_get_order 一致；
-- 「按登录顾客隔离」（D8）由 Part B 的顾客态令牌方案加固，见 openspec dtc-store-medusa Phase 5/7。
CREATE OR REPLACE FUNCTION adp_get_after_sales(p_shop text, p_order_id text DEFAULT NULL)
RETURNS TABLE (
  order_external_id text,
  type              text,
  status            text,
  reason            text,
  amount            numeric,
  currency          text,
  updated_at        timestamp
) LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $fn$
  SELECT a.order_external_id, a.type, a.status, a.reason, a.amount, a.currency, a.source_updated_at
  FROM after_sales a
  JOIN "Shop" s ON s."tenantId" = a.tenant_id
  WHERE s."shopDomain" = p_shop
    AND s."uninstalledAt" IS NULL
    AND (a.shop_id IS NULL OR a.shop_id = s.id)
    AND (p_order_id IS NULL OR p_order_id = '' OR a.order_external_id = p_order_id);
$fn$;

ALTER FUNCTION adp_get_after_sales(text, text) OWNER TO drsell_app;
REVOKE ALL ON FUNCTION adp_get_after_sales(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION adp_get_after_sales(text, text) TO adp_reader;
