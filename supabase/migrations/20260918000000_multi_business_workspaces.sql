-- Multiple businesses per person (one owner, many Spaces) plus paid-only
-- teammates on a workspace. Space.ownerId was UNIQUE — Steve can't run
-- Apple and Pixar as two books. Drop that, keep an index, and add membership
-- + invitation tables scoped by spaceId.

ALTER TABLE "Space" DROP CONSTRAINT IF EXISTS "Space_ownerId_key";

CREATE INDEX IF NOT EXISTS idx_space_owner_id ON "Space"("ownerId");

CREATE TABLE IF NOT EXISTS "SpaceMembership" (
  id text PRIMARY KEY,
  "spaceId" text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("spaceId", "userId")
);

CREATE INDEX IF NOT EXISTS idx_space_membership_user ON "SpaceMembership"("userId");
CREATE INDEX IF NOT EXISTS idx_space_membership_space ON "SpaceMembership"("spaceId");

ALTER TABLE "SpaceMembership" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "SpaceInvitation" (
  id text PRIMARY KEY,
  "spaceId" text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  "invitedByUserId" text NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_space_invitation_space_status
  ON "SpaceInvitation" ("spaceId", status);
CREATE INDEX IF NOT EXISTS idx_space_invitation_email
  ON "SpaceInvitation" (lower(email));

ALTER TABLE "SpaceInvitation" ENABLE ROW LEVEL SECURITY;
