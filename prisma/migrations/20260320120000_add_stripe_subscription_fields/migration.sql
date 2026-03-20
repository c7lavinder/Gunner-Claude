-- AlterTable
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "stripe_customer_id" TEXT,
ADD COLUMN IF NOT EXISTS "stripe_price_id" TEXT,
ADD COLUMN IF NOT EXISTS "subscription_status" TEXT,
ADD COLUMN IF NOT EXISTS "stripe_subscription_id" TEXT,
ADD COLUMN IF NOT EXISTS "stripe_current_period_end" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "tenants_stripe_customer_id_key" ON "tenants"("stripe_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "tenants_stripe_subscription_id_key" ON "tenants"("stripe_subscription_id");
