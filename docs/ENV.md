# Environment variables

Every variable the app reads, what breaks without it, and where it goes.
Source of truth is `lib/env.ts` — this file explains it in plain terms.

**To see what you currently have set on Vercel:**

```sh
npx vercel env ls
```

(or Vercel dashboard → your project → Settings → Environment Variables)

The app also validates on boot: required vars missing = the deploy fails
loudly with a list. Optional vars missing = a `[env]` warning line in the boot
log naming the feature that just went inert.

---

## 1. REQUIRED — the app will not start without these

You already have all six, or nothing would be serving today.

| Variable | What it is |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Database URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Database public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Database admin key (bypasses RLS — this is the crown jewel) |
| `OPENAI_API_KEY` | Powers chat + embeddings |
| `CLERK_SECRET_KEY` | Login |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Login (browser side) |

---

## 2. NEEDED NOW — the background worker

Without these, **nothing runs in the background**: no lead SLAs, no tour
reminders, no drip sends, no daily briefings, no billing reconciles.

| Variable | Value | Where |
|---|---|---|
| `WORKER_URL` | `https://chippi-worker.trychippi.workers.dev` | Vercel only |
| `WORKER_SECRET` | (generated at deploy — see the deploy output) | Vercel **and** the Worker |
| `CRON_SECRET` | (generated at deploy) | Vercel **and** the Worker |

`WORKER_SECRET` and `CRON_SECRET` must be **byte-identical** in both places or
every job 401s. On the Worker they are set with
`npx wrangler secret put <NAME>`, never in `wrangler.toml`.

---

## 3. STRONGLY RECOMMENDED — things that silently degrade

| Variable(s) | What breaks without it |
|---|---|
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Rate limiting falls back to in-memory (per-instance, so effectively weaker); the worker heartbeat can't be recorded, so the readiness page can't confirm the scheduler is alive |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | No billing. Checkout and subscription webhooks dead |
| `STRIPE_PRICE_*` (plan + top-up ids) | Specific plans/top-ups can't be purchased |
| `AGENT_INTERNAL_SECRET` | Agent callbacks 503 — the Modal agent can't report back |
| `TENANT_GUARD=1` | The cross-tenant scope guard doesn't observe. Recommended ON. Then `TENANT_GUARD_ENFORCE=1` once its Sentry log is clean (see `lib/supabase-guard.ts`) |

---

## 4. FEATURE-GATED — absent = that one feature is off

| Variable(s) | Feature |
|---|---|
| `MODAL_WEBHOOK_URL` | Long autonomous runs offload to Modal (falls back to in-process) |
| `MODAL_CHAT_URL` | Detached background chat turns |
| `COMPOSIO_API_KEY`, `COMPOSIO_WEBHOOK_SECRET` | App integrations (Gmail, Slack, calendar…) and their triggers |
| `TAVILY_API_KEY`, `FIRECRAWL_API_KEY` | Property "Analyze" web research (needs BOTH) |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | Studio scheduled posts + Composio trigger dispatch. **NOT the scheduler** any more |
| `REDIS_URL` | Server-side cache (cold without it — correct, just slower) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Browser push notifications (needs all three) |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Outbound email |
| `TELNYX_API_KEY`, `TELNYX_FROM_NUMBER` | Outbound SMS |
| `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_ROOT_DOMAIN` | Correct links in emails, sitemap, intake URLs |

---

## 5. NEVER SET THIS

| Variable | Why |
|---|---|
| `INNGEST_CRONS_ENABLED` | The Cloudflare Worker and the legacy Inngest cron mirrors carry the **same 23 jobs**. Both enabled = every job fires twice = duplicate reminder emails and duplicate charges. The readiness page reports this combination as **down**. |

---

## Kill switches (set only to intentionally disable something)

`CRON_ROUTINES_DISABLED`, `CRON_AGENT_TASKS_DISABLED`,
`WORK_SESSION_ACTIONS_DISABLED`, `INNGEST_CRONS_DISABLED` — each turns off the
named subsystem. Useful in an incident; leave unset normally.

---

## Checking your work

1. `npx vercel env ls` — what is set
2. Deploy, then read the boot log for `[env]` warning lines — each names a
   feature that is currently inert
3. Admin → background readiness page — the authoritative check for the
   scheduler, cron auth, executor, push, and integrations in one place
