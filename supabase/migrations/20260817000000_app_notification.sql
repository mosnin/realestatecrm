-- ============================================================================
-- AppNotification: durable in-app records for background agent outcomes
-- ============================================================================
-- WHY: the dashboard bell (GET /api/notifications) shows notifications that
-- are COMPUTED live from CRM rows, with per-user read/dismiss state persisted
-- in "NotificationState" (20260706000000). Background agent work — swarm runs
-- finishing via /api/internal/notify, Instant First Touch drafts, workflow
-- sends/failures, work-session completions — had no computed source: it fired
-- an ephemeral web push and left NO in-app trace. Miss the push, miss the
-- outcome.
--
-- This table is the stored source for those events. lib/notifications.ts
-- (createAppNotification) is the single writer; GET /api/notifications merges
-- these rows into the same list the bell renders; read/dismiss reuses
-- NotificationState with key = AppNotification.id (rows are immutable, so a
-- stamped sourceCreatedAt never "freshens" and a handled record stays gone).
--
-- `type` is free text (no CHECK) so a new category doesn't need a migration —
-- mirrors AgentRunLedger."trigger". Conventions match the sibling tables:
-- quoted camelCase columns, text PK/FK, ON DELETE CASCADE. Idempotent — safe
-- to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "AppNotification" (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"   text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  -- Category: 'agent_run' | 'first_touch' | 'work_session' | 'automation' |
  -- 'agent_send' | future values (free text by design).
  type        text NOT NULL,
  title       text NOT NULL,
  body        text NOT NULL DEFAULT '',
  -- In-app deep link (e.g. '/s/acme/chippi/inbox'). NULL → the notification
  -- center falls back to the space dashboard.
  href        text,
  priority    text NOT NULL DEFAULT 'medium'
                CHECK (priority IN ('high', 'medium', 'low')),
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

-- The hot read path: recent records for a space, newest first.
CREATE INDEX IF NOT EXISTS "AppNotification_space_createdAt_idx"
  ON "AppNotification" ("spaceId", "createdAt" DESC);

ALTER TABLE "AppNotification" ENABLE ROW LEVEL SECURITY;

-- ── Realtime: let the bell refetch the instant a record lands ───────────────
-- Same contract as 20260607000011_realtime_authenticated_rls.sql: SELECT for
-- `authenticated` only, scoped to spaces the JWT's subject OWNS (Clerk JWT is
-- fed into Realtime by lib/supabase-browser.ts). All writes stay service-role
-- only. Anon gets nothing.
DROP POLICY IF EXISTS "realtime_authenticated_appnotification_select" ON "AppNotification";
CREATE POLICY "realtime_authenticated_appnotification_select" ON "AppNotification"
  FOR SELECT TO authenticated
  USING (
    "spaceId" IN (
      SELECT s.id FROM "Space" s
      JOIN "User" u ON u.id = s."ownerId"
      WHERE u."clerkId" = auth.jwt() ->> 'sub'
    )
  );

REVOKE ALL ON "AppNotification" FROM anon;
REVOKE INSERT, UPDATE, DELETE ON "AppNotification" FROM authenticated;

-- Publication membership so postgres_changes events fire (idempotent; the
-- supabase_realtime publication exists on every Supabase project).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'AppNotification'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "AppNotification";
  END IF;
END $$;
