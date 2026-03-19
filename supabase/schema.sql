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
  onboard                 boolean NOT NULL DEFAULT false,
  "platformRole"          text NOT NULL DEFAULT 'user' CHECK ("platformRole" IN ('user', 'admin'))
);

-- Brokerage must be created before Space (Space has FK to Brokerage)
CREATE TABLE IF NOT EXISTS "Brokerage" (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name          text NOT NULL,
  "ownerId"     text NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  "websiteUrl"  text,
  "logoUrl"     text,
  "joinCode"    text UNIQUE,
  "createdAt"   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Space" (
  id            text PRIMARY KEY,
  slug          text UNIQUE NOT NULL,
  name          text NOT NULL,
  emoji         text NOT NULL DEFAULT '🏠',
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "ownerId"     text UNIQUE NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "brokerageId" text REFERENCES "Brokerage"(id) ON DELETE SET NULL
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
  "intakePageIntro"   text,
  "tourDuration"         integer NOT NULL DEFAULT 30,
  "tourStartHour"        integer NOT NULL DEFAULT 9,
  "tourEndHour"          integer NOT NULL DEFAULT 17,
  "tourDaysAvailable"    integer[] NOT NULL DEFAULT '{1,2,3,4,5}',
  "tourBookingPageTitle" text,
  "tourBookingPageIntro" text,
  "tourBufferMinutes"    integer NOT NULL DEFAULT 0,
  "tourBlockedDates"     text[] NOT NULL DEFAULT '{}'
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
  "sourceTourId" text REFERENCES "Tour"(id) ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "DealContact" (
  "dealId"    text NOT NULL REFERENCES "Deal"(id) ON DELETE CASCADE,
  "contactId" text NOT NULL REFERENCES "Contact"(id) ON DELETE CASCADE,
  PRIMARY KEY ("dealId", "contactId")
);

CREATE TABLE IF NOT EXISTS "Conversation" (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"   text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  title       text NOT NULL DEFAULT 'New conversation',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversation_space_updated
  ON "Conversation" ("spaceId", "updatedAt" DESC);

CREATE TABLE IF NOT EXISTS "Message" (
  id               text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"        text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "conversationId" text REFERENCES "Conversation"(id) ON DELETE CASCADE,
  role             text NOT NULL,
  content          text NOT NULL,
  "createdAt"      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_message_conversation_created
  ON "Message" ("conversationId", "createdAt" ASC);

CREATE TABLE IF NOT EXISTS "BrokerageMembership" (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "brokerageId"   text NOT NULL REFERENCES "Brokerage"(id) ON DELETE CASCADE,
  "userId"        text NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('broker_owner', 'broker_manager', 'realtor_member')),
  "invitedById"   text REFERENCES "User"(id) ON DELETE SET NULL,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("brokerageId", "userId")
);

CREATE TABLE IF NOT EXISTS "Invitation" (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "brokerageId"   text NOT NULL REFERENCES "Brokerage"(id) ON DELETE CASCADE,
  email           text NOT NULL,
  "roleToAssign"  text NOT NULL CHECK ("roleToAssign" IN ('broker_manager', 'realtor_member')),
  token           text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  "expiresAt"     timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  "invitedById"   text REFERENCES "User"(id) ON DELETE SET NULL,
  "createdAt"     timestamptz NOT NULL DEFAULT now()
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

-- Tour booking
CREATE TABLE IF NOT EXISTS "Tour" (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"       text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "contactId"     text REFERENCES "Contact"(id) ON DELETE SET NULL,
  "guestName"     text NOT NULL,
  "guestEmail"    text NOT NULL,
  "guestPhone"    text,
  "propertyAddress" text,
  notes           text,
  "startsAt"      timestamptz NOT NULL,
  "endsAt"        timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')),
  "googleEventId" text,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tour_space_starts ON "Tour" ("spaceId", "startsAt" DESC);
CREATE INDEX IF NOT EXISTS idx_tour_contact      ON "Tour" ("contactId");
CREATE INDEX IF NOT EXISTS idx_tour_status       ON "Tour" (status);

-- Google Calendar OAuth tokens
CREATE TABLE IF NOT EXISTS "GoogleCalendarToken" (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"       text UNIQUE NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "accessToken"   text NOT NULL,
  "refreshToken"  text NOT NULL,
  "expiresAt"     timestamptz NOT NULL,
  "calendarId"    text NOT NULL DEFAULT 'primary',
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_brokerage_owner       ON "Brokerage"("ownerId");
CREATE INDEX       IF NOT EXISTS idx_brokerage_status       ON "Brokerage"(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_brokerage_join_code   ON "Brokerage"("joinCode");

-- Migration for existing databases (run if upgrading from a version without joinCode):
-- ALTER TABLE "Brokerage" ADD COLUMN IF NOT EXISTS "joinCode" text UNIQUE;
CREATE INDEX IF NOT EXISTS idx_membership_brokerage         ON "BrokerageMembership"("brokerageId");
CREATE INDEX IF NOT EXISTS idx_membership_user              ON "BrokerageMembership"("userId");
CREATE INDEX IF NOT EXISTS idx_space_brokerage              ON "Space"("brokerageId");
CREATE INDEX IF NOT EXISTS idx_invitation_brokerage         ON "Invitation"("brokerageId");
CREATE INDEX IF NOT EXISTS idx_invitation_email             ON "Invitation"(email);
CREATE INDEX IF NOT EXISTS idx_invitation_token             ON "Invitation"(token);
CREATE INDEX IF NOT EXISTS idx_invitation_status            ON "Invitation"(status);

-- ============================================================
-- AuditLog: immutable event log for compliance and security review
-- Written by lib/audit.ts on all critical Create/Update/Delete operations.
-- Uses service-role key; never directly readable by client keys.
-- ============================================================

CREATE TABLE IF NOT EXISTS "AuditLog" (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "clerkId"     text,
  "ipAddress"   text,
  action        text NOT NULL,
  resource      text NOT NULL,
  "resourceId"  text,
  "spaceId"     text,
  metadata      jsonb,
  "createdAt"   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_clerk_id    ON "AuditLog"("clerkId");
CREATE INDEX IF NOT EXISTS idx_audit_resource    ON "AuditLog"(resource, "resourceId");
CREATE INDEX IF NOT EXISTS idx_audit_space_id    ON "AuditLog"("spaceId");
CREATE INDEX IF NOT EXISTS idx_audit_created_at  ON "AuditLog"("createdAt");

-- ============================================================
-- Row-Level Security
-- All tables have RLS enabled. The application exclusively uses the
-- Supabase service_role key, which bypasses RLS — so application
-- behaviour is unaffected. RLS protects against accidental exposure
-- of the anon/authenticated keys, which would otherwise grant
-- unrestricted table access.
-- ============================================================

ALTER TABLE "User"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Brokerage"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Space"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpaceSetting"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Contact"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DealStage"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Deal"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DealContact"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Message"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BrokerageMembership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invitation"          ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS "TourPropertyProfile" (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"       text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  name            text NOT NULL,
  address         text,
  "tourDuration"  integer NOT NULL DEFAULT 30,
  "startHour"     integer NOT NULL DEFAULT 9,
  "endHour"       integer NOT NULL DEFAULT 17,
  "daysAvailable" integer[] NOT NULL DEFAULT '{1,2,3,4,5}',
  "bufferMinutes" integer NOT NULL DEFAULT 0,
  "isActive"      boolean NOT NULL DEFAULT true,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "TourAvailabilityOverride" (
  id                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"           text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "propertyProfileId" text REFERENCES "TourPropertyProfile"(id) ON DELETE CASCADE,
  date                date NOT NULL,
  "isBlocked"         boolean NOT NULL DEFAULT false,
  "startHour"         integer,
  "endHour"           integer,
  label               text,
  recurrence          text NOT NULL DEFAULT 'none'
                        CHECK (recurrence IN ('none', 'weekly', 'biweekly', 'monthly')),
  "endDate"           date,
  "createdAt"         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_override_space_date
  ON "TourAvailabilityOverride" ("spaceId", date);

ALTER TABLE "TourAvailabilityOverride" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tour"                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GoogleCalendarToken"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentEmbedding"   ENABLE ROW LEVEL SECURITY;

-- No policies are defined here intentionally. With RLS enabled and no
-- permissive policies, the default is DENY ALL for anon and authenticated
-- roles. The service_role key bypasses these restrictions.

-- ============================================================
-- reorder_deal: atomically shift positions and move a deal
-- Runs inside a single transaction, preventing race conditions
-- from concurrent Kanban drag-and-drop reorders.
-- Called via supabase.rpc('reorder_deal', { ... })
-- ============================================================

CREATE OR REPLACE FUNCTION reorder_deal(
  p_deal_id      text,
  p_new_stage_id text,
  p_new_position integer
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Shift deals at or after the target position up by one to make room
  UPDATE "Deal"
  SET position = position + 1
  WHERE "stageId" = p_new_stage_id
    AND position >= p_new_position
    AND id != p_deal_id;

  -- Place the deal at its new stage and position
  UPDATE "Deal"
  SET "stageId"  = p_new_stage_id,
      position   = p_new_position,
      "updatedAt" = now()
  WHERE id = p_deal_id;
END;
$$;

-- ============================================================
-- pgvector: Vector embeddings for AI-powered search
-- Run AFTER enabling the vector extension in Supabase:
--   Dashboard → Database → Extensions → enable "vector"
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS "DocumentEmbedding" (
  id            text PRIMARY KEY,
  "spaceId"     text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "entityType"  text NOT NULL,   -- 'contact' | 'deal'
  "entityId"    text NOT NULL,
  content       text NOT NULL,   -- plain text used to generate the embedding
  embedding     vector(1536)     -- OpenAI text-embedding-3-small output
);

CREATE INDEX IF NOT EXISTS idx_doc_embedding_space  ON "DocumentEmbedding"("spaceId");
CREATE INDEX IF NOT EXISTS idx_doc_embedding_entity ON "DocumentEmbedding"("entityId");
-- HNSW index for fast approximate nearest-neighbour search with cosine distance
CREATE INDEX IF NOT EXISTS idx_doc_embedding_hnsw
  ON "DocumentEmbedding" USING hnsw (embedding vector_cosine_ops);

-- ============================================================
-- match_documents: similarity search RPC used by the AI assistant
-- Called via supabase.rpc('match_documents', { ... })
-- ============================================================

CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(1536),
  match_space_id  text,
  match_count     int DEFAULT 5
)
RETURNS TABLE (
  id          text,
  entity_type text,
  entity_id   text,
  content     text,
  similarity  float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    de.id,
    de."entityType"  AS entity_type,
    de."entityId"    AS entity_id,
    de.content,
    1 - (de.embedding <=> query_embedding) AS similarity
  FROM "DocumentEmbedding" de
  WHERE de."spaceId" = match_space_id
    AND de.embedding IS NOT NULL
  ORDER BY de.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
