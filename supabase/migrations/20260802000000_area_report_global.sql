-- Property IQ: make the area cache GLOBAL (one research per ZIP for the whole
-- platform), not per-workspace.
--
-- Area intelligence (schools, prices, safety, walkability) is PUBLIC data and
-- identical for every workspace in the same area. Keying the cache on
-- (spaceId, areaKey) meant 10,000 realtors each paid to research the same ZIP.
-- Re-key it on areaKey alone: research an area once, every space reads it. This
-- removes ~all of the redundant research cost at scale.
--
-- spaceId becomes a nullable provenance column (not part of the key). We null it
-- out so a global cache row is never cascade-deleted when one workspace is
-- removed; the store writes NULL going forward.
--
-- Idempotent and safe to re-run.

-- 1) spaceId is no longer required (global rows carry NULL).
ALTER TABLE "AreaReport" ALTER COLUMN "spaceId" DROP NOT NULL;

-- 2) Collapse per-space duplicates of the same area, keeping the newest run.
DELETE FROM "AreaReport" a
USING "AreaReport" b
WHERE a."areaKey" = b."areaKey"
  AND a."generatedAt" < b."generatedAt";

-- Break exact-tie duplicates (same areaKey + generatedAt) deterministically by id.
DELETE FROM "AreaReport" a
USING "AreaReport" b
WHERE a."areaKey" = b."areaKey"
  AND a."generatedAt" = b."generatedAt"
  AND a."id" < b."id";

-- 3) Detach surviving rows from any single workspace so the global cache
--    outlives the space that first researched it.
UPDATE "AreaReport" SET "spaceId" = NULL WHERE "spaceId" IS NOT NULL;

-- 4) Swap the per-space unique for a global one on areaKey.
DROP INDEX IF EXISTS "AreaReport_space_area_key";
CREATE UNIQUE INDEX IF NOT EXISTS "AreaReport_area_key" ON "AreaReport" ("areaKey");

-- The (spaceId, generatedAt) browse index is now mostly NULL-spaceId; replace it
-- with a plain recency index for "recently researched areas" views.
DROP INDEX IF EXISTS "AreaReport_space_generated_idx";
CREATE INDEX IF NOT EXISTS "AreaReport_generated_idx" ON "AreaReport" ("generatedAt" DESC);
