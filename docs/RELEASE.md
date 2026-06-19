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
