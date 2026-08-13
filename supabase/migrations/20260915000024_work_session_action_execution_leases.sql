-- Durable execution fence for the quarantined WorkSessionAction path.
--
-- Approval and provider execution were previously split by an unleased
-- process boundary: a crash after the provider accepted an email but before
-- the terminal database write left an approved row forever, and blindly
-- retrying it could duplicate the side effect. This migration adds an opaque
-- claim/lease, bounded retry accounting, an action-scoped provider key, and a
-- recovery query. It does not enable proposal/review product surfaces.

ALTER TABLE public."WorkSessionAction"
  ADD COLUMN IF NOT EXISTS "executionClaimToken" text,
  ADD COLUMN IF NOT EXISTS "executionLeaseExpiresAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "executionAttempts" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "executionFirstAttemptAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "executionIdempotencyKey" text,
  ADD COLUMN IF NOT EXISTS "reconciliationRequiredAt" timestamptz;

ALTER TABLE public."WorkSessionAction"
  DROP CONSTRAINT IF EXISTS "WorkSessionAction_executionAttempts_check";
ALTER TABLE public."WorkSessionAction"
  ADD CONSTRAINT "WorkSessionAction_executionAttempts_check"
  CHECK ("executionAttempts" >= 0);

-- Resend evaluates idempotency at the account/provider boundary, not merely
-- inside one tenant, so the stable provider key is globally unique.
CREATE UNIQUE INDEX IF NOT EXISTS uq_wsaction_execution_idempotency_key
  ON public."WorkSessionAction"("executionIdempotencyKey")
  WHERE "executionIdempotencyKey" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wsaction_execution_recovery
  ON public."WorkSessionAction"("executionLeaseExpiresAt", "createdAt")
  WHERE status = 'approved';

-- Older direct writers could complete a parent after counting only proposed
-- children while another child was already approved/in flight. Reopen only
-- that invalid completed state so the null-key recovery path can mark the
-- ambiguous approval for manual reconciliation. Failed/cancelled parents are
-- intentionally not resurrected.
UPDATE public."WorkSession" AS session
SET status = 'awaiting_actions',
    "completedAt" = NULL,
    "updatedAt" = now()
WHERE session.status = 'completed'
  AND EXISTS (
    SELECT 1
    FROM public."WorkSessionAction" AS action
    WHERE action."sessionId" = session.id
      AND action."spaceId" = session."spaceId"
      AND action.status = 'approved'
  );

-- Fence direct writes from an older app instance during migration rollout.
-- Current main historically updated WorkSessionAction rows through PostgREST,
-- so disabling only the old RPC is insufficient: proposed -> approved must
-- carry the v2 action key in the same statement, and approved -> terminal must
-- either own a lease or be an explicit fail-closed reconciliation transition.
CREATE OR REPLACE FUNCTION public.enforce_work_session_action_execution_fence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status = 'proposed' AND NEW.status = 'approved' AND (
    NEW."executionIdempotencyKey" IS NULL
    OR NEW."executionIdempotencyKey" IS DISTINCT FROM
      'work-session-action-' || md5(NEW.id)
  ) THEN
    RAISE EXCEPTION 'WorkSession approval requires the durable v2 authority';
  END IF;

  IF OLD.status = 'approved'
    AND NEW.status IN ('executed','failed')
    AND OLD."executionClaimToken" IS NULL
    AND NEW."reconciliationRequiredAt" IS NULL
  THEN
    RAISE EXCEPTION 'WorkSession action finish requires an execution lease';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_work_session_action_execution_fence
  ON public."WorkSessionAction";
CREATE TRIGGER enforce_work_session_action_execution_fence
BEFORE UPDATE OF status ON public."WorkSessionAction"
FOR EACH ROW
EXECUTE FUNCTION public.enforce_work_session_action_execution_fence();

-- An old app's completeIfSettled() counted only proposed children. Prevent it
-- from closing an awaiting-actions parent while an approved child remains for
-- the durable recovery rail.
CREATE OR REPLACE FUNCTION public.enforce_work_session_action_parent_completion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status = 'awaiting_actions' AND NEW.status = 'completed' AND EXISTS (
    SELECT 1
    FROM public."WorkSessionAction" AS pending
    WHERE pending."sessionId" = OLD.id
      AND pending."spaceId" = OLD."spaceId"
      AND pending.status IN ('proposed','approved')
  ) THEN
    RAISE EXCEPTION 'WorkSession still has unsettled actions';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_work_session_action_parent_completion
  ON public."WorkSession";
CREATE TRIGGER enforce_work_session_action_parent_completion
BEFORE UPDATE OF status ON public."WorkSession"
FOR EACH ROW
EXECUTE FUNCTION public.enforce_work_session_action_parent_completion();

-- V2 is intentionally a distinct authority. During a rolling deployment an
-- old application process must not receive a newly-keyed approval and then
-- perform an unkeyed provider call. The historical authority below is changed
-- to fail closed for approve while preserving denial compatibility.
CREATE OR REPLACE FUNCTION public.claim_work_session_action_decision_v2(
  p_session_id text,
  p_action_id text,
  p_space_id text,
  p_decision text,
  p_decided_by_user_id text
)
RETURNS TABLE(id text, tool text, args jsonb, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public."WorkSession"%ROWTYPE;
  v_next_status text;
  v_action_id text;
  v_action_tool text;
  v_action_args jsonb;
BEGIN
  IF NULLIF(btrim(p_session_id), '') IS NULL
    OR NULLIF(btrim(p_action_id), '') IS NULL
    OR NULLIF(btrim(p_space_id), '') IS NULL
    OR NULLIF(btrim(p_decided_by_user_id), '') IS NULL
    OR length(p_session_id) > 200
    OR length(p_action_id) > 200
    OR length(p_space_id) > 200
    OR length(p_decided_by_user_id) > 200
    OR p_decision IS NULL
    OR p_decision NOT IN ('approve','deny')
  THEN
    RAISE EXCEPTION 'invalid WorkSession action decision';
  END IF;

  SELECT * INTO v_session
  FROM public."WorkSession"
  WHERE "WorkSession".id = p_session_id
    AND "WorkSession"."spaceId" = p_space_id
  FOR UPDATE;
  IF NOT FOUND OR v_session.status <> 'awaiting_actions' THEN RETURN; END IF;

  v_next_status := CASE WHEN p_decision = 'approve' THEN 'approved' ELSE 'denied' END;
  UPDATE public."WorkSessionAction" AS action
  SET status = v_next_status,
      "decidedByUserId" = p_decided_by_user_id,
      "decidedAt" = now(),
      "executionIdempotencyKey" = CASE
        WHEN p_decision = 'approve'
          THEN 'work-session-action-' || md5(action.id)
        ELSE action."executionIdempotencyKey"
      END
  WHERE action.id = p_action_id
    AND action."sessionId" = p_session_id
    AND action."spaceId" = p_space_id
    AND action.status = 'proposed'
  RETURNING action.id, action.tool, action.args
  INTO v_action_id, v_action_tool, v_action_args;

  IF NOT FOUND THEN RETURN; END IF;
  IF p_decision = 'deny' AND NOT EXISTS (
    SELECT 1 FROM public."WorkSessionAction" AS pending
    WHERE pending."sessionId" = p_session_id
      AND pending."spaceId" = p_space_id
      AND pending.status IN ('proposed','approved')
  ) THEN
    UPDATE public."WorkSession"
    SET status = 'completed', "completedAt" = now(), "updatedAt" = now()
    WHERE "WorkSession".id = p_session_id
      AND "WorkSession"."spaceId" = p_space_id
      AND "WorkSession".status = 'awaiting_actions';
  END IF;
  RETURN QUERY SELECT v_action_id, v_action_tool, v_action_args, v_next_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_work_session_action_decision(
  p_session_id text,
  p_action_id text,
  p_space_id text,
  p_decision text,
  p_decided_by_user_id text
)
RETURNS TABLE(id text, tool text, args jsonb, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_decision = 'approve' THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT decision.id, decision.tool, decision.args, decision.status
  FROM public.claim_work_session_action_decision_v2(
    p_session_id, p_action_id, p_space_id, p_decision, p_decided_by_user_id
  ) AS decision;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_work_session_action_execution(
  p_session_id text,
  p_action_id text,
  p_space_id text,
  p_claim_token text,
  p_lease_seconds integer DEFAULT 120
)
RETURNS TABLE(
  disposition text,
  id text,
  tool text,
  args jsonb,
  "executionIdempotencyKey" text,
  "executionAttempts" integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public."WorkSession"%ROWTYPE;
  v_action public."WorkSessionAction"%ROWTYPE;
  v_attempts integer;
BEGIN
  IF NULLIF(btrim(p_session_id), '') IS NULL
    OR NULLIF(btrim(p_action_id), '') IS NULL
    OR NULLIF(btrim(p_space_id), '') IS NULL
    OR NULLIF(btrim(p_claim_token), '') IS NULL
    OR p_claim_token !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR p_lease_seconds IS NULL
    OR p_lease_seconds NOT BETWEEN 30 AND 600
    OR length(p_session_id) > 200
    OR length(p_action_id) > 200
    OR length(p_space_id) > 200
  THEN
    RAISE EXCEPTION 'invalid WorkSession action execution claim';
  END IF;

  SELECT * INTO v_session
  FROM public."WorkSession"
  WHERE "WorkSession".id = p_session_id
    AND "WorkSession"."spaceId" = p_space_id
  FOR UPDATE;
  IF NOT FOUND OR v_session.status <> 'awaiting_actions' THEN RETURN; END IF;

  SELECT * INTO v_action
  FROM public."WorkSessionAction" AS action
  WHERE action.id = p_action_id
    AND action."sessionId" = p_session_id
    AND action."spaceId" = p_space_id
  FOR UPDATE;
  IF NOT FOUND OR v_action.status <> 'approved' THEN RETURN; END IF;

  -- Never auto-retry an approval that predates provider idempotency. Its side
  -- effect may already have happened under the old executor.
  IF v_action."executionIdempotencyKey" IS NULL
    OR v_action."executionIdempotencyKey" IS DISTINCT FROM
      'work-session-action-' || md5(v_action.id)
  THEN
    UPDATE public."WorkSessionAction"
    SET status = 'failed',
        result = NULL,
        error = 'Legacy approved action requires manual reconciliation; automatic retry was not attempted.',
        "executionClaimToken" = NULL,
        "executionLeaseExpiresAt" = NULL,
        "reconciliationRequiredAt" = now(),
        "executedAt" = now()
    WHERE "WorkSessionAction".id = v_action.id;

    IF NOT EXISTS (
      SELECT 1 FROM public."WorkSessionAction" AS pending
      WHERE pending."sessionId" = p_session_id
        AND pending."spaceId" = p_space_id
        AND pending.status IN ('proposed','approved')
    ) THEN
      UPDATE public."WorkSession"
      SET status = 'completed', "completedAt" = now(), "updatedAt" = now()
      WHERE "WorkSession".id = p_session_id
        AND "WorkSession"."spaceId" = p_space_id
        AND "WorkSession".status = 'awaiting_actions';
    END IF;

    RETURN QUERY SELECT
      'reconciliation_required'::text, v_action.id, v_action.tool,
      v_action.args, v_action."executionIdempotencyKey", v_action."executionAttempts";
    RETURN;
  END IF;

  IF v_action."executionClaimToken" IS NOT NULL
    AND v_action."executionLeaseExpiresAt" IS NOT NULL
    AND v_action."executionLeaseExpiresAt" >= now()
  THEN
    RETURN;
  END IF;

  -- Resend retains provider idempotency keys for 24 hours. Stop one hour
  -- earlier so a delayed recovery can never issue the same external request
  -- after the provider's duplicate-suppression window has expired.
  IF v_action."executionFirstAttemptAt" IS NOT NULL
    AND v_action."executionFirstAttemptAt" <= now() - interval '23 hours'
  THEN
    UPDATE public."WorkSessionAction"
    SET status = 'failed',
        result = NULL,
        error = 'The provider idempotency retry window expired; manual reconciliation is required.',
        "executionClaimToken" = NULL,
        "executionLeaseExpiresAt" = NULL,
        "reconciliationRequiredAt" = now(),
        "executedAt" = now()
    WHERE "WorkSessionAction".id = v_action.id;

    IF NOT EXISTS (
      SELECT 1 FROM public."WorkSessionAction" AS pending
      WHERE pending."sessionId" = p_session_id
        AND pending."spaceId" = p_space_id
        AND pending.status IN ('proposed','approved')
    ) THEN
      UPDATE public."WorkSession"
      SET status = 'completed', "completedAt" = now(), "updatedAt" = now()
      WHERE "WorkSession".id = p_session_id
        AND "WorkSession"."spaceId" = p_space_id
        AND "WorkSession".status = 'awaiting_actions';
    END IF;

    RETURN QUERY SELECT
      'reconciliation_required'::text, v_action.id, v_action.tool,
      v_action.args, v_action."executionIdempotencyKey", v_action."executionAttempts";
    RETURN;
  END IF;

  IF v_action."executionAttempts" >= 5 THEN
    UPDATE public."WorkSessionAction"
    SET status = 'failed',
        result = NULL,
        error = 'Automatic action retries were exhausted; manual reconciliation is required.',
        "executionClaimToken" = NULL,
        "executionLeaseExpiresAt" = NULL,
        "reconciliationRequiredAt" = now(),
        "executedAt" = now()
    WHERE "WorkSessionAction".id = v_action.id;

    IF NOT EXISTS (
      SELECT 1 FROM public."WorkSessionAction" AS pending
      WHERE pending."sessionId" = p_session_id
        AND pending."spaceId" = p_space_id
        AND pending.status IN ('proposed','approved')
    ) THEN
      UPDATE public."WorkSession"
      SET status = 'completed', "completedAt" = now(), "updatedAt" = now()
      WHERE "WorkSession".id = p_session_id
        AND "WorkSession"."spaceId" = p_space_id
        AND "WorkSession".status = 'awaiting_actions';
    END IF;

    RETURN QUERY SELECT
      'reconciliation_required'::text, v_action.id, v_action.tool,
      v_action.args, v_action."executionIdempotencyKey", v_action."executionAttempts";
    RETURN;
  END IF;

  UPDATE public."WorkSessionAction" AS claimed_action
  SET "executionClaimToken" = p_claim_token,
      "executionLeaseExpiresAt" = now() + make_interval(secs => p_lease_seconds),
      "executionFirstAttemptAt" = COALESCE(claimed_action."executionFirstAttemptAt", now()),
      "executionAttempts" = claimed_action."executionAttempts" + 1
  WHERE claimed_action.id = v_action.id
  RETURNING claimed_action."executionAttempts" INTO v_attempts;

  RETURN QUERY SELECT
    'claimed'::text, v_action.id, v_action.tool, v_action.args,
    v_action."executionIdempotencyKey", v_attempts;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_claimed_work_session_action_execution(
  p_session_id text,
  p_action_id text,
  p_space_id text,
  p_claim_token text,
  p_terminal_status text,
  p_result jsonb,
  p_error text,
  p_reconciliation_required boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public."WorkSession"%ROWTYPE;
BEGIN
  IF NULLIF(btrim(p_session_id), '') IS NULL
    OR NULLIF(btrim(p_action_id), '') IS NULL
    OR NULLIF(btrim(p_space_id), '') IS NULL
    OR NULLIF(btrim(p_claim_token), '') IS NULL
    OR p_claim_token !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR p_terminal_status IS NULL
    OR p_terminal_status NOT IN ('executed','failed')
    OR p_reconciliation_required IS NULL
    OR (p_terminal_status = 'executed' AND (p_error IS NOT NULL OR p_reconciliation_required))
    OR (p_terminal_status = 'failed' AND (NULLIF(btrim(p_error), '') IS NULL OR length(p_error) > 1000))
  THEN
    RAISE EXCEPTION 'invalid WorkSession action execution result';
  END IF;

  SELECT * INTO v_session
  FROM public."WorkSession"
  WHERE "WorkSession".id = p_session_id
    AND "WorkSession"."spaceId" = p_space_id
  FOR UPDATE;
  IF NOT FOUND OR v_session.status <> 'awaiting_actions' THEN RETURN false; END IF;

  UPDATE public."WorkSessionAction" AS action
  SET status = p_terminal_status,
      result = CASE WHEN p_terminal_status = 'executed' THEN p_result ELSE NULL END,
      error = CASE WHEN p_terminal_status = 'failed' THEN p_error ELSE NULL END,
      "reconciliationRequiredAt" = CASE
        WHEN p_reconciliation_required THEN now() ELSE NULL
      END,
      "executionClaimToken" = NULL,
      "executionLeaseExpiresAt" = NULL,
      "executedAt" = now()
  WHERE action.id = p_action_id
    AND action."sessionId" = p_session_id
    AND action."spaceId" = p_space_id
    AND action.status = 'approved'
    AND action."executionClaimToken" = p_claim_token
    AND action."executionLeaseExpiresAt" >= now();
  IF NOT FOUND THEN RETURN false; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public."WorkSessionAction" AS pending
    WHERE pending."sessionId" = p_session_id
      AND pending."spaceId" = p_space_id
      AND pending.status IN ('proposed','approved')
  ) THEN
    UPDATE public."WorkSession"
    SET status = 'completed', "completedAt" = now(), "updatedAt" = now()
    WHERE "WorkSession".id = p_session_id
      AND "WorkSession"."spaceId" = p_space_id
      AND "WorkSession".status = 'awaiting_actions';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'WorkSession action parent changed under lock';
    END IF;
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_work_session_action_execution_claim(
  p_session_id text,
  p_action_id text,
  p_space_id text,
  p_claim_token text,
  p_error text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public."WorkSession"%ROWTYPE;
BEGIN
  IF NULLIF(btrim(p_session_id), '') IS NULL
    OR NULLIF(btrim(p_action_id), '') IS NULL
    OR NULLIF(btrim(p_space_id), '') IS NULL
    OR NULLIF(btrim(p_claim_token), '') IS NULL
    OR p_claim_token !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR NULLIF(btrim(p_error), '') IS NULL
    OR length(p_error) > 1000
  THEN
    RAISE EXCEPTION 'invalid WorkSession action execution release';
  END IF;

  SELECT * INTO v_session
  FROM public."WorkSession"
  WHERE "WorkSession".id = p_session_id
    AND "WorkSession"."spaceId" = p_space_id
  FOR UPDATE;
  IF NOT FOUND OR v_session.status <> 'awaiting_actions' THEN RETURN false; END IF;

  UPDATE public."WorkSessionAction" AS action
  SET error = p_error,
      "executionClaimToken" = NULL,
      "executionLeaseExpiresAt" = NULL
  WHERE action.id = p_action_id
    AND action."sessionId" = p_session_id
    AND action."spaceId" = p_space_id
    AND action.status = 'approved'
    AND action."executionClaimToken" = p_claim_token
    AND action."executionLeaseExpiresAt" >= now();
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_recoverable_work_session_actions(
  p_limit integer DEFAULT 50
)
RETURNS TABLE("sessionId" text, "actionId" text, "spaceId" text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid WorkSession action recovery limit';
  END IF;
  RETURN QUERY
  SELECT action."sessionId", action.id, action."spaceId"
  FROM public."WorkSessionAction" AS action
  JOIN public."WorkSession" AS session
    ON session.id = action."sessionId"
   AND session."spaceId" = action."spaceId"
  WHERE session.status = 'awaiting_actions'
    AND action.status = 'approved'
    AND (
      action."executionClaimToken" IS NULL
      OR action."executionLeaseExpiresAt" IS NULL
      OR action."executionLeaseExpiresAt" < now()
    )
  ORDER BY action."createdAt", action.id
  LIMIT p_limit;
END;
$$;

-- The unfenced historical finisher is retained only as a rolling-deploy
-- compatibility symbol. It cannot mutate any row.
CREATE OR REPLACE FUNCTION public.finish_work_session_action_execution(
  p_session_id text,
  p_action_id text,
  p_space_id text,
  p_terminal_status text,
  p_result jsonb,
  p_error text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_work_session_action_decision_v2(text,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_work_session_action_decision(text,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_work_session_action_execution(text,text,text,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finish_claimed_work_session_action_execution(text,text,text,text,text,jsonb,text,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_work_session_action_execution_claim(text,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_recoverable_work_session_actions(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finish_work_session_action_execution(text,text,text,text,jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_work_session_action_execution_fence() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_work_session_action_parent_completion() FROM PUBLIC;

DO $$
DECLARE v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.claim_work_session_action_decision_v2(text,text,text,text,text) FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON FUNCTION public.claim_work_session_action_decision(text,text,text,text,text) FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON FUNCTION public.claim_work_session_action_execution(text,text,text,text,integer) FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON FUNCTION public.finish_claimed_work_session_action_execution(text,text,text,text,text,jsonb,text,boolean) FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON FUNCTION public.release_work_session_action_execution_claim(text,text,text,text,text) FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON FUNCTION public.list_recoverable_work_session_actions(integer) FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON FUNCTION public.finish_work_session_action_execution(text,text,text,text,jsonb,text) FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON FUNCTION public.enforce_work_session_action_execution_fence() FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON FUNCTION public.enforce_work_session_action_parent_completion() FROM %I', v_role);
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.claim_work_session_action_decision_v2(text,text,text,text,text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.claim_work_session_action_decision(text,text,text,text,text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.claim_work_session_action_execution(text,text,text,text,integer) TO service_role;
    GRANT EXECUTE ON FUNCTION public.finish_claimed_work_session_action_execution(text,text,text,text,text,jsonb,text,boolean) TO service_role;
    GRANT EXECUTE ON FUNCTION public.release_work_session_action_execution_claim(text,text,text,text,text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.list_recoverable_work_session_actions(integer) TO service_role;
    GRANT EXECUTE ON FUNCTION public.finish_work_session_action_execution(text,text,text,text,jsonb,text) TO service_role;
  END IF;
END $$;
