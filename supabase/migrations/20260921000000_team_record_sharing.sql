-- Membership alone never shares personal CRM data. Grants refer to live records;
-- no private notes, messages, files, or credentials are copied into a team.
CREATE TABLE IF NOT EXISTS public."TeamRecordGrant" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "teamId" text NOT NULL REFERENCES public."CollaborationTeam"(id) ON DELETE CASCADE,
  "spaceId" text NOT NULL REFERENCES public."Space"(id) ON DELETE CASCADE,
  "recordKind" text NOT NULL CHECK ("recordKind" IN ('contact', 'deal', 'property')),
  "recordId" text NOT NULL,
  "grantedBy" text NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "revokedAt" timestamptz,
  UNIQUE ("teamId", "spaceId", "recordKind", "recordId")
);
CREATE INDEX IF NOT EXISTS team_record_grant_active ON public."TeamRecordGrant" ("teamId", "createdAt", id) WHERE "revokedAt" IS NULL;
CREATE INDEX IF NOT EXISTS team_record_grant_space ON public."TeamRecordGrant" ("spaceId");
ALTER TABLE public."TeamRecordGrant" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."TeamRecordGrant" FROM PUBLIC, anon, authenticated;
GRANT ALL ON public."TeamRecordGrant" TO service_role;
