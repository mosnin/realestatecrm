# Working on this repo

Real-estate CRM SaaS ("Chippi"): Next.js 15 App Router + React 19 on Vercel,
Clerk auth, Supabase Postgres (service-role + manual `spaceId` scoping — RLS is
defense-in-depth only), OpenAI Agents SDK (TS in `lib/ai-tools/`, Python on
Modal in `agent/`), OpenRouter for all text LLM calls (`lib/llm.ts`), Inngest
absent — background work is Vercel crons (`vercel.json`) + Modal.

## Product non-negotiables (do not regress these)

1. **Chat must feel alive.** The direct path streams token-by-token behind an
   escalation hold-back window (`lib/chat/direct-stream.ts`), and both paths
   emit `status` SSE events rendered as the thinking indicator's action line
   (`components/ai/hooks/use-agent-task.ts` → `currentAction`,
   `components/ai/blocks/thinking-indicator.tsx`). Never reintroduce
   buffer-the-whole-reply behavior; never leave multi-second gaps with no
   status/tool/reasoning signal on the wire.
2. **Turns survive the browser leaving.** Stream `cancel()` handlers must NOT
   abort the turn: all three chat paths (direct, TS SDK, Modal proxy) keep
   running after disconnect, persist the assistant message, and register an
   `after()` keep-alive so Vercel doesn't suspend the function. If you touch
   these paths, preserve that contract and its bounds (LLM client timeout,
   SDK maxTurns, idle watchdog, loop-guard).
3. **Tenant scoping.** Every Supabase query in request paths must scope by
   `spaceId` / `brokerageId` derived from the authenticated context. The
   service-role key bypasses RLS — the `.eq(...)` IS the security boundary.
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
