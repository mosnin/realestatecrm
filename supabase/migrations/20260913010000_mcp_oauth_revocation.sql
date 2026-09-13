-- OAuth access-token revocation is independent of the team's API key secret.
CREATE TABLE IF NOT EXISTS public."McpOAuthRevocation" (
  "tokenHash" text PRIMARY KEY CHECK ("tokenHash" ~ '^[a-f0-9]{64}$'),
  "spaceId" text NOT NULL REFERENCES public."Space"(id) ON DELETE CASCADE,
  "clientId" text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public."McpOAuthRevocation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."McpOAuthRevocation" FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."McpOAuthRevocation" TO service_role;
CREATE INDEX IF NOT EXISTS mcp_oauth_revocation_expiry ON public."McpOAuthRevocation" ("expiresAt");
CREATE INDEX IF NOT EXISTS mcp_oauth_revocation_space ON public."McpOAuthRevocation" ("spaceId");
