-- Agentic features foundation: goals, questions, confidence, outcomes

-- AgentGoal: tracks multi-step agent objectives for a contact or deal
CREATE TABLE IF NOT EXISTS "AgentGoal" (
  "id"           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "spaceId"      UUID        NOT NULL REFERENCES "Space"("id") ON DELETE CASCADE,
  "contactId"    UUID        REFERENCES "Contact"("id") ON DELETE SET NULL,
  "dealId"       UUID        REFERENCES "Deal"("id") ON DELETE SET NULL,
  "goalType"     VARCHAR(50) NOT NULL,
  "description"  TEXT        NOT NULL,
  "instructions" TEXT,
  "status"       VARCHAR(20) NOT NULL DEFAULT 'active',
  "priority"     INTEGER     NOT NULL DEFAULT 0,
  "metadata"     JSONB       NOT NULL DEFAULT '{}',
  "completedAt"  TIMESTAMPTZ,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "AgentGoal_spaceId_status_idx" ON "AgentGoal"("spaceId", "status");
CREATE INDEX IF NOT EXISTS "AgentGoal_contactId_idx"      ON "AgentGoal"("contactId") WHERE "contactId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "AgentGoal_dealId_idx"         ON "AgentGoal"("dealId")    WHERE "dealId"    IS NOT NULL;

-- AgentQuestion: questions the agent asks the realtor when uncertain
CREATE TABLE IF NOT EXISTS "AgentQuestion" (
  "id"          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "spaceId"     UUID        NOT NULL REFERENCES "Space"("id") ON DELETE CASCADE,
  "runId"       VARCHAR(100) NOT NULL,
  "agentType"   VARCHAR(50)  NOT NULL,
  "question"    TEXT         NOT NULL,
  "context"     TEXT,
  "status"      VARCHAR(20)  NOT NULL DEFAULT 'pending',
  "answer"      TEXT,
  "answeredAt"  TIMESTAMPTZ,
  "priority"    INTEGER      NOT NULL DEFAULT 0,
  "contactId"   UUID         REFERENCES "Contact"("id") ON DELETE SET NULL,
  "createdAt"   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "AgentQuestion_spaceId_status_idx" ON "AgentQuestion"("spaceId", "status");

-- AgentDraft: add confidence score and outcome tracking
ALTER TABLE "AgentDraft"
  ADD COLUMN IF NOT EXISTS "confidence"        INTEGER,
  ADD COLUMN IF NOT EXISTS "outcome"           VARCHAR(30),
  ADD COLUMN IF NOT EXISTS "outcomeDetectedAt" TIMESTAMPTZ;

-- AgentSettings: add confidence threshold for autonomous gating
ALTER TABLE "AgentSettings"
  ADD COLUMN IF NOT EXISTS "confidenceThreshold" INTEGER NOT NULL DEFAULT 0;

-- Add updatedAt trigger helper for AgentGoal
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW."updatedAt" = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AgentGoal_updatedAt"
  BEFORE UPDATE ON "AgentGoal"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
