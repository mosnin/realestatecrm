-- ============================================================================
-- Enforce message -> conversation space consistency for realtor chat.
--
-- Message carries spaceId for fast scoped reads, and Conversation carries the
-- authoritative parent spaceId. A plain FK on conversationId proves the parent
-- exists, but it does not prove the child row's spaceId matches the parent.
-- This mirrors the broker brokerage constraint and makes realtor message
-- bleed-over across spaces a database-level invariant too.
-- ============================================================================

UPDATE "Message" m
SET "spaceId" = c."spaceId"
FROM "Conversation" c
WHERE m."conversationId" = c."id"
  AND m."spaceId" IS DISTINCT FROM c."spaceId";

CREATE UNIQUE INDEX IF NOT EXISTS "Conversation_id_spaceId_key"
  ON "Conversation" ("id", "spaceId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Message_conversation_space_fk'
  ) THEN
    ALTER TABLE "Message"
      ADD CONSTRAINT "Message_conversation_space_fk"
      FOREIGN KEY ("conversationId", "spaceId")
      REFERENCES "Conversation" ("id", "spaceId")
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

ALTER TABLE "Message"
  VALIDATE CONSTRAINT "Message_conversation_space_fk";
