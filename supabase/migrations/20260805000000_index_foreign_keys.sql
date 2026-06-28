-- Performance: cover unindexed foreign keys.
--
-- The Supabase performance advisor flagged 38 foreign keys with no covering
-- index. An unindexed FK forces a sequential scan on the child table for every
-- parent delete/update (to enforce the constraint) and slows the `.eq(fk, …)`
-- lookups the app does constantly (e.g. AgentDraft by contactId, DealContact by
-- contact). Each index below covers exactly one FK's column(s).
--
-- Idempotent (IF NOT EXISTS) so re-running is a no-op. Plain CREATE INDEX (not
-- CONCURRENTLY): Supabase `db push` runs each migration in a transaction, where
-- CONCURRENTLY is illegal; these tables are moderate-sized so the brief lock is
-- acceptable. Names are deterministic: idx_<table>_<column(s)>.

CREATE INDEX IF NOT EXISTS idx_agentactivitylog_relatedcontactid ON public."AgentActivityLog" ("relatedContactId");
CREATE INDEX IF NOT EXISTS idx_agentactivitylog_relateddealid ON public."AgentActivityLog" ("relatedDealId");
CREATE INDEX IF NOT EXISTS idx_agentdraft_dealid ON public."AgentDraft" ("dealId");
CREATE INDEX IF NOT EXISTS idx_agentdraft_contactid ON public."AgentDraft" ("contactId");
CREATE INDEX IF NOT EXISTS idx_artifact_stepid ON public."Artifact" ("stepId");
CREATE INDEX IF NOT EXISTS idx_artifact_currentversionid ON public."Artifact" ("currentVersionId");
CREATE INDEX IF NOT EXISTS idx_brokerage_lastassigneduserid ON public."Brokerage" ("lastAssignedUserId");
CREATE INDEX IF NOT EXISTS idx_brokeragechatmessage_senderuserid ON public."BrokerageChatMessage" ("senderUserId");
CREATE INDEX IF NOT EXISTS idx_brokeragemembership_invitedbyid ON public."BrokerageMembership" ("invitedById");
CREATE INDEX IF NOT EXISTS idx_brokerageremoval_removedbyid ON public."BrokerageRemoval" ("removedById");
CREATE INDEX IF NOT EXISTS idx_brokeragetemplate_createdbyuserid ON public."BrokerageTemplate" ("createdByUserId");
CREATE INDEX IF NOT EXISTS idx_calendareventmirror_sourcetourid ON public."CalendarEventMirror" ("sourceTourId");
CREATE INDEX IF NOT EXISTS idx_clientdocument_spaceid ON public."ClientDocument" ("spaceId");
CREATE INDEX IF NOT EXISTS idx_clientinforequest_spaceid ON public."ClientInfoRequest" ("spaceId");
CREATE INDEX IF NOT EXISTS idx_clientmessage_spaceid ON public."ClientMessage" ("spaceId");
CREATE INDEX IF NOT EXISTS idx_commissionledger_referraluserid ON public."CommissionLedger" ("referralUserId");
CREATE INDEX IF NOT EXISTS idx_contact_sourcetourid ON public."Contact" ("sourceTourId");
CREATE INDEX IF NOT EXISTS idx_contactdocument_spaceid ON public."ContactDocument" ("spaceId");
CREATE INDEX IF NOT EXISTS idx_dealreviewcomment_authoruserid ON public."DealReviewComment" ("authorUserId");
CREATE INDEX IF NOT EXISTS idx_dealreviewrequest_resolvedbyuserid ON public."DealReviewRequest" ("resolvedByUserId");
CREATE INDEX IF NOT EXISTS idx_dealreviewrequest_requestinguserid ON public."DealReviewRequest" ("requestingUserId");
CREATE INDEX IF NOT EXISTS idx_dealroutingrule_destinationuserid ON public."DealRoutingRule" ("destinationUserId");
CREATE INDEX IF NOT EXISTS idx_inboxmessage_agentdraftid ON public."InboxMessage" ("agentDraftId");
CREATE INDEX IF NOT EXISTS idx_inboxmessage_contactid ON public."InboxMessage" ("contactId");
CREATE INDEX IF NOT EXISTS idx_integrationevent_connectionid ON public."IntegrationEvent" ("connectionId");
CREATE INDEX IF NOT EXISTS idx_integrationevent_triggerid ON public."IntegrationEvent" ("triggerId");
CREATE INDEX IF NOT EXISTS idx_invitation_invitedbyid ON public."Invitation" ("invitedById");
CREATE INDEX IF NOT EXISTS idx_mcpauthcode_spaceid ON public."McpAuthCode" ("spaceId");
CREATE INDEX IF NOT EXISTS idx_studiobrand_logofileid ON public."StudioBrand" ("logoFileId");
CREATE INDEX IF NOT EXISTS idx_studiobrand_headshotfileid ON public."StudioBrand" ("headshotFileId");
CREATE INDEX IF NOT EXISTS idx_studiogeneration_sourcefileid ON public."StudioGeneration" ("sourceFileId");
CREATE INDEX IF NOT EXISTS idx_studiogeneration_fileid ON public."StudioGeneration" ("fileId");
CREATE INDEX IF NOT EXISTS idx_studiopost_fileid ON public."StudioPost" ("fileId");
CREATE INDEX IF NOT EXISTS idx_swarmevent_memberid ON public."SwarmEvent" ("memberId");
CREATE INDEX IF NOT EXISTS idx_swarmmember_customagentid ON public."SwarmMember" ("customAgentId");
CREATE INDEX IF NOT EXISTS idx_touravailabilityoverride_propertyprofileid ON public."TourAvailabilityOverride" ("propertyProfileId");
CREATE INDEX IF NOT EXISTS idx_tourwaitlist_propertyprofileid ON public."TourWaitlist" ("propertyProfileId");
CREATE INDEX IF NOT EXISTS idx_user_offboardedtouserid ON public."User" ("offboardedToUserId");
