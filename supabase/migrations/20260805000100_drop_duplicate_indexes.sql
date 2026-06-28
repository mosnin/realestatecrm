-- Performance: drop redundant duplicate indexes.
--
-- The performance advisor flagged four pairs of byte-for-byte identical indexes
-- on the prod DB. They arose because the consolidated schema snapshots
-- (supabase/schema.sql, setup.sql) create the `idx_*`-named index while an
-- older one-off migration had already created an equivalently-shaped index
-- under a different name — both got applied. A duplicate index doubles write
-- cost and storage for zero read benefit.
--
-- Keep the canonical `idx_*` name (the one in schema.sql) and drop the older
-- redundant copy. Verified against the live catalog: each pair indexes the SAME
-- column(s) and NONE backs a constraint, so dropping the copy is safe. (Note:
-- Space's `idx_space_owner_clerk` is misleadingly named — it indexes "ownerId",
-- identical to idx_space_owner_id.)
--
-- IF EXISTS keeps this idempotent and harmless if a copy was already removed.

DROP INDEX IF EXISTS public.audit_log_space_idx;      -- keep idx_audit_space_id
DROP INDEX IF EXISTS public.audit_log_resource_idx;   -- keep idx_audit_resource
DROP INDEX IF EXISTS public.deal_contact_contact_idx; -- keep idx_dealcontact_contact
DROP INDEX IF EXISTS public.idx_space_owner_clerk;    -- keep idx_space_owner_id
