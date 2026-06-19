-- ============================================================================
-- SavedView: named, persisted filter sets for the contact + deal list views
-- ============================================================================
-- WHY: A realtor who narrows the People or Deals list to a complex cut
-- ("Buyers · hot · tagged 'spring-move'") loses that work the moment they
-- reload — the filter state lived only in component memory (and, for contacts,
-- a per-browser localStorage stub that didn't sync across devices). This table
-- is the durable, space-scoped home for those cuts: a user names the current
-- filter set once and can re-apply it, on any device, with one tap.
--
-- A row is one saved view: a (spaceId, entity) bucket, a display name, and the
-- opaque `filters` JSON the list component knows how to re-hydrate. The shape of
-- `filters` is owned by the client (contact-table.tsx / deals-page-client.tsx),
-- so the column is a permissive JSONB — adding a new filter never needs a
-- migration.
--
-- `userId` is the Clerk user id of the creator (nullable: a view created by an
-- automated/server path may have no human author). It is recorded for
-- attribution and a possible future "my views vs. shared views" split; today
-- all access is scoped by `spaceId` (every member of a space sees the space's
-- views), matching how the rest of the workspace data is shared.
--
-- Conventions mirror 20260705000000_integration_event.sql (quoted camelCase
-- columns, gen_random_uuid()::text PK, ON DELETE CASCADE to "Space") and the
-- RLS shape from the integration tables — see the RLS block at the bottom.
-- Idempotent: safe to re-run (IF NOT EXISTS everywhere + ADD COLUMN IF NOT
-- EXISTS heal block + DROP POLICY IF EXISTS before CREATE POLICY).

CREATE TABLE IF NOT EXISTS "SavedView" (
  "id"        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "spaceId"   text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  -- Clerk user id of the creator. Nullable — see header.
  "userId"    text,
  -- Which list this view belongs to. Constrained so a stray entity can never
  -- silently create an un-renderable view.
  "entity"    text NOT NULL CHECK ("entity" IN ('contact', 'deal')),
  "name"      text NOT NULL,
  -- Opaque, client-owned filter payload (search, stage, tags, sort, …).
  "filters"   jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

-- Re-run safety: if a prior partial run created the table without all columns,
-- bring it up to spec without erroring.
ALTER TABLE "SavedView" ADD COLUMN IF NOT EXISTS "spaceId" text;
ALTER TABLE "SavedView" ADD COLUMN IF NOT EXISTS "userId" text;
ALTER TABLE "SavedView" ADD COLUMN IF NOT EXISTS "entity" text;
ALTER TABLE "SavedView" ADD COLUMN IF NOT EXISTS "name" text;
ALTER TABLE "SavedView" ADD COLUMN IF NOT EXISTS "filters" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "SavedView" ADD COLUMN IF NOT EXISTS "createdAt" timestamptz NOT NULL DEFAULT now();
ALTER TABLE "SavedView" ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now();

-- The hot read path: load every saved view for a list in one shot.
CREATE INDEX IF NOT EXISTS "SavedView_space_entity_idx"
  ON "SavedView" ("spaceId", "entity");

ALTER TABLE "SavedView" ENABLE ROW LEVEL SECURITY;

-- ── RLS — defense-in-depth, mirrors the integration tables ──────────────────
-- All app access is via the service-role key (lib/supabase.ts), which BYPASSES
-- RLS; ownership is enforced at the route layer (requireSpaceOwner in
-- app/api/saved-views). This SELECT policy exists for least-privilege posture
-- and to protect against a future browser/anon path; it buys zero security for
-- the current server flow and cannot break it. Scope by space ownership through
-- Clerk's userId, exactly like integration_event_authenticated_select.
DROP POLICY IF EXISTS "saved_view_authenticated_select" ON "SavedView";
CREATE POLICY "saved_view_authenticated_select" ON "SavedView"
  FOR SELECT TO authenticated
  USING (
    "spaceId" IN (
      SELECT s.id FROM "Space" s
      JOIN "User" u ON u.id = s."ownerId"
      WHERE u."clerkId" = auth.jwt() ->> 'sub'
    )
  );
REVOKE ALL ON "SavedView" FROM anon, authenticated;
GRANT SELECT ON "SavedView" TO authenticated;
