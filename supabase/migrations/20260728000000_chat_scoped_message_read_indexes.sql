-- ============================================================================
-- Cover the scoped chat message reads used by realtor and broker Chippi.
--
-- The application now deliberately reads child messages with BOTH the parent
-- scope column and conversation id (`spaceId` + `conversationId` for realtor,
-- `brokerageId` + `conversationId` for broker). These indexes make that safe
-- pattern the fast path too, so future performance tuning does not incentivize
-- dropping the scope predicate.
-- ============================================================================

CREATE INDEX IF NOT EXISTS "Message_spaceId_conversationId_createdAt_idx"
  ON "Message" ("spaceId", "conversationId", "createdAt");

CREATE INDEX IF NOT EXISTS "BrokerMessage_brokerageId_conversationId_createdAt_idx"
  ON "BrokerMessage" ("brokerageId", "conversationId", "createdAt");

CREATE INDEX IF NOT EXISTS "BrokerageChatMessage_brokerageId_conversationId_createdAt_idx"
  ON "BrokerageChatMessage" ("brokerageId", "conversationId", "createdAt");
