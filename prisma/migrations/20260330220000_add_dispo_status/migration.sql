-- AlterTable: add dispo_status column for parallel pipeline tracking
ALTER TABLE "properties" ADD COLUMN "dispo_status" "property_status";
