-- ============================================================================
-- Browser Control: screencast frame storage + session liveness heartbeat
-- ============================================================================
-- WHY: the extension's /poll heartbeat can now piggy-back a live viewport
-- frame (protocol.ts LiveFrame) so the Chippi oversight panel can show the
-- realtor what the agent is doing in near-real-time, and a user-triggered
-- kill signal (PollBody.killed). Storing only the LATEST frame per session
-- (overwrite, not append) keeps this a live feed rather than an
-- ever-growing log — a screenshot-per-poll table would be an unbounded
-- write amplifier for a ~1/s heartbeat.
--
-- "lastPolledAt" is a separate liveness signal from "startedAt": it lets
-- getActiveSession() (lib/browser-control/session.ts) detect a session whose
-- extension went away without a clean kill/revoke (crash, laptop closed) and
-- lazily treat it as ended, instead of reporting a dead session as live
-- forever.
--
-- Append-only + idempotent (ADD COLUMN IF NOT EXISTS), applied via the
-- human-gated workflow in docs/RELEASE.md — NOT assumed live in prod just
-- because it's in git. No RLS changes: these are plain columns on a table
-- already RLS-enabled + deny-all-to-anon by 20260901000000_browser_control.sql;
-- the service-role app queries remain the real (spaceId-scoped) boundary.
-- ============================================================================

ALTER TABLE "BrowserSession"
  ADD COLUMN IF NOT EXISTS "lastFrame"    jsonb,
  ADD COLUMN IF NOT EXISTS "lastFrameAt"  timestamptz,
  ADD COLUMN IF NOT EXISTS "lastPolledAt" timestamptz;

-- Backfill existing rows so staleness detection has a sane starting point
-- (falls back to startedAt in application code when NULL anyway, but keeping
-- the column populated avoids a two-code-path read forever).
UPDATE "BrowserSession" SET "lastPolledAt" = "startedAt" WHERE "lastPolledAt" IS NULL;
