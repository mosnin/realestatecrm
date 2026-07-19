-- ============================================================================
-- Browser Control: pairing + action-queue backend for the Chippi extension
-- ============================================================================
-- WHY: a realtor installs the Chippi Chrome extension and PAIRS it to their
-- account (a short-lived pairing code generated in the app → the extension
-- redeems it for a long-lived per-user bearer token). Once paired, the chat
-- agent can drive the realtor's OWN logged-in browser: it enqueues an ACTION
-- from the closed allow-list in lib/browser-control/protocol.ts, the
-- extension polls for it, executes it via chrome.debugger (CDP) with a
-- visible cursor + kill switch, and posts the result (+ screenshot) back.
--
-- Four tables:
--   BrowserLink        — a paired extension install (one per device).
--   BrowserPairingCode — a short-lived, single-use code exchanged for a link.
--   BrowserSession      — one control "run" tied to a link.
--   BrowserAction        — the queue: one row per enqueued action.
--
-- Security posture (mirrors McpApiKey / mcp-keys route):
--   - Extension bearer tokens are NEVER stored raw — only their sha256 hash
--     (tokenHash) plus a display-only prefix. The raw token is returned to
--     the extension exactly once, at redeem time.
--   - Pairing codes are stored hashed too (codeHash), expire fast
--     (PAIRING_CODE_TTL_SECONDS in the protocol), and are single-use
--     (redeemedAt is set atomically on redeem — see redeemPairingCode).
--   - Every row is spaceId-scoped. The service-role client BYPASSES RLS —
--     the app-level `.eq('spaceId', …)` scope (via tenantTable()) is the
--     real security boundary; RLS below is defense-in-depth (deny-all to
--     anon, matches 20260818000000_rls_close_remaining_tenant_tables.sql /
--     20260822000000_review_campaign.sql).
--
-- Conventions mirror the sibling tables: quoted camelCase columns, text
-- PK/FK, ON DELETE CASCADE, append-only + idempotent. Applied via the
-- human-gated workflow in docs/RELEASE.md — NOT assumed live just because
-- it's in git.
-- ============================================================================

-- ── BrowserLink: a paired extension install ─────────────────────────────────
CREATE TABLE IF NOT EXISTS "BrowserLink" (
  id             text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"      text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "userId"       text NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "tokenHash"    text NOT NULL,
  "tokenPrefix"  text NOT NULL,
  "deviceLabel"  text,
  "createdAt"    timestamptz NOT NULL DEFAULT now(),
  "lastUsedAt"   timestamptz,
  "revokedAt"    timestamptz
);

-- Bearer-token lookup on every /poll call — must be unique + fast.
CREATE UNIQUE INDEX IF NOT EXISTS "BrowserLink_tokenHash_key" ON "BrowserLink" ("tokenHash");
CREATE INDEX IF NOT EXISTS "BrowserLink_space_idx" ON "BrowserLink" ("spaceId");
CREATE INDEX IF NOT EXISTS "BrowserLink_user_idx" ON "BrowserLink" ("userId") WHERE "revokedAt" IS NULL;

ALTER TABLE "BrowserLink" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_anon_browserlink_select ON "BrowserLink";
CREATE POLICY deny_anon_browserlink_select ON "BrowserLink"
  AS RESTRICTIVE FOR SELECT TO anon USING (false);
REVOKE ALL ON "BrowserLink" FROM anon;
REVOKE INSERT, UPDATE, DELETE ON "BrowserLink" FROM authenticated;

-- ── BrowserPairingCode: short-lived single-use pairing codes ───────────────
CREATE TABLE IF NOT EXISTS "BrowserPairingCode" (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"     text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "userId"      text NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "codeHash"    text NOT NULL,
  "expiresAt"   timestamptz NOT NULL,
  "redeemedAt"  timestamptz,
  "createdAt"   timestamptz NOT NULL DEFAULT now()
);

-- Redeem lookup by code hash; the redeemedAt/expiresAt filters are applied by
-- the app (redeemPairingCode reads then conditionally updates — a UNIQUE
-- index on codeHash guards against two codes hashing the same value from
-- ever colliding silently).
CREATE UNIQUE INDEX IF NOT EXISTS "BrowserPairingCode_codeHash_key" ON "BrowserPairingCode" ("codeHash");
CREATE INDEX IF NOT EXISTS "BrowserPairingCode_space_idx" ON "BrowserPairingCode" ("spaceId");

ALTER TABLE "BrowserPairingCode" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_anon_browserpairingcode_select ON "BrowserPairingCode";
CREATE POLICY deny_anon_browserpairingcode_select ON "BrowserPairingCode"
  AS RESTRICTIVE FOR SELECT TO anon USING (false);
REVOKE ALL ON "BrowserPairingCode" FROM anon;
REVOKE INSERT, UPDATE, DELETE ON "BrowserPairingCode" FROM authenticated;

-- ── BrowserSession: one control run tied to a paired link ──────────────────
CREATE TABLE IF NOT EXISTS "BrowserSession" (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"   text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "userId"    text NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "linkId"    text NOT NULL REFERENCES "BrowserLink"(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  "startedAt" timestamptz NOT NULL DEFAULT now(),
  "endedAt"   timestamptz
);

-- Hot lookup: "does this user have an active session" (enqueueAction,
-- getActiveSession) and "sessions for this link" (poll, revoke).
CREATE INDEX IF NOT EXISTS "BrowserSession_user_active_idx"
  ON "BrowserSession" ("spaceId", "userId", status);
CREATE INDEX IF NOT EXISTS "BrowserSession_link_idx" ON "BrowserSession" ("linkId");

ALTER TABLE "BrowserSession" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_anon_browsersession_select ON "BrowserSession";
CREATE POLICY deny_anon_browsersession_select ON "BrowserSession"
  AS RESTRICTIVE FOR SELECT TO anon USING (false);
REVOKE ALL ON "BrowserSession" FROM anon;
REVOKE INSERT, UPDATE, DELETE ON "BrowserSession" FROM authenticated;

-- ── BrowserAction: the queue ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "BrowserAction" (
  id             text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"      text NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "sessionId"    text NOT NULL REFERENCES "BrowserSession"(id) ON DELETE CASCADE,
  type           text NOT NULL,
  params         jsonb NOT NULL DEFAULT '{}'::jsonb,
  status         text NOT NULL DEFAULT 'queued'
                   CHECK (status IN ('queued', 'running', 'done', 'error', 'expired')),
  result         jsonb,
  "createdAt"    timestamptz NOT NULL DEFAULT now(),
  "dispatchedAt" timestamptz,
  "completedAt"  timestamptz
);

-- The extension's /poll hot path: next queued action for a session, FIFO.
CREATE INDEX IF NOT EXISTS "BrowserAction_session_status_idx"
  ON "BrowserAction" ("sessionId", status, "createdAt");
CREATE INDEX IF NOT EXISTS "BrowserAction_space_idx" ON "BrowserAction" ("spaceId");

ALTER TABLE "BrowserAction" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_anon_browseraction_select ON "BrowserAction";
CREATE POLICY deny_anon_browseraction_select ON "BrowserAction"
  AS RESTRICTIVE FOR SELECT TO anon USING (false);
REVOKE ALL ON "BrowserAction" FROM anon;
REVOKE INSERT, UPDATE, DELETE ON "BrowserAction" FROM authenticated;
