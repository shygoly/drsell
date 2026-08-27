-- Tenant-partitioned Shopify catalog tables (PostgreSQL)
-- tenant_id = Tenant.id (one shop per tenant in Drsell)

CREATE TABLE IF NOT EXISTS "products" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "shop_id" TEXT,
  "shopify_product_id" TEXT NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "price" DECIMAL(10,2),
  "description" TEXT,
  "category" VARCHAR(64),
  "stock" INTEGER,
  "handle" TEXT,
  "vendor" TEXT,
  "status" TEXT,
  "tags" TEXT,
  "variants_json" TEXT,
  "images_json" TEXT,
  "published_at" TIMESTAMP(3),
  "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "products_tenant_id_shopify_product_id_key"
  ON "products"("tenant_id", "shopify_product_id");
CREATE INDEX IF NOT EXISTS "products_tenant_id_idx" ON "products"("tenant_id");

CREATE TABLE IF NOT EXISTS "orders" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "shop_id" TEXT,
  "shopify_order_id" TEXT NOT NULL,
  "customer_id" TEXT,
  "status" VARCHAR(32),
  "financial_status" TEXT,
  "fulfillment_status" TEXT,
  "total" DECIMAL(10,2) NOT NULL,
  "total_tax" DECIMAL(10,2),
  "billing_address" TEXT,
  "shipping_address" TEXT,
  "shopify_created_at" TIMESTAMP(3),
  "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "orders_tenant_id_shopify_order_id_key"
  ON "orders"("tenant_id", "shopify_order_id");
CREATE INDEX IF NOT EXISTS "orders_tenant_id_customer_id_idx"
  ON "orders"("tenant_id", "customer_id");

CREATE TABLE IF NOT EXISTS "customers" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "shop_id" TEXT,
  "shopify_customer_id" TEXT NOT NULL,
  "display_name" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "customers_tenant_id_shopify_customer_id_key"
  ON "customers"("tenant_id", "shopify_customer_id");
CREATE INDEX IF NOT EXISTS "customers_tenant_id_idx" ON "customers"("tenant_id");

ALTER TABLE "products"
  ADD CONSTRAINT "products_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products"
  ADD CONSTRAINT "products_shop_id_fkey"
  FOREIGN KEY ("shop_id") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_shop_id_fkey"
  FOREIGN KEY ("shop_id") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customers"
  ADD CONSTRAINT "customers_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customers"
  ADD CONSTRAINT "customers_shop_id_fkey"
  FOREIGN KEY ("shop_id") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
