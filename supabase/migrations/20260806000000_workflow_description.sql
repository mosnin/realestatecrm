-- Add an optional description column to "Workflow" so realtors can annotate
-- their automations with a short plain-English note — mirrors Zapier's Zap
-- description field. Nullable text; blank = no description shown in the UI.
ALTER TABLE "Workflow" ADD COLUMN IF NOT EXISTS "description" text;
