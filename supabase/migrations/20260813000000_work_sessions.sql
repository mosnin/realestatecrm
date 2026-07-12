-- ============================================================================
-- Work Sessions — Chippi's long-running, goal-driven background runs
-- ============================================================================
-- A WorkSession is a run the realtor can walk away from: Chippi plans the
-- steps, (optionally) waits for plan approval, executes step by step with
-- live progress, may ask ONE clarifying question, and finishes with a real
-- deliverable (a markdown artifact saved to Files) plus a summary.
--
-- The row IS the live progress feed: every transition is an UPDATE, and the
-- client subscribes via Supabase Realtime postgres_changes (the same channel
-- machinery the deals board already uses), so progress survives navigation
-- and tab-close with no bespoke socket layer.
--
-- Tenancy as everywhere: service-role client + manual spaceId scoping; RLS is
-- defense-in-depth.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "WorkSession" (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"       text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "conversationId" text,
  goal            text NOT NULL,
  -- Per-run autonomy (the ChatGPT-Work "you decide when it checks in"):
  --   plan_first — Chippi proposes the plan and WAITS for approval
  --   just_go    — plan + execute without stopping
  autonomy        text NOT NULL DEFAULT 'plan_first' CHECK (autonomy IN ('plan_first', 'just_go')),
  "allowQuestions" boolean NOT NULL DEFAULT true,
  status          text NOT NULL DEFAULT 'planning' CHECK (status IN (
    'planning', 'awaiting_approval', 'awaiting_input', 'running',
    'completed', 'failed', 'cancelled'
  )),
  -- [{ id, title, status: 'pending'|'running'|'done'|'skipped', note }]
  plan            jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- The one clarifying question (awaiting_input) + the realtor's answer.
  question        text,
  answer          text,
  -- Per-step findings, appended as steps complete: [{ stepId, text }]
  findings        jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- The deliverable: a File row (markdown) written at completion.
  "artifactFileId" text,
  "artifactName"  text,
  summary         text,
  error           text,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now(),
  "completedAt"   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_worksession_space ON "WorkSession"("spaceId", "createdAt" DESC);

ALTER TABLE "WorkSession" ENABLE ROW LEVEL SECURITY;

-- Live progress: add the table to the Realtime publication (idempotent; the
-- publication exists on every Supabase project). Anon subscribers still see
-- nothing unless a SELECT policy grants it — mirror the owner-scoped policy
-- pattern used by the other realtime tables.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'WorkSession'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "WorkSession";
  END IF;
EXCEPTION WHEN undefined_object THEN
  NULL; -- no realtime publication on this database (self-hosted/test) — fine
END $$;

DROP POLICY IF EXISTS worksession_owner_select ON "WorkSession";
CREATE POLICY worksession_owner_select ON "WorkSession"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "Space" s
      WHERE s.id = "WorkSession"."spaceId"
        AND s."ownerId" = current_user_internal_id()
    )
  );
