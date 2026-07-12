-- ============================================================================
-- Work Sessions v2: live narration, staged drafts, recurrence
-- ============================================================================
-- Three additive columns on WorkSession:
--   currentAction — one live line of narration ("Searching contacts…") updated
--                   as the engine's tools fire; the strip renders it under the
--                   running step so the card feels alive, not batch-y.
--   recurrence    — 'none' | 'daily' | 'weekly'. A completed recurring session
--                   is re-queued by a sleeping Inngest function that clones it
--                   at the next occurrence. Requires Inngest; ignored without.
--   draftCount    — how many message drafts the session staged into the drafts
--                   inbox (v2 sessions may DRAFT — stage pending AgentDraft
--                   rows that wait for human approval — but still never send).
-- ============================================================================

ALTER TABLE "WorkSession"
  ADD COLUMN IF NOT EXISTS "currentAction" text,
  ADD COLUMN IF NOT EXISTS recurrence text NOT NULL DEFAULT 'none'
    CHECK (recurrence IN ('none', 'daily', 'weekly')),
  ADD COLUMN IF NOT EXISTS "draftCount" integer NOT NULL DEFAULT 0;
