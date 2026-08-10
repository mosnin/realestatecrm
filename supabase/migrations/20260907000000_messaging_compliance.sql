-- ============================================================================
-- Messaging compliance — opt-out suppression + consent records (TCPA/CAN-SPAM)
-- ============================================================================
-- The product sends SMS and email to CONSUMERS (leads, applicants, tour
-- guests), including autonomously via drip campaigns and workflow dispatch.
-- Before this migration there was no suppression list, no honored STOP, and
-- the consent the intake form captures (Contact.consentGiven) was never read
-- before a send. TCPA statutory damages are $500-$1,500 PER MESSAGE with no
-- cap, so this is the highest-exposure gap in the product.
--
-- Two tables, both append-only in spirit:
--
--   MessagingSuppression — the do-not-contact list. Keyed by ADDRESS (phone /
--     email), not contactId, because a person can exist as several Contact
--     rows and a STOP arrives from a phone number, not a record id. One row
--     suppresses that address for the space on that channel, forever, until an
--     explicit opt back in (which deletes the row and is itself logged).
--
--   MessagingConsent — the affirmative record: who agreed to receive what,
--     when, from where, and the exact disclosure text they saw. This is the
--     litigation-defense artifact; without it consent cannot be proven.
--
-- Scope: per-space (the sending brokerage/agent is the "sender" for TCPA
-- purposes). Tenancy as everywhere: service-role + manual spaceId scoping.
-- Idempotent, append-only.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "MessagingSuppression" (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"   text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  -- 'sms' | 'email'
  channel     text NOT NULL CHECK (channel IN ('sms', 'email')),
  -- Normalized: E.164 for sms, lowercased for email (lib/messaging/compliance.ts).
  address     text NOT NULL,
  -- 'stop_keyword' | 'manual' | 'bounce' | 'complaint'
  reason      text NOT NULL DEFAULT 'stop_keyword',
  -- The inbound text that triggered it, for the record.
  "sourceText" text,
  "contactId" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

-- One suppression per (space, channel, address); re-sending STOP is a no-op.
CREATE UNIQUE INDEX IF NOT EXISTS uq_suppression_space_channel_address
  ON "MessagingSuppression"("spaceId", channel, address);
-- The hot path: "is this address suppressed?" on every consumer send.
CREATE INDEX IF NOT EXISTS idx_suppression_lookup
  ON "MessagingSuppression"(channel, address);

CREATE TABLE IF NOT EXISTS "MessagingConsent" (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"   text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  channel     text NOT NULL CHECK (channel IN ('sms', 'email')),
  address     text NOT NULL,
  "contactId" text,
  -- 'express_written' — required for MARKETING/promotional automated messages
  -- 'express'         — sufficient for TRANSACTIONAL messages the consumer
  --                     requested (e.g. confirming a tour they booked)
  "consentType" text NOT NULL CHECK ("consentType" IN ('express_written', 'express')),
  -- Where it came from: 'intake_form' | 'tour_booking' | 'application' |
  -- 'manual' | 'imported'
  source      text NOT NULL,
  -- The exact disclosure the consumer agreed to — the defensible artifact.
  "disclosureText" text,
  "sourceIp"  text,
  "capturedAt" timestamptz NOT NULL DEFAULT now(),
  -- Set when superseded by a later opt-out; kept for the record, never deleted.
  "revokedAt" timestamptz
);

CREATE INDEX IF NOT EXISTS idx_consent_lookup
  ON "MessagingConsent"("spaceId", channel, address, "capturedAt" DESC);
CREATE INDEX IF NOT EXISTS idx_consent_contact
  ON "MessagingConsent"("contactId", "capturedAt" DESC);

ALTER TABLE "MessagingSuppression" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MessagingConsent" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS suppression_owner_select ON "MessagingSuppression";
CREATE POLICY suppression_owner_select ON "MessagingSuppression"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "Space" s
      WHERE s.id = "MessagingSuppression"."spaceId"
        AND s."ownerId" = current_user_internal_id()
    )
  );

DROP POLICY IF EXISTS consent_owner_select ON "MessagingConsent";
CREATE POLICY consent_owner_select ON "MessagingConsent"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "Space" s
      WHERE s.id = "MessagingConsent"."spaceId"
        AND s."ownerId" = current_user_internal_id()
    )
  );
