-- ============================================================================
-- AuditLog step-up columns: reason + confirmationText (SOC2 CC7.3 / CC6.1)
-- ============================================================================
-- Destructive admin actions now require step-up: a free-text justification
-- (reason) and a typed confirmation (confirmationText, e.g. the target user's
-- email or 'DELETE'/'SEND'). lib/admin.logAdminAction already forwards both
-- into AuditLog.metadata; this promotes them to first-class, queryable columns
-- so an auditor can filter "which deletes had no stated reason" directly in SQL
-- instead of digging through JSON.
--
-- Nullable: the vast majority of audit rows (reads, CREATE/UPDATE, non-step-up
-- admin actions) carry neither. Idempotent: ADD COLUMN IF NOT EXISTS.
-- ============================================================================

ALTER TABLE "AuditLog"
  ADD COLUMN IF NOT EXISTS "reason" text;

ALTER TABLE "AuditLog"
  ADD COLUMN IF NOT EXISTS "confirmationText" text;
