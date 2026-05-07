-- Property uploaded assets — photos + documents per property.
-- Photos live in the property-photos Supabase bucket and get
-- auto-classified into a category (front/exterior/kitchen/bathroom/
-- living/basement/other) by a Claude Haiku vision call after upload.
-- Documents are a flat list (inspections, contracts, leases, etc.)
-- in the property-documents Supabase bucket.

-- CreateTable
CREATE TABLE "property_photos" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenant_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "uploaded_by_id" TEXT,
    "storage_path" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "category" TEXT DEFAULT 'uncategorized',
    "classification_status" TEXT DEFAULT 'pending',
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "property_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "property_photos_property_id_idx" ON "property_photos"("property_id");
CREATE INDEX "property_photos_tenant_id_idx" ON "property_photos"("tenant_id");

-- AddForeignKey
ALTER TABLE "property_photos" ADD CONSTRAINT "property_photos_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "property_photos" ADD CONSTRAINT "property_photos_property_id_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "property_photos" ADD CONSTRAINT "property_photos_uploaded_by_id_fkey"
    FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "property_documents" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenant_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "uploaded_by_id" TEXT,
    "storage_path" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,

    CONSTRAINT "property_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "property_documents_property_id_idx" ON "property_documents"("property_id");
CREATE INDEX "property_documents_tenant_id_idx" ON "property_documents"("tenant_id");

-- AddForeignKey
ALTER TABLE "property_documents" ADD CONSTRAINT "property_documents_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "property_documents" ADD CONSTRAINT "property_documents_property_id_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "property_documents" ADD CONSTRAINT "property_documents_uploaded_by_id_fkey"
    FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
