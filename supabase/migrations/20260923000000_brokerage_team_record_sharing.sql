CREATE TABLE IF NOT EXISTS public."BrokerageTeamRecordGrant" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "teamId" text NOT NULL REFERENCES public."CollaborationTeam"(id) ON DELETE CASCADE,
  "brokerageId" text NOT NULL REFERENCES public."Brokerage"(id) ON DELETE CASCADE,
  "recordKind" text NOT NULL CHECK ("recordKind" IN ('contact','deal','property')),
  "recordId" text NOT NULL,
  "grantedBy" text NOT NULL REFERENCES public."User"(id),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "revokedAt" timestamptz,
  UNIQUE ("teamId","brokerageId","recordKind","recordId")
);
CREATE INDEX IF NOT EXISTS brokerage_team_grants_active ON public."BrokerageTeamRecordGrant" ("brokerageId","teamId","createdAt",id) WHERE "revokedAt" IS NULL;
ALTER TABLE public."BrokerageTeamRecordGrant" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."BrokerageTeamRecordGrant" FROM PUBLIC,anon,authenticated;
GRANT ALL ON public."BrokerageTeamRecordGrant" TO service_role;
