-- Phase 5: first-class contract dates on Deal.
-- Human-gated (docs/RELEASE.md) — not live in prod just because this is in git.
-- contractAcceptedAt is stamped when an offer is accepted or a DocuSign
-- envelope on the deal completes (e-sign is the one external spine).
-- inspectionDeadline / earnestDueAt are realtor-authored; we do not invent them.

ALTER TABLE "Deal"
  ADD COLUMN IF NOT EXISTS "contractAcceptedAt" TIMESTAMPTZ;

ALTER TABLE "Deal"
  ADD COLUMN IF NOT EXISTS "inspectionDeadline" DATE;

ALTER TABLE "Deal"
  ADD COLUMN IF NOT EXISTS "earnestDueAt" DATE;
