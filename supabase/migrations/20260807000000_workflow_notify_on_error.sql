-- Add notifyOnError to "Workflow" so a realtor can opt into push alerts
-- whenever one of their automations fails. Mirrors Zapier's "Email me when
-- this Zap has an error" setting. Defaults false (opt-in).
ALTER TABLE "Workflow" ADD COLUMN IF NOT EXISTS "notifyOnError" boolean NOT NULL DEFAULT false;
