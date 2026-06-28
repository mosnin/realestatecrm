-- Performance: cover the last 7 unindexed foreign keys.
--
-- The first FK-index migration (20260805000000) covered 38 FKs that had no
-- index at all. The advisor still flagged 7 more — these have the FK column
-- present in some index but NOT as its leftmost prefix, so the index can't
-- service the FK. Four are single-column; three are composite FKs into the
-- (id, spaceId)/(id, brokerageId) conversation keys (columns confirmed from
-- supabase/schema.sql). Idempotent; plain CREATE INDEX (valid in the txn
-- Supabase db push uses).

CREATE INDEX IF NOT EXISTS idx_artifact_taskid ON public."Artifact" ("taskId");
CREATE INDEX IF NOT EXISTS idx_goaldecomposition_taskid ON public."GoalDecomposition" ("taskId");
CREATE INDEX IF NOT EXISTS idx_inboxthread_contactid ON public."InboxThread" ("contactId");
CREATE INDEX IF NOT EXISTS idx_invitecoderedemption_spaceid ON public."InviteCodeRedemption" ("spaceId");
CREATE INDEX IF NOT EXISTS idx_message_conversationid_spaceid ON public."Message" ("conversationId", "spaceId");
CREATE INDEX IF NOT EXISTS idx_brokermessage_conversationid_brokerageid ON public."BrokerMessage" ("conversationId", "brokerageId");
CREATE INDEX IF NOT EXISTS idx_brokeragechatmessage_conversationid_brokerageid ON public."BrokerageChatMessage" ("conversationId", "brokerageId");
