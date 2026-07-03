-- Grouped run-count RPC for the workflow list.
--
-- Before this, GET /api/workflows called countRunsPerWorkflow(spaceId) which
-- SELECTed the workflowId of EVERY WorkflowRun the space had ever produced and
-- counted them in JS — an unbounded row transfer that grows forever (a space
-- with months of hourly runs ships tens of thousands of rows just to render a
-- per-workflow count badge). This function does the GROUP BY in Postgres and
-- returns one row per workflow (≤ the space's workflow count).
--
-- The existing WorkflowRun (spaceId, startedAt DESC) index filters the space's
-- rows; the aggregate then groups them server-side. Additive + reversible
-- (DROP FUNCTION). The application falls back to an empty map if this function
-- is absent, so deploy ordering is safe (run counts simply show 0 until applied).

CREATE OR REPLACE FUNCTION count_runs_per_workflow(p_space_id text)
RETURNS TABLE ("workflowId" uuid, run_count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT "workflowId", COUNT(*)::bigint AS run_count
  FROM "WorkflowRun"
  WHERE "spaceId" = p_space_id
  GROUP BY "workflowId";
$$;
