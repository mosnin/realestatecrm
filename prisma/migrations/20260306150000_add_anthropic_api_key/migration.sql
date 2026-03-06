-- Add anthropicApiKey to SpaceSetting
ALTER TABLE "SpaceSetting"
  ADD COLUMN IF NOT EXISTS "anthropicApiKey" TEXT;
