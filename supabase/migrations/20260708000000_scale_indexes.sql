-- Scale indexes: kill sequential scans on hot agent paths.
--
-- AgentTask: the task list / history views order by createdAt DESC. Without
-- this index that's a full scan + sort once a space accumulates tasks.
--
-- AgentMemory: memory retrieval filters by spaceId and ranks by importance
-- (then recency) before the vector pass. A composite (spaceId, importance DESC,
-- createdAt DESC) index lets Postgres walk the top rows for a space directly.
--
-- NOTE: these use plain CREATE INDEX (not CONCURRENTLY) on purpose. Supabase
-- runs each migration inside a transaction, and CREATE INDEX CONCURRENTLY
-- cannot run in a transaction block. Both tables are bounded today, so the
-- brief write lock during the build is acceptable. If either table grows large
-- enough that the lock matters, build the index CONCURRENTLY out-of-band
-- instead and drop the create from a future migration.

CREATE INDEX IF NOT EXISTS "AgentTask_createdAt_idx"
  ON "AgentTask" ("createdAt" DESC);

CREATE INDEX IF NOT EXISTS "AgentMemory_space_importance_created_idx"
  ON "AgentMemory" ("spaceId", importance DESC, "createdAt" DESC);
