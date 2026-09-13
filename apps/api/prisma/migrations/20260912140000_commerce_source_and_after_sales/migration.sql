-- DTC 独立站接入（openspec change dtc-store-medusa，Phase 2）。
-- drsell 现在可摄取非 Shopify 来源（Medusa）的产品/订单/顾客/售后。
-- 复用现有 shopify*_id 列承载外部 ID；加 source 判别列；加 source_updated_at 供
-- 乱序/重投时按版本拒旧；orders 加 items_json 轻量行项目；新增 after_sales 表。
-- source 默认 'shopify'：存量行按 Shopify 对待，行为不变。

ALTER TABLE "products"  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'shopify';
ALTER TABLE "products"  ADD COLUMN "source_updated_at" TIMESTAMP(3);

ALTER TABLE "orders"    ADD COLUMN "source" TEXT NOT NULL DEFAULT 'shopify';
ALTER TABLE "orders"    ADD COLUMN "source_updated_at" TIMESTAMP(3);
ALTER TABLE "orders"    ADD COLUMN "items_json" TEXT;

ALTER TABLE "customers" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'shopify';
ALTER TABLE "customers" ADD COLUMN "source_updated_at" TIMESTAMP(3);

CREATE TABLE "after_sales" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "shop_id" TEXT,
    "source" TEXT NOT NULL DEFAULT 'medusa',
    "external_id" TEXT NOT NULL,
    "order_external_id" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT,
    "reason" TEXT,
    "amount" DECIMAL(10,2),
    "currency" TEXT,
    "source_updated_at" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "after_sales_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "after_sales_tenant_id_source_external_id_key"
    ON "after_sales"("tenant_id", "source", "external_id");
CREATE INDEX "after_sales_tenant_id_order_external_id_idx"
    ON "after_sales"("tenant_id", "order_external_id");

ALTER TABLE "after_sales" ADD CONSTRAINT "after_sales_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "after_sales" ADD CONSTRAINT "after_sales_shop_id_fkey"
    FOREIGN KEY ("shop_id") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
