# Browser e2e suite (Playwright)

Real-Chromium end-to-end tests for the **public surface**: rendering,
hydration, navigation, middleware auth boundaries, and honest status/404
states. This is the repo's only true browser suite — `tests/e2e/` is a
vitest **mocked route-lifecycle** suite and is unrelated.

## Run locally

```bash
pnpm test:e2e:browser        # = playwright test (config: playwright.config.ts)
```

That's it. The Playwright config boots everything itself (two `webServer`
entries):

1. `e2e-browser/stub-supabase.mjs` — a ~100-line stub PostgREST server on
   `127.0.0.1:55321`.
2. `pnpm dev --port 3100` — the real Next.js dev server, with env loaded from
   `e2e-browser/.env.e2e`.

In sandboxed dev containers Chromium is pre-installed under
`PLAYWRIGHT_BROWSERS_PATH` (e.g. `/opt/pw-browsers`) and downloads are
disabled — do **not** run `playwright install` there. `@playwright/test` is
pinned (see `package.json`) to the version whose Chromium revision matches
the pre-installed one; the config also falls back to the container's
`chromium` binary if revisions ever drift. In CI, browsers are installed
normally (`npx playwright install chromium`).

## Env stubbing approach

`e2e-browser/.env.e2e` (committed, **all values fake**) satisfies exactly the
hard-required tier of `lib/env.ts` — Supabase, OpenAI, Clerk — so
`instrumentation.ts` boot validation passes:

- **Supabase** points at the stub PostgREST server. Public pages are
  *server*-rendered from Supabase, so browser-side route interception can't
  mock them; the stub serves one seeded Space (`slug=e2e-demo`,
  "E2E Demo Realty"), a one-row `User` table (so the `/status` DB probe is
  deterministically Operational), and `[]` for everything else
  (postgrest-js `.maybeSingle()` reads `[]` as "no row").
- **Clerk** keys are syntactically valid stubs (`pk_test_` base64-decodes to
  `clerk.example.com$`), enough for `@clerk/nextjs` to boot without keyless
  mode. No session cookie ever exists, so `clerkMiddleware` treats every
  request as signed-out — which is exactly the behavior under test at the
  auth boundary. **No real Clerk login is attempted.**
  On http origins, `@clerk/nextjs` also wants a `__clerk_db_jwt` "dev
  browser" identity cookie and, if it's missing, 307-redirects the *browser*
  cross-origin to `https://{frontendApi}/v1/client/handshake` to obtain one
  — `frontendApi` here being the fake `clerk.example.com`, which can never
  resolve. `playwright.config.ts`'s `use.storageState` pre-seeds that cookie
  (any non-empty value satisfies the middleware's truthiness check) so this
  handshake never triggers; see the comment there for the full story and why
  `page.route()` can't be used to block it instead.
- **OpenAI** key is a stub; nothing in the suite triggers an LLM call.

Determinism: every test blocks all non-localhost requests
(`helpers.ts#blockExternalRequests`), so Clerk CDN / Amplitude / Sentry /
Calendly / pixels can never flake a run. Console-error assertions filter only
that deliberate noise (`collectUnexpectedErrors`) — hydration mismatches and
render crashes still fail the test.

## What's covered

| Spec | Asserts |
| --- | --- |
| `home.spec.ts` | `/` renders the hero, zero unexpected console/page errors through hydration, header CTA ("See a demo") navigates to `/demo`. |
| `intake.spec.ts` | `/apply/e2e-demo` server-renders the real intake shell from the seeded Space; unknown slug → honest `404` (not a 500). |
| `auth-boundary.spec.ts` | Unauthenticated `/s/[slug]` → `/login/realtor?redirect_url=/s/…`; `/setup` redirects **without** `redirect_url` (unsafe post-login destination). |
| `status.spec.ts` | `/status` reports honest per-subsystem states (DB Operational via stub, Agent/Integrations Unknown) and never claims "All systems operational" when it can't verify everything. |
| `not-found.spec.ts` | Garbage route → designed 404 page with a real 404 status. |

## What needs a seeded environment (next steps)

These can't be tested against stubs and are intentionally out of scope until
a seeded staging environment (real Clerk test instance + disposable Supabase)
exists:

- **Real auth flows** — sign-up/sign-in, post-login `/auth/redirect`, `/s/*`
  dashboard rendering, tenant scoping across two seeded workspaces.
- **Chat streaming** — token-by-token SSE, status events, disconnect-survival
  (CLAUDE.md non-negotiables #1–2) need a live LLM key or a streaming fake.
- **Intake submission** — the `/apply` chat is LLM-backed; submitting a lead
  end-to-end needs a real model + writable DB.
- **Customized intake configs** — brokerage-templated / custom form configs,
  signed photo URLs (Wasabi), paid-tier `hidePoweredBy`.
- **Billing surfaces** — Stripe checkout redirects.

## CI

`.github/workflows/e2e-browser.yml` runs the suite on every PR
(pnpm-cached install, `npx playwright install chromium`, report artifact on
failure). The job is currently **soft-fail** (`continue-on-error: true`)
while it burns in — flip it to required once it has proven stable.
