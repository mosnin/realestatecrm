# Chippi Workforce implementation

This change integrates the original Cadre client and execution code. The parent
repository pins `mosnin/cadre` at `60d2307fa846635ce94d8c96f75557eca0b876d3`
on `codex/chippi-workforce`. It does
not replace CRM routes or the logged-out Chippi website. The deployment flags
remain off until the remaining release gates below are met.

## Implemented

- CRM / Workforce navigation inside authenticated personal and brokerage
  workspaces. The imported client uses a router base path, same-origin API
  gateway, and the existing Clerk identity. It does not create another login.
- Workspace selector, role labels, per-workspace conversation restoration,
  explicit brokerage selection, and removal of the blocking switching animation.
- Chippi is provisioned once under concurrent first access, pinned first, and
  text-only. UI, API lifecycle guards, and database constraints protect its
  name, ownership, pinning, archive state, and deletion. Deleting the parent
  workspace remains a supported account lifecycle.
- Existing Cadre worker, scheduling, delegation, memory, computer, browser,
  artifact, integration, voice, and native-client source remains present.
- Signed requests bind actor, scope, role, method, exact path, body, expiry, and
  one-use nonce. Browser cookies and workspace headers are never forwarded as
  runtime authority. Offboarding and membership are checked on every gateway
  request and before background execution, each tool, and worker heartbeat.
- Run/routine authority survives process and transaction boundaries. Personal,
  brokerage-owner, and brokerage-admin computers are separate privacy domains;
  regular brokerage members use their personal workforce. Same-role brokerage
  operators share that role's workforce. This avoids sharing an owner's logged-in
  browser with administrators or ordinary agents.
- Direct native CRM queries expose an explicit read-only catalog: contacts,
  people, deals, tours, properties, pipeline, workspace statistics, stuck deals,
  quiet hot contacts, and overdue follow-ups. Brokerage queries must select a
  CRM workspace belonging to the verified brokerage. Worker arguments cannot
  choose a different personal scope or grant a mutation.
- Chippi orange tokens, sans-serif source typography, and a hosted-client ban
  on italic styles. Standalone Cadre appearance remains available unchanged.
- CI initializes the exact submodule revision and independently tests the runtime
  against isolated PostgreSQL, including its system-identity migration.

## Build and configuration

Initialize `git submodule update --init --recursive integrations/cadre`.
Root dependencies and Cadre dependencies retain separate lockfiles. Cadre uses
pnpm 9.15.0. Do not update either lockfile to accommodate a different tool version.

The root build runs `scripts/build-workforce.mjs`. When enabled it installs the
pinned Cadre dependencies, generates Prisma, builds the actual web client, and
copies its hashed assets to ignored `public/workforce-assets`. It never runs a
database migration. CI and deployment checkouts must include the submodule.

Root Chippi configuration:

| Variable | Purpose |
| --- | --- |
| `CHIPPI_WORKFORCE_ENABLED=true` | Build and serve authenticated Workforce routes |
| `NEXT_PUBLIC_CHIPPI_WORKFORCE_ENABLED=true` | Show the CRM sidebar toggle |
| `CHIPPI_WORKFORCE_API_ORIGIN` | Dedicated HTTPS runtime origin, without a path |
| `CHIPPI_WORKFORCE_SECRET` | At least 32 random characters, server-only |
| `CADRE_PNPM` | Optional executable path to pnpm 9.15.0 |

Dedicated Cadre runtime configuration:

| Variable | Purpose |
| --- | --- |
| `CHIPPI_WORKFORCE_SECRET` | Same server-only bridge secret as Chippi |
| `CHIPPI_APP_ORIGIN` | HTTPS Chippi origin for current-authority and CRM checks |
| `WEB_ORIGIN` | Same Chippi origin for integration return URLs |
| `DATABASE_URL` | Separate operational PostgreSQL database; never point at CRM |
| `SIGNUPS_ENABLED=false` | Accounts remain managed by Chippi |
| `AGENT_RUNTIME`, model/provider variables | Real model execution, not scripted QA |
| `SANDBOX_PROVIDER`, provider variables | Persistent computers |
| `WAKEUP_DRIVER=graphile` | Durable background execution |
| Storage and screen gateway variables | Original Cadre artifacts and live desktop |

Use the dedicated `integrations/cadre/infra/chippi/render.yaml` blueprint, which
keeps the original `infra/render-start.mjs` composition and creates distinct
Chippi service/database names. Apply the fork's Prisma migrations only to that
isolated operational database. Supabase remains the CRM/role system of record;
Convex remains the existing reactive projection. Neither is replaced by the
operational database.

## Verification and remaining release gates

Local verification includes both product test suites, TypeScript checks, root
lint and tenant-scope audit, the managed client build, isolated PostgreSQL
migrations, concurrent provisioning, direct database protection, forged/replayed
requests, role/scope isolation, and transaction-persisted routine authority.
The imported dashboard was inspected in desktop and 390-pixel mobile viewports.
A browser task completed through the actual API/worker with a scripted model
and fake sandbox. That proves the local transport/state path, not a real-world
listing outcome or persistent provider computer.

Do not enable the customer-facing flags until these gates are completed:

1. Provision the dedicated runtime, operational database, artifact storage,
   screen gateway, and real computer/model providers in the selected hosting
   workspace. The Render connector requires explicit workspace selection.
2. Exercise real Chippi -> two workers -> separate screens on one shared
   computer -> shared file -> linked outputs. Restart a worker and replace a
   computer, then verify file recovery and supported session continuity.
3. Connect the existing CRM mutation/autonomy and usage-credit ledgers. Native
   CRM access added here is query-only; it does not bypass saved sending grants,
   approvals, recipient bindings, idempotency, or credit accounting. Cadre's
   original computer/connected-app actions remain in the source runtime.
4. Add a trusted ingress binding for messaging/webhook-triggered runs. In hosted
   mode unbound work fails closed; external providers cannot sign the Chippi
   gateway envelope. Do not advertise inbound channel parity before this works.
5. Bind long-lived remote desktop capabilities to revocation, not just the
   original capability expiry. Gateway streams recheck membership; the separate
   Cadre screen gateway still requires its managed-host acceptance work.
6. Verify real OAuth, file upload/download, stop/steer, takeover, provider failure,
   budget exhaustion, and role changes across two independent organizations.
7. Verify the root deployment against its required existing migrations and
   current Clerk/Supabase configuration, then reconcile the existing Chippi Mac
   shell with the imported desktop source before packaging/signing.

Full source preservation is not a claim that every provider feature has passed
hosted acceptance. The flags stay off while these concrete gates remain.

## Local acceptance receipt

- Root suite: 6,655 passed, seven skipped, plus five passing targeted brokerage
  selection tests added after the full suite.
- Cadre suite: 2,820 passed, 127 provider-gated skips, across 302 passing files.
- Root and Cadre TypeScript checks passed; root lint completed with existing
  warnings. All 52 release-contract checks passed. The tenant-scope audit found
  no unscoped call sites across 952 scanned files and 127 registered tables.
- Managed Cadre client and enabled Next production build passed. The Workforce
  index is present in the route's deployment trace.
- The final system-identity migration was applied to a fresh isolated database;
  the protected-identity, replay, role, body-bound, and authority tests passed.
- Desktop and mobile checks used the internal browser, with no browser errors.
  CI now has an isolated two-viewport browser test and screenshot artifact job;
  its remote result is separate from the completed local browser checks.
