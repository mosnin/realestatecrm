-- Add the feature-off workbook artifact type after the active-main 20260908
-- chat-usage migration, without leaving a gap in type
-- enforcement. NOT VALID keeps the first catalog lock brief; validation scans
-- existing rows while ordinary reads/writes continue.
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_artifactType_check_v2" CHECK ("artifactType" IN (
  'draft_email','draft_sms','deal_update','contact_update','tour_booking','goal_plan','report','raw_output','workbook'
)) NOT VALID;

ALTER TABLE "Artifact" VALIDATE CONSTRAINT "Artifact_artifactType_check_v2";
-- Historical databases may already have replaced or renamed the old check.
-- The new validated constraint is authoritative either way.
ALTER TABLE "Artifact" DROP CONSTRAINT IF EXISTS "Artifact_artifactType_check";
ALTER TABLE "Artifact" RENAME CONSTRAINT "Artifact_artifactType_check_v2" TO "Artifact_artifactType_check";
