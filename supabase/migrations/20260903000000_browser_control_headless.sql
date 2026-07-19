-- ============================================================================
-- Browser Control: headless (cloud) session source
-- ============================================================================
-- WHY: a browser-control session can now be driven by TWO runtimes that
-- share the SAME BrowserAction queue + lib/browser-control/protocol.ts
-- contract:
--   - 'extension' (existing, default): the realtor's OWN paired Chrome
--     extension, driving their real logged-in browser via CDP.
--   - 'headless' (new): a cloud headless browser (Modal worker) for
--     public-web research/navigation with NO realtor login — used when no
--     extension is connected and the task doesn't need the realtor's own
--     login (see resolveBrowserRuntime in lib/browser-control/index.ts).
--
-- A headless session has no paired device, so BrowserSession.linkId — today
-- NOT NULL + FK'd to BrowserLink — must allow NULL for these rows. A NULL
-- foreign-key value is unconstrained by a REFERENCES clause (standard SQL),
-- so relaxing the NOT NULL is a safe, additive change: every existing
-- extension-driven row keeps its non-null linkId; only new headless rows
-- ever have a null one.
--
-- Same security posture as 20260901000000_browser_control.sql: the
-- service-role client bypasses RLS — the app-level `.eq('spaceId', …)` scope
-- is the real boundary. No RLS changes here (BrowserSession is already
-- RLS-enabled + deny-all-to-anon).
--
-- Append-only + idempotent, applied via the human-gated workflow in
-- docs/RELEASE.md — NOT assumed live in prod just because it's in git.
-- ============================================================================

ALTER TABLE "BrowserSession"
  ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'extension'
    CHECK ("source" IN ('extension', 'headless'));

-- Belt-and-suspenders backfill: PG already fills existing rows with the
-- DEFAULT when a NOT NULL column is added, so this should be a no-op in
-- practice — kept explicit (mirrors 20260902000000_browser_control_frames.sql's
-- lastPolledAt backfill) so staleness/routing logic never has to reason
-- about a NULL source.
UPDATE "BrowserSession" SET "source" = 'extension' WHERE "source" IS NULL;

-- Headless sessions aren't tied to a paired device — allow NULL.
ALTER TABLE "BrowserSession" ALTER COLUMN "linkId" DROP NOT NULL;

-- Hot lookup for the routing decision (resolveBrowserRuntime) and the
-- headless /start route's reuse check: "does this user already have an
-- ACTIVE session of THIS source". Complements, does not replace, the
-- existing BrowserSession_user_active_idx from
-- 20260901000000_browser_control.sql.
CREATE INDEX IF NOT EXISTS "BrowserSession_user_active_source_idx"
  ON "BrowserSession" ("spaceId", "userId", status, "source");
