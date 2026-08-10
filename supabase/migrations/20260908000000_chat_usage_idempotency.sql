-- ============================================================================
-- ChatUsage idempotency — stop double-charging recovered turns
-- ============================================================================
-- ChatUsage rows are inserted once per chat turn, and an AFTER INSERT trigger
-- (20260627000000_meter_chat_usage_credits.sql) debits the account's credit
-- lots for each row. There was no idempotency key and no unique constraint,
-- so ANY path that re-persists a turn writes a second row — and the trigger
-- charges the customer a second time for the same work.
--
-- That is not hypothetical: product non-negotiable #2 keeps turns running
-- after the browser leaves and recovers them on reconnect, which is exactly
-- the shape that re-persists.
--
-- Fix: an optional stable key per logical turn + a UNIQUE index. Callers that
-- can be re-executed pass a key and insert with ON CONFLICT DO NOTHING, so a
-- replay is a no-op instead of a duplicate charge. The index is PARTIAL
-- (WHERE not null) so existing rows and callers without a key are unaffected —
-- this migration is safe to apply ahead of the code that uses it.
--
-- Append-only, idempotent.
-- ============================================================================

ALTER TABLE "ChatUsage" ADD COLUMN IF NOT EXISTS "idempotencyKey" text;

-- One row per keyed turn, per space. Scoped by spaceId so a key collision
-- across tenants is impossible.
CREATE UNIQUE INDEX IF NOT EXISTS uq_chatusage_idempotency
  ON "ChatUsage"("spaceId", "idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;
