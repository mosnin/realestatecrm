-- Feature-off Workbench transform approvals must retain the server-derived
-- active workbook identity across the SDK pause/resume boundary. Null keeps
-- all pre-existing and non-Workbench pauses byte-for-byte compatible.
ALTER TABLE public."AgentPausedRun"
  ADD COLUMN IF NOT EXISTS "activeWorkbookContext" jsonb;
