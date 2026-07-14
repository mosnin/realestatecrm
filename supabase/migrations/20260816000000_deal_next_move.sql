-- Next Move: agent-computed "what now?" for every deal.
--
-- The kanban card's next-action line is either realtor-authored (nextAction)
-- or inferred from dates (lib/deals/health.ts). Next Move is the third voice:
-- a compact, grounded, LLM-composed suggestion recomputed daily by
-- /api/cron/next-moves (and on demand via POST /api/deals/[id]/next-move),
-- e.g. "Buyer quiet 6 days — check in about the Elm St showing".
--
--   * nextMoveText       — the suggestion itself (UI truncates; compute caps
--                          at 140 chars). NULL means "no chip".
--   * nextMoveKind       — coarse action taxonomy driving the chip tint and
--                          the "Do it" deep link. Nullable; constrained to
--                          the five known kinds when present.
--   * nextMoveComputedAt — staleness marker. The cron recomputes rows where
--                          this is NULL or older than ~20h; the UI dims a
--                          move older than 48h and offers a refresh.
--
-- Idempotent: IF NOT EXISTS guards throughout. Safe to re-run.

ALTER TABLE "Deal"
  ADD COLUMN IF NOT EXISTS "nextMoveText" text;

ALTER TABLE "Deal"
  ADD COLUMN IF NOT EXISTS "nextMoveKind" text
    CHECK ("nextMoveKind" IN ('follow_up', 'schedule', 'document', 'deadline', 'other'));

ALTER TABLE "Deal"
  ADD COLUMN IF NOT EXISTS "nextMoveComputedAt" timestamptz;

-- The cron's due-query is "active deals whose nextMoveComputedAt is NULL or
-- older than the cutoff, oldest first". Narrow the index to active deals —
-- closed deals never get a next move.
CREATE INDEX IF NOT EXISTS idx_deal_next_move_computed_at
  ON "Deal" ("nextMoveComputedAt")
  WHERE status = 'active';
