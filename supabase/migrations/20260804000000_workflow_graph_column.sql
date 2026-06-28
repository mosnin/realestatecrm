-- Advanced / branching workflows: an OPTIONAL node-graph the advanced canvas
-- authors (lib/workflows/schema.ts WorkflowGraph). When present the executor
-- walks the graph instead of the linear conditions→actions path.
--
-- Nullable, no default → every existing (linear) workflow is unaffected; their
-- `graph` is simply NULL and the engine keeps running the linear path. Stored as
-- jsonb to match the other workflow shape columns (trigger/conditions/actions);
-- validation lives in the API layer (parseWorkflowDefinition), not the DB.

ALTER TABLE "Workflow" ADD COLUMN IF NOT EXISTS "graph" jsonb;
