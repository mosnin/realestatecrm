-- The sequence engine reads this setting, but 20260520000000 removed it
-- while retiring the old specialist agents. Restore the per-space policy
-- used by sequence sending. Missing settings remain review-first; existing
-- values (including an explicit autonomous choice) are preserved.
ALTER TABLE "AgentSettings"
  ADD COLUMN IF NOT EXISTS "autonomyLevel" TEXT NOT NULL DEFAULT 'draft_required'
  CHECK ("autonomyLevel" IN ('autonomous', 'draft_required', 'suggest_only'));

COMMENT ON COLUMN "AgentSettings"."autonomyLevel" IS
  'Sending policy for follow-up sequences. Independent of periodic review enabled and individual Workflow autonomy.';
