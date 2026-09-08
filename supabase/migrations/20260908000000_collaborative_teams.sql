-- Collaborative accounts use existing paid personal/brokerage entitlement.
-- CRM records are not shared by team membership. Operational work lives in Cadre.
CREATE TABLE IF NOT EXISTS public."CollaborationTeam" (
  id text PRIMARY KEY,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  "ownerId" text NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  "parentKind" text NOT NULL CHECK ("parentKind" IN ('personal', 'brokerage')),
  "parentRouteId" text NOT NULL,
  "inviteHash" text UNIQUE,
  "inviteExpiresAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS collaboration_team_owner ON public."CollaborationTeam" ("ownerId");
CREATE TABLE IF NOT EXISTS public."CollaborationTeamMember" (
  "teamId" text NOT NULL REFERENCES public."CollaborationTeam"(id) ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  "revokedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("teamId", "userId")
);
CREATE INDEX IF NOT EXISTS collaboration_team_member_user ON public."CollaborationTeamMember" ("userId");
ALTER TABLE public."CollaborationTeam" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CollaborationTeamMember" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."CollaborationTeam", public."CollaborationTeamMember" FROM anon, authenticated;
GRANT ALL ON public."CollaborationTeam", public."CollaborationTeamMember" TO service_role;
