-- External photos link — points at a Google Drive / Dropbox / etc.
-- folder when the user wants to keep a richer photo set in another tool.

ALTER TABLE "properties" ADD COLUMN "photos_link" TEXT;
