-- ============================================================================
-- Chippi Work: user-authored Skills + custom Plugins
-- ============================================================================
-- Two space-scoped tables backing the ChatGPT-Work-style mechanics:
--
--   UserSkill    — a named, reusable playbook the realtor writes once and
--                  invokes from the composer's "/" menu. A skill is "just a
--                  prompt" (same contract as the built-in SKILL.md skills):
--                  picking it drops the prompt into the composer; a single
--                  {placeholder} token becomes the initial selection.
--
--   CustomPlugin — a user-defined HTTP tool the agent can call: name,
--                  description (tells the model WHEN to use it), an HTTPS
--                  endpoint, method, optional auth header. Execution goes
--                  through the SSRF guard (lib/net/ssrf-guard) and is
--                  approval-gated in chat.
--
-- Same tenancy rules as everything else: service-role client, isolation
-- enforced in app code by spaceId; RLS here is defense-in-depth only.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "UserSkill" (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"     text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  title         text NOT NULL,
  description   text NOT NULL DEFAULT '',
  prompt        text NOT NULL,
  enabled       boolean NOT NULL DEFAULT true,
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "updatedAt"   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_userskill_space ON "UserSkill"("spaceId");

CREATE TABLE IF NOT EXISTS "CustomPlugin" (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"     text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text NOT NULL DEFAULT '',
  url           text NOT NULL,
  method        text NOT NULL DEFAULT 'POST' CHECK (method IN ('GET', 'POST')),
  -- Optional bearer/API-key header, stored as { name, value }. Readable only
  -- through the service role; never returned to the browser after creation.
  "authHeader"  jsonb,
  enabled       boolean NOT NULL DEFAULT true,
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "updatedAt"   timestamptz NOT NULL DEFAULT now(),
  -- The agent looks plugins up by name; keep names unique per space.
  UNIQUE ("spaceId", name)
);
CREATE INDEX IF NOT EXISTS idx_customplugin_space ON "CustomPlugin"("spaceId");

ALTER TABLE "UserSkill"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomPlugin" ENABLE ROW LEVEL SECURITY;
