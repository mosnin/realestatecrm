-- Instant first touch: space-level kill switch.
--
-- Default ON. When a new apply / inbound lead lands, Chippi composes a
-- grounded intro and actually sends it (realtor inbox when connected,
-- platform sender otherwise). Realtors who want draft-only can turn this
-- off. Manual CRM creates still compose a draft; they only send when
-- express-written consent is on file (marketing category).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS.

ALTER TABLE "SpaceSetting"
  ADD COLUMN IF NOT EXISTS "autoFirstTouchSend" BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN "SpaceSetting"."autoFirstTouchSend" IS
  'When true (default), inbound first-touch intros are sent after compose, not left pending. Compliance (suppression, quiet hours, consent for marketing) still applies.';
