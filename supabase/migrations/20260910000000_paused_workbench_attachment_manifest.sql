ALTER TABLE public."AgentPausedRun" ADD COLUMN IF NOT EXISTS "attachmentManifest" jsonb NOT NULL DEFAULT '[]'::jsonb;
