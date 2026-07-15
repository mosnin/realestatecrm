-- Make AuditLog genuinely append-only at the DB layer (SOC2 CC7.3 / tamper-evidence).
--
-- Today AuditLog has RLS enabled with no policy (deny-all for anon/authenticated),
-- but every server write uses the SERVICE-ROLE key, which BYPASSES RLS — so
-- nothing stops app code (or a leaked service key) from UPDATE/DELETE-ing audit
-- rows. A BEFORE UPDATE OR DELETE trigger blocks mutation for EVERY role,
-- including the table owner and service role, which RLS cannot do.
--
-- Idempotent: function + trigger are CREATE OR REPLACE / DROP-then-CREATE.

CREATE OR REPLACE FUNCTION "auditlog_block_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS "auditlog_no_update_delete" ON "AuditLog";
CREATE TRIGGER "auditlog_no_update_delete"
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW
  EXECUTE FUNCTION "auditlog_block_mutation"();

-- Belt-and-suspenders at the grant layer too (the trigger is the real guard;
-- this makes intent explicit and blocks TRUNCATE, which triggers don't catch).
REVOKE UPDATE, DELETE, TRUNCATE ON "AuditLog" FROM PUBLIC;
