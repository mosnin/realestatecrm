-- Performance/storage: drop unused btree indexes.
--
-- These 112 indexes have ZERO scans since the stats epoch (2026-02-12 — a
-- ~4.5-month representative window; hot indexes like idx_contact_space_id show
-- 20k+ scans over the same period, confirming the stats are real). An unused
-- index is pure write- and storage-overhead.
--
-- Safety filters applied against the live catalog:
--   - btree only — vector (hnsw), GIN, and GiST indexes are EXCLUDED even when
--     unused, since they back semantic search / jsonb / full-text where a seq
--     scan fallback would be catastrophic (e.g. AgentMemory_embedding_idx).
--   - EXCLUDED anything backing a PRIMARY KEY, UNIQUE, or other constraint.
--   - EXCLUDED the 45 foreign-key indexes added earlier in this batch (they read
--     as "unused" only because they're brand new).
-- Idempotent (IF EXISTS); recreatable from schema.sql if a rare query needs one.

DROP INDEX IF EXISTS public."AffiliateAccount_userId_idx";
DROP INDEX IF EXISTS public."AgentActivityLog_runId_idx";
DROP INDEX IF EXISTS public."AgentGoal_dealId_idx";
DROP INDEX IF EXISTS public."idx_agent_goal_next_action";
DROP INDEX IF EXISTS public."AgentMemory_sourceRunId_idx";
DROP INDEX IF EXISTS public."AgentMemory_sourceToolName_idx";
DROP INDEX IF EXISTS public."AgentMemory_spaceId_taskId_idx";
DROP INDEX IF EXISTS public."AgentMemory_taskId_idx";
DROP INDEX IF EXISTS public."AgentPausedRun_userId_idx";
DROP INDEX IF EXISTS public."AgentTask_parentTaskId_idx";
DROP INDEX IF EXISTS public."AgentTrajectory_runId_idx";
DROP INDEX IF EXISTS public."AgentTrajectory_spaceId_provider_idx";
DROP INDEX IF EXISTS public."AgentTrajectory_spaceId_startedAt_idx";
DROP INDEX IF EXISTS public."AnnouncementDismissal_user_idx";
DROP INDEX IF EXISTS public."AppKnowledgeDoc_category_idx";
DROP INDEX IF EXISTS public."idx_app_message_unread";
DROP INDEX IF EXISTS public."Artifact_spaceId_status_idx";
DROP INDEX IF EXISTS public."Artifact_spaceId_taskId_idx";
DROP INDEX IF EXISTS public."ArtifactVersion_artifactId_idx";
DROP INDEX IF EXISTS public."Attachment_conversationId_idx";
DROP INDEX IF EXISTS public."audit_actor_created_idx";
DROP INDEX IF EXISTS public."audit_log_actor_idx";
DROP INDEX IF EXISTS public."audit_resource_created_idx";
DROP INDEX IF EXISTS public."idx_audit_clerk_id";
DROP INDEX IF EXISTS public."idx_audit_resource";
DROP INDEX IF EXISTS public."idx_audit_space_id";
DROP INDEX IF EXISTS public."BrokerMessage_brokerageId_conversationId_createdAt_idx";
DROP INDEX IF EXISTS public."BrokerRoutine_brokerage_idx";
DROP INDEX IF EXISTS public."Brokerage_compAccess_idx";
DROP INDEX IF EXISTS public."idx_brokerage_stripe_customer";
DROP INDEX IF EXISTS public."idx_brokerage_stripe_sub";
DROP INDEX IF EXISTS public."BrokerageChatConversation_brokerageId_updatedAt_idx";
DROP INDEX IF EXISTS public."BrokerageChatMessage_brokerageId_conversationId_createdAt_idx";
DROP INDEX IF EXISTS public."BrokerageChatMessage_brokerageId_createdAt_idx";
DROP INDEX IF EXISTS public."BrokerageChatMessage_conversationId_createdAt_idx";
DROP INDEX IF EXISTS public."BrokerageIntegrationConnection_brokerageId_idx";
DROP INDEX IF EXISTS public."BrokerageIntegrationConnection_userId_idx";
DROP INDEX IF EXISTS public."idx_brokerage_removal_user";
DROP INDEX IF EXISTS public."idx_brokerage_template_brokerage_updated";
DROP INDEX IF EXISTS public."CalendarEventMirror_external_idx";
DROP INDEX IF EXISTS public."CalendarEventMirror_space_start_idx";
DROP INDEX IF EXISTS public."idx_calendar_note_space_date";
DROP INDEX IF EXISTS public."CallLog_contactId_createdAt_idx";
DROP INDEX IF EXISTS public."CallLog_spaceId_createdAt_idx";
DROP INDEX IF EXISTS public."CallLog_telnyxCallId_idx";
DROP INDEX IF EXISTS public."ChatUsage_spaceId_model_idx";
DROP INDEX IF EXISTS public."ChatUsage_spaceId_provider_idx";
DROP INDEX IF EXISTS public."idx_commission_agent";
DROP INDEX IF EXISTS public."idx_commission_brokerage";
DROP INDEX IF EXISTS public."idx_commission_status";
DROP INDEX IF EXISTS public."idx_commission_split_deal";
DROP INDEX IF EXISTS public."idx_contact_email";
DROP INDEX IF EXISTS public."idx_contact_form_lead_type";
DROP INDEX IF EXISTS public."idx_contact_next_touch";
DROP INDEX IF EXISTS public."idx_contact_phone";
DROP INDEX IF EXISTS public."idx_contact_relationship_stage";
DROP INDEX IF EXISTS public."idx_contact_snoozed";
DROP INDEX IF EXISTS public."idx_creditlot_expiry";
DROP INDEX IF EXISTS public."CustomAgent_spaceId_idx";
DROP INDEX IF EXISTS public."DeadLetterEvent_eventType_idx";
DROP INDEX IF EXISTS public."DeadLetterEvent_spaceId_status_idx";
DROP INDEX IF EXISTS public."idx_deal_next_action_due";
DROP INDEX IF EXISTS public."idx_deal_stage_id";
DROP INDEX IF EXISTS public."idx_deal_activity_type";
DROP INDEX IF EXISTS public."idx_deal_checklist_reminder_due";
DROP INDEX IF EXISTS public."idx_deal_contact_role";
DROP INDEX IF EXISTS public."idx_dealcontact_contact";
DROP INDEX IF EXISTS public."idx_deal_document_deal";
DROP INDEX IF EXISTS public."idx_dealreview_deal";
DROP INDEX IF EXISTS public."idx_deal_routing_rule_brokerage_enabled";
DROP INDEX IF EXISTS public."idx_deal_stage_kind";
DROP INDEX IF EXISTS public."DisabledSpace_spaceId_isActive_idx";
DROP INDEX IF EXISTS public."embedding_entity_idx";
DROP INDEX IF EXISTS public."idx_doc_embedding_entity";
DROP INDEX IF EXISTS public."ExecutionStep_idempotencyKey_idx";
DROP INDEX IF EXISTS public."ExecutionStep_taskId_stepIndex_idx";
DROP INDEX IF EXISTS public."File_spaceId_createdAt_idx";
DROP INDEX IF EXISTS public."File_userId_createdAt_idx";
DROP INDEX IF EXISTS public."idx_form_analytics_event_type";
DROP INDEX IF EXISTS public."idx_form_analytics_session";
DROP INDEX IF EXISTS public."idx_form_draft_expires_at";
DROP INDEX IF EXISTS public."idx_form_draft_resume_token";
DROP INDEX IF EXISTS public."GoalDecomposition_spaceId_taskId_idx";
DROP INDEX IF EXISTS public."InboxMessage_thread_createdAt_idx";
DROP INDEX IF EXISTS public."InboxThread_space_lastMessageAt_idx";
DROP INDEX IF EXISTS public."IntegrationTrigger_composioTriggerId_idx";
DROP INDEX IF EXISTS public."idx_invitation_email";
DROP INDEX IF EXISTS public."InviteCodeRedemption_code_idx";
DROP INDEX IF EXISTS public."idx_mcp_api_key_client_id";
DROP INDEX IF EXISTS public."idx_mcp_api_key_expires";
DROP INDEX IF EXISTS public."idx_mcp_api_key_hash";
DROP INDEX IF EXISTS public."idx_message_template_source";
DROP INDEX IF EXISTS public."PushSubscription_spaceId_idx";
DROP INDEX IF EXISTS public."SignatureRequest_dealId_idx";
DROP INDEX IF EXISTS public."SignatureRequest_envelopeId_idx";
DROP INDEX IF EXISTS public."SignatureRequest_spaceId_createdAt_idx";
DROP INDEX IF EXISTS public."Space_compAccess_idx";
DROP INDEX IF EXISTS public."idx_space_brokerage";
DROP INDEX IF EXISTS public."idx_space_stripe_customer";
DROP INDEX IF EXISTS public."idx_space_setting_form_config_source";
DROP INDEX IF EXISTS public."StudioGeneration_falRequestId_idx";
DROP INDEX IF EXISTS public."SupportTicket_createdAt_idx";
DROP INDEX IF EXISTS public."SupportTicket_spaceId_idx";
DROP INDEX IF EXISTS public."SupportTicket_status_idx";
DROP INDEX IF EXISTS public."SwarmEvent_swarmRunId_createdAt_idx";
DROP INDEX IF EXISTS public."SwarmMember_swarmRunId_idx";
DROP INDEX IF EXISTS public."SwarmRun_spaceId_createdAt_idx";
DROP INDEX IF EXISTS public."TaskCheckpoint_taskId_idx";
DROP INDEX IF EXISTS public."TaskDependency_dependsOnTaskId_idx";
DROP INDEX IF EXISTS public."TaskDependency_taskId_idx";
DROP INDEX IF EXISTS public."idx_tour_manage_token";
DROP INDEX IF EXISTS public."idx_tour_property";
