-- ============================================================================
-- Enforce message -> conversation brokerage consistency for broker-owned chats.
--
-- BrokerMessage and BrokerageChatMessage both store brokerageId for fast scoped
-- reads. Their parent conversation rows also store brokerageId. A plain FK on
-- conversationId proves the parent exists, but it does NOT prove the child's
-- brokerageId matches the parent. This migration makes that invariant a DB
-- constraint for both broker Chippi and brokerage team chat storage.
-- ============================================================================

-- Heal any pre-existing drift before adding NOT VALID constraints. The backfill
-- migrations populated child brokerageId from the parent, so these should be
-- no-ops unless rows were manually edited or imported incorrectly.
UPDATE "BrokerMessage" bm
SET "brokerageId" = bc."brokerageId"
FROM "BrokerConversation" bc
WHERE bm."conversationId" = bc."id"
  AND bm."brokerageId" IS DISTINCT FROM bc."brokerageId";

UPDATE "BrokerageChatMessage" bcm
SET "brokerageId" = bcc."brokerageId"
FROM "BrokerageChatConversation" bcc
WHERE bcm."conversationId" = bcc."id"
  AND bcm."brokerageId" IS DISTINCT FROM bcc."brokerageId";

-- Composite unique indexes give Postgres a target for the composite FKs.
CREATE UNIQUE INDEX IF NOT EXISTS "BrokerConversation_id_brokerageId_key"
  ON "BrokerConversation" ("id", "brokerageId");

CREATE UNIQUE INDEX IF NOT EXISTS "BrokerageChatConversation_id_brokerageId_key"
  ON "BrokerageChatConversation" ("id", "brokerageId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'BrokerMessage_conversation_brokerage_fk'
  ) THEN
    ALTER TABLE "BrokerMessage"
      ADD CONSTRAINT "BrokerMessage_conversation_brokerage_fk"
      FOREIGN KEY ("conversationId", "brokerageId")
      REFERENCES "BrokerConversation" ("id", "brokerageId")
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'BrokerageChatMessage_conversation_brokerage_fk'
  ) THEN
    ALTER TABLE "BrokerageChatMessage"
      ADD CONSTRAINT "BrokerageChatMessage_conversation_brokerage_fk"
      FOREIGN KEY ("conversationId", "brokerageId")
      REFERENCES "BrokerageChatConversation" ("id", "brokerageId")
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

ALTER TABLE "BrokerMessage"
  VALIDATE CONSTRAINT "BrokerMessage_conversation_brokerage_fk";

ALTER TABLE "BrokerageChatMessage"
  VALIDATE CONSTRAINT "BrokerageChatMessage_conversation_brokerage_fk";
