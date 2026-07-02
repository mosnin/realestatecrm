-- Data-integrity constraints closing two read-then-insert race windows.
--
-- Both tables are written with an application-side "does it already exist?"
-- check and NO backing unique constraint, so two concurrent requests can each
-- pass the check and double-insert:
--
--   1) DealContact(dealId, contactId) — deals PATCH computes
--      toAdd = wanted − existing and inserts the difference; deals POST and
--      tours/convert insert links directly. Concurrent edits to the same deal
--      can create duplicate (deal, contact) links, which then inflate every
--      per-deal contact count and render the same person twice on the card.
--
--   2) ArtifactVersion(artifactId, versionNumber) — the PATCH computes
--      nextVersionNumber = max(versionNumber) + 1 then inserts. Two concurrent
--      saves of the same artifact compute the same number and create two rows
--      claiming to be the same version; currentVersionId then points at one
--      arbitrarily and the history is corrupt.
--
-- Fix: de-duplicate any rows that already slipped through (keeping the
-- physically-first via ctid — additive, no column assumptions), then add the
-- unique index that makes the second concurrent insert fail cleanly (the app
-- already error-handles the insert). Additive + reversible (DROP INDEX).

-- ── 1) DealContact ───────────────────────────────────────────────────────────
DELETE FROM "DealContact" a
USING "DealContact" b
WHERE a.ctid > b.ctid
  AND a."dealId" = b."dealId"
  AND a."contactId" = b."contactId";

CREATE UNIQUE INDEX IF NOT EXISTS "DealContact_dealId_contactId_key"
  ON "DealContact" ("dealId", "contactId");

-- ── 2) ArtifactVersion ───────────────────────────────────────────────────────
DELETE FROM "ArtifactVersion" a
USING "ArtifactVersion" b
WHERE a.ctid > b.ctid
  AND a."artifactId" = b."artifactId"
  AND a."versionNumber" = b."versionNumber";

CREATE UNIQUE INDEX IF NOT EXISTS "ArtifactVersion_artifactId_versionNumber_key"
  ON "ArtifactVersion" ("artifactId", "versionNumber");
