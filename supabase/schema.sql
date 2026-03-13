-- Supabase schema for Real Estate CRM
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- ============================================================
-- Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS "User" (
  id              text PRIMARY KEY,
  "clerkId"       text UNIQUE NOT NULL,
  email           text NOT NULL,
  name            text,
  avatar          text,
  bio             text,
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "onboardingCurrentStep" integer NOT NULL DEFAULT 0,
  "onboardingStartedAt"   timestamptz,
  "onboardingCompletedAt" timestamptz,
  onboard                 boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS "Space" (
  id          text PRIMARY KEY,
  slug        text UNIQUE NOT NULL,
  name        text NOT NULL,
  emoji       text NOT NULL DEFAULT '🏠',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "ownerId"   text UNIQUE NOT NULL REFERENCES "User"(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "SpaceSetting" (
  id                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"           text UNIQUE NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  notifications       boolean NOT NULL DEFAULT true,
  timezone            text NOT NULL DEFAULT 'America/New_York',
  "phoneNumber"       text,
  "myConnections"     text,
  "aiPersonalization" text,
  "billingSettings"   text,
  "anthropicApiKey"   text,
  "businessName"      text,
  "intakePageTitle"   text,
  "intakePageIntro"   text
);

CREATE TABLE IF NOT EXISTS "Contact" (
  id              text PRIMARY KEY,
  "spaceId"       text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  name            text NOT NULL,
  email           text,
  phone           text,
  address         text,
  notes           text,
  budget          double precision,
  preferences     text,
  properties      text[] NOT NULL DEFAULT '{}',
  type            text NOT NULL DEFAULT 'QUALIFICATION',
  tags            text[] NOT NULL DEFAULT '{}',
  "leadScore"     double precision,
  "scoreLabel"    text,
  "scoreSummary"  text,
  "scoringStatus" text NOT NULL DEFAULT 'pending',
  "scoreDetails"  jsonb,
  "applicationData" jsonb,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "DealStage" (
  id          text PRIMARY KEY,
  "spaceId"   text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  name        text NOT NULL,
  color       text NOT NULL DEFAULT '#6B7280',
  position    integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "Deal" (
  id          text PRIMARY KEY,
  "spaceId"   text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  title       text NOT NULL,
  description text,
  value       double precision,
  address     text,
  priority    text NOT NULL DEFAULT 'MEDIUM',
  "closeDate" timestamptz,
  "stageId"   text NOT NULL REFERENCES "DealStage"(id) ON DELETE CASCADE,
  position    integer NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "DealContact" (
  "dealId"    text NOT NULL REFERENCES "Deal"(id) ON DELETE CASCADE,
  "contactId" text NOT NULL REFERENCES "Contact"(id) ON DELETE CASCADE,
  PRIMARY KEY ("dealId", "contactId")
);

CREATE TABLE IF NOT EXISTS "Message" (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"   text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  role        text NOT NULL,
  content     text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Indexes (for common query patterns)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_user_clerk_id      ON "User"("clerkId");
CREATE INDEX IF NOT EXISTS idx_space_owner_id     ON "Space"("ownerId");
CREATE INDEX IF NOT EXISTS idx_space_slug         ON "Space"(slug);
CREATE INDEX IF NOT EXISTS idx_space_setting_sid  ON "SpaceSetting"("spaceId");
CREATE INDEX IF NOT EXISTS idx_contact_space_id   ON "Contact"("spaceId");
CREATE INDEX IF NOT EXISTS idx_contact_tags       ON "Contact" USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_deal_space_id      ON "Deal"("spaceId");
CREATE INDEX IF NOT EXISTS idx_deal_stage_id      ON "Deal"("stageId");
CREATE INDEX IF NOT EXISTS idx_dealstage_space_id ON "DealStage"("spaceId");
CREATE INDEX IF NOT EXISTS idx_dealcontact_deal   ON "DealContact"("dealId");
CREATE INDEX IF NOT EXISTS idx_dealcontact_contact ON "DealContact"("contactId");
CREATE INDEX IF NOT EXISTS idx_message_space_id   ON "Message"("spaceId");
