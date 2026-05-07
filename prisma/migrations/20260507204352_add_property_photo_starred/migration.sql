-- "Star" / cover-photo flag on property photos. Only one photo per
-- property is starred at a time; the API enforces the invariant by
-- unstarring siblings in the same transaction when one is starred.

ALTER TABLE "property_photos" ADD COLUMN "is_starred" BOOLEAN NOT NULL DEFAULT false;
