# Database schema — provenance & apply order

This directory holds the database definition. **Read this before treating any
single file as "the schema."** There are two layers and they are applied in a
specific order.

## Authoritative apply order

1. **`schema.sql` — the original bootstrap (run ONCE, first).**
   Creates the original core tables (`User`, `Space`, `Contact`, `Deal`,
   `DealStage`, `DealContact`, `Tour`, `Pipeline`, `Brokerage`,
   `BrokerageMembership`, …), extensions (`pgcrypto`, `vector`), and their
   primary keys / foreign keys. Its header says "Run this in the Supabase SQL
   Editor" because that is exactly its role: a one-time bootstrap for a brand-new
   database.

   ⚠️ **`schema.sql` is a historical snapshot, NOT current truth.** It is frozen
   at the project's early state and does **not** include tables/columns added
   later (e.g. `ArtifactVersion`, `WorkflowRun`, `Announcement`, `SwarmRun`, and
   many more). Do not read it to answer "what does table X look like today."

2. **`migrations/*.sql` — everything since, in filename (timestamp) order.**
   The first migration (`20260314000000_rls_policies.sql`) `ALTER`s the
   bootstrap tables to enable RLS; subsequent migrations add every new table,
   column, index, constraint, and RLS policy. **This sequence is the
   authoritative, current definition of the schema** when layered on top of the
   bootstrap.

`combined_migration_v2.sql` and `setup.sql` are older convenience bundles —
prefer the ordered `migrations/` sequence.

## Reproducing the schema in a fresh environment

```
psql "$DATABASE_URL" -f supabase/schema.sql          # 1. bootstrap (once)
for f in supabase/migrations/*.sql; do               # 2. all migrations, in order
  psql "$DATABASE_URL" -f "$f"
done
```

(or `supabase db reset`, which the Supabase CLI runs against `migrations/` —
ensure the bootstrap tables exist first.)

## Why this matters (the risk this documents)

Without this note, a reader greps `migrations/` for `CREATE TABLE "Contact"`,
finds nothing (it lives in the bootstrap), and may wrongly conclude the schema
is unreproducible — or edits `schema.sql` expecting it to affect a live DB it
never touches again. The layers are both required and neither alone is complete.

## Follow-up (not yet done — needs a live DB)

The cleanest long-term fix is to **regenerate a single, current baseline** via
`pg_dump --schema-only` from production and replace the stale `schema.sql`, so
the two layers collapse into one authoritative file. That requires DB access and
is out of scope for a code-only change; tracked here so it isn't lost.
