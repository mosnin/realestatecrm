-- Data-integrity constraint closing a read-then-insert race on ArtifactVersion.
--
-- ArtifactVersion is written with an app-side "max(versionNumber) + 1" then an
-- insert, and the table (see 20260601000001_artifact_tables.sql) has ONLY an
-- `id` primary key — nothing stops two concurrent saves of the same artifact
-- from computing the same next number and inserting two rows that both claim to
-- be that version. Artifact.currentVersionId then points at one arbitrarily and
-- the version history is corrupt.
--
-- Fix: de-duplicate any rows that already collided (keeping the physically-first
-- via ctid — additive, no column assumptions) then add the unique index that
-- makes the losing concurrent insert fail cleanly (the PATCH handler already
-- returns an error on a failed version insert, so this fails safe). Additive +
-- reversible (DROP INDEX).
--
-- NOTE: DealContact does NOT need this treatment — it already carries
-- PRIMARY KEY ("dealId","contactId") (supabase/schema.sql), so duplicate links
-- are impossible at the DB layer. The companion code change in this PR switches
-- the DealContact inserts to upsert(onConflict:'dealId,contactId',
-- ignoreDuplicates) so a concurrent insert resolves silently against that PK
-- instead of surfacing a 500 on the constraint violation.

DELETE FROM "ArtifactVersion" a
USING "ArtifactVersion" b
WHERE a.ctid > b.ctid
  AND a."artifactId" = b."artifactId"
  AND a."versionNumber" = b."versionNumber";

CREATE UNIQUE INDEX IF NOT EXISTS "ArtifactVersion_artifactId_versionNumber_key"
  ON "ArtifactVersion" ("artifactId", "versionNumber");
