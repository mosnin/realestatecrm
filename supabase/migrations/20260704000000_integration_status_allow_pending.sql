-- Allow 'pending' on IntegrationConnection.status.
--
-- The OAuth connect route (app/api/integrations/connect/[toolkit]) was refactored
-- to persist the connection row at initiate-time with status='pending' — so a
-- cross-site cookie drop or a dropped OAuth callback can't silently lose it; the
-- callback (or the reconcile sweep) then promotes it to 'active'. But the original
-- CHECK only allowed (active, expired, revoked, failed), so EVERY connect insert
-- violated the constraint and 500'd with
-- "[integrations.connect] persist-at-connect failed" / "[integrations.connections]
-- insert failed" (Postgres 23514 check_violation). The TS IntegrationStatus type
-- already includes 'pending'; this brings the DB constraint in line.
--
-- Recreate the (auto-named) status check with 'pending' added. Idempotent.

ALTER TABLE "IntegrationConnection"
  DROP CONSTRAINT IF EXISTS "IntegrationConnection_status_check";

ALTER TABLE "IntegrationConnection"
  ADD CONSTRAINT "IntegrationConnection_status_check"
  CHECK ("status" IN ('active', 'pending', 'expired', 'revoked', 'failed'));
