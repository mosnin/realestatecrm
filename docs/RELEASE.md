# Release procedure

How code and database changes reach production, and how to apply, verify, and
roll back database migrations safely.

This document covers the **database migration pipeline** specifically. App code
deploys via Vercel on merge to `main` (see `vercel.json`); migrations do **not**
ride that path — they are applied deliberately by a human-approved workflow so
schema changes never go out silently or out of order.

> **What changed:** previously, migrations under `supabase/migrations/` were
> applied to production by hand (directly against the Supabase project). This
> workflow replaces that ad-hoc process with a repeatable, human-gated pipeline.
> Migrations are still authored the same way — append-only forward SQL files in
> `supabase/migrations/`, written idempotently (`IF NOT EXISTS` / guarded `DO`
> blocks) and applied in lexical (timestamp) filename order.

---

## TL;DR

```
# Local, against the linked prod project (read-only — shows pending work):
pnpm db:status        # which migrations prod has vs. what's in git
pnpm db:diff          # SQL that WOULD be applied (dry-run, no writes)

# Apply (writes to prod) — prefer the GitHub workflow over running this by hand:
pnpm db:migrate
```

In normal operation you do **not** run `pnpm db:migrate` from a laptop. You run
the **DB Migrate (production)** GitHub Actions workflow, which forces a dry-run,
then pauses for a human to approve before any SQL touches prod.

---

## One-time setup (repository owner — REQUIRED before first run)

The pipeline is inert until these are configured. None of these can be set from
the codebase; they hold secrets / project identity and must be added in GitHub.
Until they exist, the workflow will fail at the link/push step — that is
expected.

1. **Create a Supabase access token.**
   Supabase Dashboard → Account → Access Tokens → generate a token scoped to the
   org that owns the production project.

2. **Add repository secrets** (Settings → Secrets and variables → Actions → *Secrets*):
   - `SUPABASE_ACCESS_TOKEN` — the token from step 1.
   - `SUPABASE_DB_PASSWORD` — the production database password
     (Dashboard → Project → Settings → Database → Connection password).
     `supabase db push` needs it to open a direct connection.

3. **Add a repository variable** (Settings → Secrets and variables → Actions → *Variables*):
   - `SUPABASE_PROJECT_REF` — the production project ref (the `abcdefghijklm...`
     slug in the project URL / Dashboard → Project Settings → General → Reference ID).
     This is identity, not a secret, so it lives as a `var`, not a `secret`.

4. **Create the `production-db` environment** (Settings → Environments → New environment):
   - Name it exactly `production-db`.
   - Enable **Required reviewers** and add the people allowed to approve a prod
     migration (at minimum, the repo owner).
   - This is the human gate: every run of the `apply` job pauses here until a
     reviewer approves. Without this environment configured with reviewers, the
     job would run unattended — so do not skip it.

Do not commit any of these values to the repo.

---

## Applying migrations to production (normal path)

1. Merge the PR that adds the new migration file(s) under `supabase/migrations/`
   to `main`. (The migration is just committed SQL at this point — nothing has
   touched prod yet.)
2. GitHub → **Actions** → **DB Migrate (production)** → **Run workflow**.
3. Type `APPLY` in the confirm box and run it. (Any other value aborts.)
4. The **Diff** job runs first with no approval gate and prints:
   - `supabase migration list --linked` — what prod has vs. what's in git.
   - `supabase db push --linked --dry-run` — the exact SQL that would run.
   Read this. This is your last look before prod changes.
5. The **Apply** job then waits on the `production-db` environment. A reviewer
   approves in the GitHub UI. Only then does `supabase db push --linked` apply
   the pending migrations, in filename order.
6. The final step re-prints `supabase migration list --linked` so the run log
   shows the post-apply state.

Re-running is safe: `db push` only applies migrations not already recorded in
prod's `supabase_migrations.schema_migrations` table, and the migrations
themselves use `IF NOT EXISTS` / idempotent patterns.

### Running by hand (break-glass only)

If GitHub Actions is unavailable:

```bash
export SUPABASE_ACCESS_TOKEN=...        # your personal token
export SUPABASE_DB_PASSWORD=...         # prod DB password
supabase link --project-ref <prod-ref>
pnpm db:diff      # review first
pnpm db:migrate   # then apply
```

Prefer the workflow. The manual path skips the recorded dry-run and the reviewer
gate — use it only when CI is down, and announce it to the team.

---

## Verifying prod matches git (drift check)

Drift = prod schema differs from what the committed migrations describe (someone
ran SQL by hand in the dashboard, or a migration was never applied).

- `pnpm db:status` (`supabase migration list --linked`) lists local vs. remote
  migration versions side by side. Any migration present in git but missing from
  the remote column is **pending and unapplied** — apply it via the workflow.
  Any version on the remote that is not in git means someone applied SQL outside
  this pipeline — investigate before doing anything else.
- For a deeper structural check, `supabase db diff --linked --schema public`
  compares the live schema against the migrations and prints any difference. A
  clean (empty) diff means prod matches git. A non-empty diff is drift; capture
  it into a new, properly timestamped forward migration (never edit an
  already-applied migration) and apply that.

Run the drift check after every release and any time a runtime error smells like
a missing column/table.

---

## Rollback guidance

There is **no automatic down-migration.** This repo's migrations are
append-only forward migrations by design, so "rollback" means rolling *forward*
with a corrective migration, not reversing one.

- **A migration half-applied / errored mid-run:** because migrations are written
  idempotently (`IF NOT EXISTS`, guarded `DO` blocks), the usual fix is to make
  the file safely replayable and re-run the workflow. The already-applied
  statements no-op; the rest complete.
- **A migration applied but wrong:** do **not** edit or delete the original
  migration (prod already recorded it). Ship a **new** timestamped migration
  that corrects the schema forward (add the missing column, drop the bad one,
  fix the constraint) and apply it through the same workflow.
- **A destructive change (dropped column/table) you need back:** forward
  migrations cannot recover dropped data. Restore from a Supabase point-in-time
  backup (Dashboard → Database → Backups) to recover data, then reconcile the
  migration history.

Because app code on Vercel and the database are deployed independently, a code
rollback (revert the Vercel deployment) does **not** roll back the schema, and
vice versa. When a release couples a code change to a schema change, prefer
backward-compatible migrations (add before remove) so a code rollback never
lands on a schema it can't read.

---

## Migration history conventions

Migration files use the `YYYYMMDDHHMMSS_*.sql` timestamp convention so the
Supabase CLI parses the leading numeric segment as a version and applies them in
the right order. Keep new migrations on this convention.

Never rename or delete a migration that has already been applied to prod —
renaming an applied migration is itself a drift event, because the remote
`supabase_migrations.schema_migrations` table still references the old version.
If `db push` / `migration list` ever chokes on a version mismatch, the correct
fix is `supabase migration repair` against prod — a deliberate, separately
reviewed change, not something this pipeline does on its own.

---

## Ops runbook: activating drip / offers / browser-control / CMA narrative

This section is the exact, ordered steps to turn on everything shipped in
the drip-sequences, offers, browser-control, and CMA-narrative features.
None of it is live in prod until you do these steps — code merged to `main`
deploys automatically on Vercel, but schema and third-party wiring do not.
Cross-check against `docs/BROWSER-CONTROL.md` for the browser-control
architecture/security detail behind steps 3–5.

### 1. Apply the pending migrations

Six migrations back these features, in this order:

| Migration | Feature |
|---|---|
| `20260830000000_drip_sequences.sql` | Drip nurture sequences (`DripSequence`, `DripEnrollment`). |
| `20260831000000_offers.sql` | Offer lifecycle tracker (`Offer`, `OfferEvent`). |
| `20260901000000_browser_control.sql` | Browser control core: `BrowserLink`, `BrowserPairingCode`, `BrowserSession`, `BrowserAction`. |
| `20260902000000_browser_control_frames.sql` | Screencast frame storage + session liveness heartbeat. |
| `20260903000000_browser_control_headless.sql` | Headless (cloud) session source — makes `BrowserSession.linkId` nullable. |
| `20260904000000_cma_narrative.sql` | `CmaReport.narrative` / `narrativeUpdatedAt` columns for the pre-listing packet export. |

Run `pnpm db:status` first to confirm these are pending, not already
applied. Then follow the normal path above: run the **DB Migrate
(production)** GitHub Actions workflow, type `APPLY`, review the dry-run
diff, get a `production-db` reviewer to approve. Do not apply these by
hand outside the workflow except as the documented break-glass path. All
six are idempotent (`IF NOT EXISTS` / guarded `DO` blocks), so re-running
the workflow after a partial failure is safe.

Verify after: `pnpm db:status` shows all six as applied on both local and
remote; `supabase db diff --linked --schema public` comes back clean.

### 2. Set `TAVILY_API_KEY`

Property/area "Analyze" web research (`lib/property-analysis.ts`,
`lib/area-analysis.ts`, and the `browser_task`/`control_browser` agent
tools' public-web research path) needs **both** `TAVILY_API_KEY` and
`FIRECRAWL_API_KEY` (`lib/env.ts`) to function — either missing, the
feature returns an honest "research not configured" state rather than
crashing (see `lib/env.ts`'s `Property Analyze web research` boot-check
group), so this is a silent-degradation risk, not a hard outage, if
skipped. Set both in the Vercel project's environment variables
(Production **and** Preview, if preview environments exercise this path)
and redeploy for them to take effect. `FIRECRAWL_API_KEY` is presumably
already set if property analysis already works today; confirm both are
present rather than assuming.

### 3. Stage the Research Workspace worker in Modal

The code path is implemented but feature-off. `agent/browser_modal_app.py`
is a separate Modal app with a minimal Playwright image, bounded worker, and
launch endpoint; the web app claims a fenced lease and starts or reuses that
worker. Do not deploy `agent/modal_app.py` or reuse its broad secret bundle
when staging this browser-only surface.

1. Deploy with `CHIPPI_BROWSER_MODAL_APP_NAME` set to an isolated staging app
   name (the default is `chippi-browser`).
2. Set `CHIPPI_BROWSER_MODAL_SECRET_NAME` to the isolated browser secret
   containing only `CHIPPI_BROWSER_APP_URL` and
   `CHIPPI_BROWSER_WORKER_SECRET`; do not alter it. If the staging Vercel
   origin uses Deployment Protection, set optional
   `CHIPPI_BROWSER_MODAL_BYPASS_SECRET_NAME` to a separate Modal secret
   containing only `CHIPPI_BROWSER_VERCEL_BYPASS_SECRET`. When it is absent,
   the worker receives an empty placeholder. The entrypoint uses
   `modal.is_local()` plus remote empty placeholders, so both local deploy and
   remote startup retain the same two-secret worker dependency graph.
3. Apply the Research Workspace lease migration to the staging Supabase
   project after its duplicate-active-session preflight passes.
4. Configure the preview deployment's worker URL, matching worker secret,
   server/client feature flags, and one explicit staging space allowlist.
5. Verify an authenticated launch, first heartbeat, live frame,
   multi-source cited result, reload, Stop, worker crash, and emergency flag
   disable before considering a production canary.

None of steps 1–4 are implemented as of this doc; they are scoped to the
`agent/**` / Modal-deploy track, not the docs track that wrote this runbook.

### 4. Redeploy Modal

After step 3 lands: `cd agent && modal deploy browser_modal_app.py` (or your
CI's equivalent browser-only Modal deploy step). Confirm the new headless-worker function
shows up in `modal app list` / the Modal dashboard before relying on it.

### 5. Load and submit the Chrome extension

For local/internal use: follow "Loading it unpacked" in
`extension/README.md` (`chrome://extensions` → Developer mode → Load
unpacked → `extension/`). For distributing to realtors generally: follow
the same README's Chrome Web Store guidance — the `debugger` permission
needs an explicit justification in the store listing (a draft is included
in the README) and should expect an extended review cycle. Confirm the
extension's configured server URL (popup settings) points at the deployed
Chippi origin, not `localhost`, before handing it to a realtor.

### Post-activation smoke check

After all five steps: in the app, go to Settings → Browser control, issue
a pairing code, pair a freshly-loaded extension, and confirm
`GET /api/browser-control/status` reports a connected link. Then run one
`control_browser` action from chat (e.g. `navigate` to a public URL) and
confirm the approval prompt appears, the visible cursor overlay and
Chrome's own debugger infobar both show up on the target tab, and the
result comes back honestly (not a fabricated success) either way.
