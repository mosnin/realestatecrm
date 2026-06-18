-- Configurable e-sign gate on deal close.
--
-- Adds a single per-brokerage policy toggle that, when ON, blocks a deal from
-- being closed (status -> 'won') while it still has an in-progress signature
-- request. The enforcement point is the deal PATCH handler
-- (`app/api/deals/[id]/route.ts`); a deal's brokerage is resolved via its
-- Space.brokerageId.
--
--   * "requireSignedDocsBeforeClose" — OFF by default. The broker turns it on.
--     When OFF the close path behaves exactly as before (zero behavior change).
--
-- Detection needs NO new schema: there is no first-class "required document"
-- concept, so the strongest available signal is reused — a SignatureRequest
-- tied to the deal whose status is still OPEN ('created' | 'sent' |
-- 'delivered'). A started-but-unfinished signature is treated as "not signed".
-- Terminal statuses ('completed' | 'declined' | 'voided') and the total
-- absence of any request do NOT block.
--
-- Additive + idempotent: no existing column touched, ADD COLUMN IF NOT EXISTS,
-- safe to re-run. Mirrors the speed-to-lead toggle added in
-- 20260612000000_lead_sla.sql (per-brokerage boolean, NOT NULL DEFAULT false).
--
-- RLS: "Brokerage" already has row level security enabled (since
-- 20260314000003_org_system.sql); the statement below re-asserts it so this
-- file leaves the table protected on its own. Every read/write goes through the
-- server with the service-role key, which bypasses RLS — the policy posture is
-- defense-in-depth, matching the rest of the schema.

ALTER TABLE "Brokerage"
  ADD COLUMN IF NOT EXISTS "requireSignedDocsBeforeClose" boolean NOT NULL DEFAULT false;

ALTER TABLE "Brokerage" ENABLE ROW LEVEL SECURITY;
