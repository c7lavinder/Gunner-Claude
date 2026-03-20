-- CreateTable
CREATE TABLE IF NOT EXISTS "buyers" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "company" TEXT,
    "markets" JSONB NOT NULL DEFAULT '[]',
    "criteria" JSONB NOT NULL DEFAULT '{}',
    "tags" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "buyers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "deal_blasts" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenant_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approved_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    CONSTRAINT "deal_blasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "deal_blast_recipients" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blast_id" TEXT NOT NULL,
    "buyer_id" TEXT NOT NULL,
    "response" TEXT,
    "responded_at" TIMESTAMP(3),
    CONSTRAINT "deal_blast_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "deal_blast_recipients_blast_id_buyer_id_key" ON "deal_blast_recipients"("blast_id", "buyer_id");

-- AddForeignKey
ALTER TABLE "buyers" ADD CONSTRAINT "buyers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_blasts" ADD CONSTRAINT "deal_blasts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deal_blasts" ADD CONSTRAINT "deal_blasts_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deal_blasts" ADD CONSTRAINT "deal_blasts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_blast_recipients" ADD CONSTRAINT "deal_blast_recipients_blast_id_fkey" FOREIGN KEY ("blast_id") REFERENCES "deal_blasts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deal_blast_recipients" ADD CONSTRAINT "deal_blast_recipients_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "buyers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
