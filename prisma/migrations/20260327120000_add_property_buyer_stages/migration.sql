-- CreateTable
CREATE TABLE IF NOT EXISTS "property_buyer_stages" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "buyer_id" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'matched',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_buyer_stages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "property_buyer_stages_property_id_buyer_id_key" ON "property_buyer_stages"("property_id", "buyer_id");

-- AddForeignKey
ALTER TABLE "property_buyer_stages" ADD CONSTRAINT "property_buyer_stages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_buyer_stages" ADD CONSTRAINT "property_buyer_stages_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_buyer_stages" ADD CONSTRAINT "property_buyer_stages_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "buyers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
