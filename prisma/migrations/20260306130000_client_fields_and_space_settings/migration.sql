-- Add new optional SpaceSetting fields
ALTER TABLE "SpaceSetting"
  ADD COLUMN IF NOT EXISTS "phoneNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "myConnections" TEXT,
  ADD COLUMN IF NOT EXISTS "aiPersonalization" TEXT,
  ADD COLUMN IF NOT EXISTS "billingSettings" TEXT;

-- Add new Contact fields
ALTER TABLE "Contact"
  ADD COLUMN IF NOT EXISTS "budget" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "preferences" TEXT,
  ADD COLUMN IF NOT EXISTS "properties" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Create new enum for client lifecycle if needed
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ClientType') THEN
    CREATE TYPE "ClientType" AS ENUM ('QUALIFICATION', 'TOUR', 'APPLICATION');
  END IF;
END $$;

-- Migrate Contact.type from ContactType to ClientType
ALTER TABLE "Contact" ALTER COLUMN "type" DROP DEFAULT;

ALTER TABLE "Contact"
  ALTER COLUMN "type" TYPE "ClientType"
  USING (
    CASE "type"::text
      WHEN 'BUYER' THEN 'QUALIFICATION'
      WHEN 'SELLER' THEN 'TOUR'
      WHEN 'AGENT' THEN 'APPLICATION'
      WHEN 'OTHER' THEN 'QUALIFICATION'
      ELSE 'QUALIFICATION'
    END
  )::"ClientType";

ALTER TABLE "Contact" ALTER COLUMN "type" SET DEFAULT 'QUALIFICATION';

-- Drop old enum if no longer used
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ContactType') THEN
    DROP TYPE "ContactType";
  END IF;
END $$;
