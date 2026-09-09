CREATE TABLE IF NOT EXISTS public."TeamWorkItem" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "teamId" text NOT NULL REFERENCES public."CollaborationTeam"(id) ON DELETE CASCADE,
  "createdBy" text NOT NULL REFERENCES public."User"(id),
  "assignedTo" text NOT NULL REFERENCES public."User"(id),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 4000),
  "dueAt" timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','accepted','done','cancelled')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  "acknowledgedAt" timestamptz,
  "completedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS team_work_due ON public."TeamWorkItem" ("teamId", "dueAt", id);
ALTER TABLE public."TeamWorkItem" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."TeamWorkItem" FROM PUBLIC, anon, authenticated;
GRANT ALL ON public."TeamWorkItem" TO service_role;
