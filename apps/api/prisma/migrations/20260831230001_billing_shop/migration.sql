ALTER TABLE "Subscription" ADD COLUMN "isBillingShop" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Subscription" ADD COLUMN "shopifyChargeId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "seats" INTEGER NOT NULL DEFAULT 1;
