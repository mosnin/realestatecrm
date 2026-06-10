-- Public property storefront groundwork.
--
-- 1. Link a TourPropertyProfile to a real Property row. Until now a tour
--    profile carried only a name/address/schedule — no photos, no listing
--    facts, no link to the realtor's actual Property. Adding a nullable
--    propertyId lets the booking picker and the public storefront show the
--    listing's photos + beds/baths/price, and lets a tour deep-link to the
--    property detail page. Nullable + ON DELETE SET NULL: a profile can exist
--    without a linked listing, and deleting the listing just unlinks it
--    (mirrors how Deal.propertyId / Tour.propertyId behave).
--
-- 2. Add SpaceSetting.publicEmail — a realtor-controlled contact email shown
--    on the public applicant-facing surfaces (book / property pages), distinct
--    from the account login email. phoneNumber already exists; this is its
--    email sibling.
--
-- ✓ Idempotent (ADD COLUMN IF NOT EXISTS); safe to re-run.

ALTER TABLE "TourPropertyProfile"
  ADD COLUMN IF NOT EXISTS "propertyId" text REFERENCES "Property"(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tour_property_profile_property
  ON "TourPropertyProfile" ("propertyId")
  WHERE "propertyId" IS NOT NULL;

ALTER TABLE "SpaceSetting"
  ADD COLUMN IF NOT EXISTS "publicEmail" text;
