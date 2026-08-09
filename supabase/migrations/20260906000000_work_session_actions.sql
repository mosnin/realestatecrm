-- ============================================================================
-- Work Session Actions — approval-gated actions + immutable audit trail
-- ============================================================================
-- Work Sessions were read-only: they could research and produce a deliverable
-- but never send, book, or modify. This lets a finished session PROPOSE
-- concrete actions (real tool calls: send an email, book a tour, tag a lead)
-- that the realtor approves ONE BY ONE before anything executes.
--
-- The WorkSessionAction table is an APPEND-ONLY AUDIT TRAIL: one row per
-- proposed action, transitioning proposed → approved/denied → executed/failed,
-- never deleted. This is both the approval queue AND the litigation-defense
-- record of exactly what the AI proposed, who approved it, when, and what
-- happened — the provenance a real brokerage needs when a consumer disputes
-- an AI-sent communication.
--
-- Tenancy as everywhere: service-role client + manual spaceId scoping; RLS is
-- defense-in-depth. Append-only, idempotent.
-- ============================================================================

-- New status: a session waiting for the realtor to approve/deny proposed
-- actions after its research + deliverable are done.
ALTER TABLE "WorkSession" DROP CONSTRAINT IF EXISTS "WorkSession_status_check";
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_status_check" CHECK (status IN (
  'planning', 'awaiting_approval', 'awaiting_input', 'running',
  'awaiting_actions', 'completed', 'failed', 'cancelled'
));

CREATE TABLE IF NOT EXISTS "WorkSessionAction" (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "sessionId"   text NOT NULL REFERENCES "WorkSession"(id) ON DELETE CASCADE,
  "spaceId"     text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  -- The concrete tool call the session proposes.
  tool          text NOT NULL,                 -- registry tool name (e.g. 'send_email')
  args          jsonb NOT NULL DEFAULT '{}'::jsonb,  -- schema-validated before insert
  -- Human-readable "what will happen if you approve" (the tool's summariseCall)
  -- plus the model's rationale — both frozen at propose time for the record.
  summary       text NOT NULL,
  rationale     text,
  status        text NOT NULL DEFAULT 'proposed' CHECK (status IN (
    'proposed', 'approved', 'denied', 'executed', 'failed'
  )),
  -- Filled on execution (approved actions only).
  result        jsonb,
  error         text,
  "decidedByUserId" text,                       -- User.id of the approver/denier
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "decidedAt"   timestamptz,
  "executedAt"  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_wsaction_session ON "WorkSessionAction"("sessionId", "createdAt");
CREATE INDEX IF NOT EXISTS idx_wsaction_space ON "WorkSessionAction"("spaceId", "createdAt" DESC);
-- Fast "does this session still have undecided actions?" check.
CREATE INDEX IF NOT EXISTS idx_wsaction_pending ON "WorkSessionAction"("sessionId") WHERE status = 'proposed';

ALTER TABLE "WorkSessionAction" ENABLE ROW LEVEL SECURITY;

-- Live approval queue over Realtime, same pattern as WorkSession.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'WorkSessionAction'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "WorkSessionAction";
  END IF;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

DROP POLICY IF EXISTS wsaction_owner_select ON "WorkSessionAction";
CREATE POLICY wsaction_owner_select ON "WorkSessionAction"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "Space" s
      WHERE s.id = "WorkSessionAction"."spaceId"
        AND s."ownerId" = current_user_internal_id()
    )
  );
