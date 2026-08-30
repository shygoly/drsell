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
