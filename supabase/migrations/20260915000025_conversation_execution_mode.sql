-- Work execution policy is mutable per conversation, while Chat/Work itself
-- remains immutable after the first user turn (20260915000023).
-- Existing Work conversations preserve the current direct-execution behavior.

ALTER TABLE public."Conversation"
  ADD COLUMN IF NOT EXISTS "executionMode" text NOT NULL DEFAULT 'autonomous',
  ADD COLUMN IF NOT EXISTS "workGoal" text,
  ADD COLUMN IF NOT EXISTS "workGoalStatus" text,
  ADD COLUMN IF NOT EXISTS "workGoalVersion" bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "workGoalUpdatedAt" timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public."Conversation"'::regclass
      AND conname = 'Conversation_executionMode_check'
  ) THEN
    ALTER TABLE public."Conversation"
      ADD CONSTRAINT "Conversation_executionMode_check"
      CHECK ("executionMode" IN ('review', 'autonomous'));
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public."Conversation"'::regclass
      AND conname = 'Conversation_workGoalStatus_check'
  ) THEN
    ALTER TABLE public."Conversation"
      ADD CONSTRAINT "Conversation_workGoalStatus_check"
      CHECK ("workGoalStatus" IS NULL OR "workGoalStatus" IN ('active', 'achieved', 'cancelled'));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_conversation_work_goal(
  p_conversation_id text,
  p_space_id text,
  p_goal text
)
RETURNS TABLE(goal text, version bigint, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_goal text := btrim(p_goal);
BEGIN
  IF NULLIF(btrim(p_conversation_id), '') IS NULL
    OR NULLIF(btrim(p_space_id), '') IS NULL
    OR NULLIF(v_goal, '') IS NULL
    OR length(v_goal) > 5000
  THEN
    RAISE EXCEPTION 'invalid conversation work goal';
  END IF;

  RETURN QUERY
  UPDATE public."Conversation" AS conversation
  SET
    "workGoal" = v_goal,
    "workGoalStatus" = 'active',
    "workGoalVersion" = conversation."workGoalVersion" + 1,
    "workGoalUpdatedAt" = now(),
    "updatedAt" = conversation."updatedAt"
  WHERE conversation.id = p_conversation_id
    AND conversation."spaceId" = p_space_id
    AND conversation.mode = 'work'
  RETURNING
    conversation."workGoal",
    conversation."workGoalVersion",
    conversation."workGoalStatus";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'work conversation not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_conversation_work_goal(text,text,text) FROM PUBLIC;
DO $$
DECLARE v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format(
        'REVOKE ALL ON FUNCTION public.set_conversation_work_goal(text,text,text) FROM %I',
        v_role
      );
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.set_conversation_work_goal(text,text,text) TO service_role;
  END IF;
END;
$$;
