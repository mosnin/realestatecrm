# Working on this repo

Real-estate CRM SaaS ("Chippi"): Next.js 15 App Router + React 19 on Vercel,
Clerk auth, Supabase Postgres (service-role + manual `spaceId` scoping — RLS is
defense-in-depth only), OpenAI Agents SDK (TS in `lib/ai-tools/`, Python on
Modal in `agent/`), OpenRouter for all text LLM calls (`lib/llm.ts`), background
work is the Cloudflare Worker (`worker/`, `docs/WORKER.md`) for recurring
jobs plus Inngest for **events only** (`lib/inngest/functions.ts`) and Modal
for the agent. Do not set `INNGEST_CRONS_ENABLED` while the Worker is live.
`vercel.json` keeps three idempotent recovery crons as a safety rail only.

## Product non-negotiables (do not regress these)

1. **One assistant turn produces one visible answer.** Stream the final answer,
   and keep a compact activity disclosure for tools when useful. Internal
   retries, tool schemas, parameter corrections, and progress narration must
   never become separate transcript messages or repeated user-facing text.
2. **The user controls every turn.** Stop must cancel the exact active turn and
   restore the composer; Steer must replace direction without duplicating the
   queued message; edit and remove must work while a message is pending. Work
   may continue after navigation only when the active state remains visible and
   stoppable. A stale, failed, or invisible turn must never hold the composer or
   the queue.
3. **Tenant scoping.** Every Supabase query in request paths must scope by
   `spaceId` / `brokerageId` derived from the authenticated context. The
   service-role key bypasses RLS — the `.eq(...)` IS the security boundary.
   New code should open tenant tables via `tenantTable(supabase, 'Table',
   { spaceId })` (`lib/tenant-db.ts`), which pre-applies the scope so it
   can't be forgotten; `TENANT_TABLES` there is the registry of tenant
   tables → scope column. The `lib/supabase-guard.ts` observer (opt-in via
   `TENANT_GUARD=1`; Sentry-log in prod, throw in dev/test) flags reads that
   reach a tenant table with no scope filter — annotate the legitimate
   non-`eq` patterns (post-fetch ownership check, capability token, admin
   cross-tenant) with `.unscoped('why it is safe')`.
4. **Billing accuracy.** LLM calls opt into OpenRouter usage accounting
   (`usageAccountingParams()` in `lib/llm.ts`, `usage_accounting_extra_body()`
   / `CostTrackingClient` in `agent/llm.py`) so exact `usage.cost` reaches
   ChatUsage. New direct provider calls must do the same.
5. **Honest UI.** No fabricated trust claims (certifications, testimonials,
   fake logos), no success celebrations on failed deliveries, degraded states
   are reported as degraded.

## Testing policy

- **Never add `readFileSync`-the-source "contract" tests.** Tests that assert
  substrings of production source freeze incidental spelling, block legitimate
  refactors, and verify nothing about behavior. Write behavioral tests:
  execute the route handler / function with mocks and assert on responses and
  side effects (see `tests/api/messaging-routes.test.ts`,
  `tests/lib/chat-direct-llm.test.ts` for the pattern).
- **When an existing source-grep test fails on a legitimate change, replace it
  with a behavioral test covering the same intent — do not revert the change
  to appease the test.** Many legacy `*-contract.test.ts` files under `tests/`
  are this genre; they are candidates for conversion whenever touched.
- Full gate: `pnpm typecheck && pnpm lint && pnpm test` (and
  `cd agent && python -m pytest tests/` for Python changes).

## Conventions

- All text LLM work goes through `getLLMClient()` / `agent/llm.py` — never
  `new OpenAI(...)` directly (breaks OpenRouter-only deploys). Audio-only
  endpoints are the sanctioned exception.
- Fire-and-forget side effects in request paths use the shared-promise
  `after()` keep-alive idiom (see `lib/gcal-helpers.ts`).
- Server/client component splits: server pages delegate to `*-client.tsx`.
  Don't pass functions across the RSC boundary.
- Migrations: append-only, idempotent SQL in `supabase/migrations/`, applied
  via the human-gated workflow (`docs/RELEASE.md`) — never assume a migration
  is live in prod just because it's in git.
