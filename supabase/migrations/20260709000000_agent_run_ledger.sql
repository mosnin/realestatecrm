-- AgentRunLedger: one row per autonomous-run DISPATCH, tracking its lifecycle.
--
-- Background: the app dispatches autonomous Modal runs from three places —
-- the hourly Routine cron, the 4-hour agent-sweep, and the "Run now" button
-- (all via lib/routines.ts / app/api/cron/agent-sweep). The Modal endpoint
-- only returns once the WHOLE run finishes, so a dispatch timeout is the
-- normal case, not a failure — which left us blind to whether a dispatched
-- run actually started, and with no honest record when a dispatch genuinely
-- failed.
--
-- This table is that durable record: one row per dispatch attempt, written
-- the moment we POST to Modal, so a fired run is visible after the fact and a
-- failed/never-confirmed dispatch surfaces for observability/alerting.
--
-- status:
--   dispatched — row written, POST in flight / just sent (transient)
--   in_flight  — POST accepted (2xx) OR timed out (the run is presumed live —
--                Modal holds the connection open for the whole run, so a 12s
--                client timeout means the request landed and the run started)
--   confirmed  — a run artifact (AgentTrajectory / AgentActivityLog / AgentDraft)
--                appeared for this space at/after dispatch; the run definitely ran
--   failed     — a genuine dispatch failure (non-2xx after retries, or a non-
--                timeout network error) OR no artifact ever appeared (reconcile)
--
-- NOTE: precise per-run correlation (and any auto-retry of a failed run) needs
-- a Modal-side run_id echoed back via a completion callback. We forward a
-- `run_id` in the dispatch body today (Modal ignores unknown fields), so this
-- is forward-compatible — but the reconcile step below correlates by
-- (spaceId, time window), not by run_id, and deliberately does NOT auto-
-- re-dispatch (retrying a live run would double-run → double-cost).
--
-- Conventions mirror 20260705000000_integration_event.sql (quoted camelCase
-- columns, text PKs/FKs, ON DELETE CASCADE, RLS deny-all for non-service roles).
-- Idempotent: IF NOT EXISTS throughout. Safe to re-run.

CREATE TABLE IF NOT EXISTS "AgentRunLedger" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The run identifier we generate at dispatch (crypto.randomUUID()) and
  -- forward to Modal in the POST body. Unique so a given dispatch maps to
  -- exactly one ledger row. (Modal does not echo this back yet — see header.)
  "runId"          TEXT NOT NULL UNIQUE,

  -- Tenant scoping. Space.id is `text` (all PKs are text), so this MUST be text.
  "spaceId"        TEXT NOT NULL REFERENCES "Space"("id") ON DELETE CASCADE,

  -- Where the dispatch came from: 'sweep' | 'routine' | 'run_now' | ... Free
  -- text (no CHECK) so a new dispatch source doesn't need a migration.
  "trigger"        TEXT,

  "status"         TEXT NOT NULL
                     CHECK ("status" IN ('dispatched', 'in_flight', 'confirmed', 'failed')),

  "dispatchedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Set when reconcile confirms a run artifact appeared.
  "confirmedAt"    TIMESTAMPTZ,
  -- Human-readable reason on status='failed' (e.g. the Modal HTTP status, a
  -- network error message, or 'no_artifact' from reconcile).
  "failureReason"  TEXT,
  -- Reserved for a future auto-retry path; always 0 today (we never re-dispatch).
  "retryCount"     INT NOT NULL DEFAULT 0,

  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reconcile + per-space history query: recent dispatches for a space, newest
-- first. Reconcile scans the unconfirmed tail; this index serves both.
CREATE INDEX IF NOT EXISTS "AgentRunLedger_space_dispatchedAt_idx"
  ON "AgentRunLedger" ("spaceId", "dispatchedAt" DESC);

ALTER TABLE "AgentRunLedger" ENABLE ROW LEVEL SECURITY;

-- ── RLS — defense-in-depth, mirrors the other agent/integration tables ──────
-- All app access is via the service-role key (lib/supabase.ts), which BYPASSES
-- RLS. Enabling RLS with NO policy denies every non-bypassing role (anon +
-- authenticated): this table is never read via the browser/anon client or
-- Supabase Realtime, so deny-all closes the anon hole without breaking any
-- product surface. Prod has RLS on ALL tables; this matches that posture. If a
-- client-side read is ever needed, add a scoped SELECT policy for
-- `authenticated` in a follow-up — do not weaken this back to open.
REVOKE ALL ON "AgentRunLedger" FROM anon, authenticated;
