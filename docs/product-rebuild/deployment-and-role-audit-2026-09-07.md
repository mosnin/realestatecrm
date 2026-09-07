# Deployment, agent execution and workspace/role audit

Audit target: `mosnin/realestatecrm`, `codex/autonomous-product-rebuild`, application baseline `dfccfaeb8c07b9eb5dc4bffaac34474883246791`.

## Current deployment state

- Created dedicated Vercel-managed Convex resource `chippi-follow-up` (`store_la1kSyFocCUNGz09`) on the existing Free plan.
- Deployed schema, indexes, HTTP actions and functions to production deployment `charming-armadillo-315` with Convex CLI; schema validation and Convex TypeScript validation passed. Bootstrap bindings were replaced with actual generated bindings.
- Dashboard: https://dashboard.convex.dev/t/mosnin-s-projects/chippi-follow-up/charming-armadillo-315
- Backend: https://charming-armadillo-315.convex.cloud
- HTTP Actions: https://charming-armadillo-315.convex.site
- Manually configured `CONVEX_HTTP_URL`, `CHIPPI_CONVEX_SECRET`, and `CHIPPI_CALLBACK_SECRET` on Vercel project `chippi`, production environment. Matching service secrets and `CHIPPI_APP_ORIGIN=https://www.usechippi.com` are configured on Convex. Values are not committed or included in this report. Local configuration files are gitignored and owner-readable.
- Live HTTP verification: unauthenticated list returned 401; authenticated list for a synthetic verification workspace returned 200 and an empty array. No customer data or outbound messages were used.
- Web production is still `75113c0d68f40df0999d2dd470b831ffde3c3665`, deployed August 26, deployment `dpl_9eQVoJbcH3yHCu4S2wM2QfqrGKfp`, Ready at https://www.usechippi.com.
- The new web callback returns 404 in production. New Vercel environment values take effect on a subsequent web deployment. The Convex pilot is not activated; no routine ID was selected.

## Prioritized findings

### P0 — The release path prevents hosted verification of the current application

`vercel.json:2` explicitly exits successfully for every preview build, instructing Vercel to skip it. The recent PR deployments, including `dfccfaeb`, `093adaf7`, and `8608563a`, are CANCELED. Production is still the August 26 baseline. The new UI, reliability changes and callback therefore cannot be judged by looking at production.

Action: enable a branch-specific preview, verify the required database/worker revisions against that environment, exercise the callback there, then release the exact accepted revision. Do not deploy the full rebuild ahead of the atomic-assignment migrations described in the existing release notes.

### P1 — Brokerage switching does not select a brokerage

`components/dashboard/sidebar.tsx:493-519` builds distinct membership entries but gives all of them `href: '/broker'` and marks all current whenever the pathname is a broker page. `lib/permissions.ts:183-235` and `:253-295` then choose owner first, admin next, oldest within a tier. No selected brokerage ID is carried to the destination. `app/broker/layout.tsx:245` supplies only the resolved membership to the destination shell, hiding the other memberships on that side.

Impact: a user who owns one brokerage and administers another cannot reliably switch to the second. This is an active-context correctness problem, not evidence that an unauthorized tenant can be accessed.

Action: introduce an explicit active brokerage identifier, validate current membership server-side for every request, and use the same resolver for the shell, pages, APIs and agent context. Keep all eligible memberships in the switcher and check only the selected one. Preserve the last useful page within each workspace.

### P1 — Background identity checks do not fully match interactive offboarding

Interactive broker helpers reject `User.status = offboarded`. The Convex callback checks `clerkId` and `platformRole = banned`, but does not select or reject `User.status`. The canonical headless context also only selects the owner's `clerkId` (`lib/agent/run-instruction.ts:68-105`). The routine cron resolves owners without reading status.

Impact: the reviewed code does not demonstrate immediate refusal of a previously scheduled personal run after offboarding. Existing offboarding may disable other resources; that is not a replacement for execution-time identity validation. No exploit or live customer run was attempted.

Action: use a shared current-actor eligibility check at every background execution boundary, including offboarded/banned users, removed membership where relevant, and suspended organizations. Add offboarding-during-queue tests before activating the pilot.

### P1 — Team and brokerage are not three distinct operational scopes

The reviewed model has personal `Space`, `Brokerage`, and `BrokerageMembership`. Membership roles are `broker_owner`, `broker_admin`, and `realtor_member` (`lib/types.ts:7`). `team` and `team_plus` are brokerage billing plans (`lib/types.ts:43-47`); no separate Team/TeamMembership hierarchy or team-lead permission appears in the reviewed schema/types. The switcher labels these organizations as teams while the shell labels them Brokerage.

Action: decide whether a team is simply the same organization product or a subgroup inside a brokerage. If subgroup support is required, define team membership and team-scoped leads/analytics before adding a third dashboard. A team lead should not need brokerage-admin power just to manage their own agents.

### P2 — Switching adds avoidable delay and loses place

Crossing layouts runs a full-screen logo transition: a 620 ms hold plus a 500 ms exit, with a 3-second safety timeout (`components/dashboard/account-switch.tsx:64-90`). This is configured animation timing, not a measured production latency percentile. Both dashboard layouts mount it. The brokerage layout also performs sequential identity, membership, subscription, name and aggregate reads before rendering; counts feed the splash. `getBrokerMemberContext` is not request-cached in the reviewed code, unlike `getSpaceForUser`.

Action: render the destination shell immediately with a clear active-workspace label. Remove the blocking account-switch splash, deduplicate request-scoped context resolution, parallelize independent reads, and defer nonessential counts. Measure click-to-usable content for warm/cold switches on desktop/mobile before assigning a performance score.

### P2 — Shortcut hints imply behavior that is not implemented

The switcher renders Command-1/2/3 and Command-A labels (`components/dashboard/sidebar.tsx:641-680`), but the reviewed component has no matching key handler. Command-A would also conflict with normal Select All behavior.

Action: remove decorative shortcut hints or implement accessible, nonconflicting shortcuts and test them. Membership roles should appear alongside names so users know the authority of the destination.

### P2 — Agent capability differs substantially across contexts

Agent chat uses the TypeScript tool runtime. Automatic saved routines use that runtime when the saved policy is autonomous, retaining Redis locks/budgets and Supabase activity/outcome persistence. Review-mode paths may use Modal. Brokerage chat resolves admin/owner membership and uses separate broker conversation tables, but agentic work depends on Modal and the brokerage owner's personal Space for runtime settings/usage; missing Modal/runtime space falls back to snapshot Q&A (`app/api/ai/broker-task/route.ts:550-605`). Realtor members do not have broker-wide agent access.

Action: show the effective scope, available actions, sending mode and operational dependencies in the agent UI. A snapshot answer must not look like completed work. Longer-term, give organization runs organization-owned runtime settings and integration authority rather than depending on the owner's personal workspace.

## Current role behavior

| Role | Current scope and capabilities | Important restriction/gap |
| --- | --- | --- |
| Personal agent/workspace owner | Personal CRM and Chippi tools under saved permission mode | Background offboarding checks need to match interactive checks |
| Brokerage member (`realtor_member`) | Member dashboard and assigned work; personal Chippi remains personal | No brokerage-wide agent; no separate team-lead role |
| Brokerage admin (`broker_admin`) | Brokerage lead management, settings and broker agent; may promote members | Cannot change owner, self, or existing peer-admin roles; still resolves the default brokerage |
| Brokerage owner (`broker_owner`) | Organization ownership, billing and role administration | Preferred automatically over other memberships; switching needs explicit scope |
| Platform admin | Separate platform administration with finer admin capability roles | Must remain separate from customer workspace membership |

Role mutation APIs check current actor/target membership and prohibit self-role changes and owner-role changes. These are positive controls; tests passing on them do not establish every role path is correct.

## How the pilot agent runs

1. Existing hourly worker calls the routine-discovery API.
2. Supabase supplies the selected saved routine and scheduled slot.
3. Convex deduplicates the workspace/routine/slot and schedules one callback.
4. The callback atomically claims the job in Convex, then reloads the tenant-scoped routine and current owner from Supabase.
5. The canonical runner applies saved autonomy policy, tool grants, shared Redis lock and token budget; customer data remains in Supabase and providers handle delivery.
6. Convex records completed/failed/skipped/uncertain execution. Pending or uncertain slots are not blindly replayed. Status currently refreshes through an authenticated Next.js endpoint every 15 seconds; it is not a direct Convex realtime subscription.
7. A later discovery tick advances a terminal routine slot in Supabase with a compare-and-set.

This pilot adds durable coordination for one saved routine; it does not replace all schedulers or prove that leads become appointments. Model completion, sending acknowledgement, recipient delivery and booked appointments remain different outcomes.

## Verification and limitations

- Live Convex deployment and authenticated/unauthenticated HTTP paths verified.
- Actual production web revision and callback absence verified through Vercel and an HTTP request.
- 63 targeted tests passed across permissions, member scope, offboarding, tenant isolation and the Convex bridge/coordinator. Main application TypeScript passed with generated bindings.
- Live browser inspection reached the public site and sign-in. No authenticated agent/admin/member sessions were supplied or exercised, so no production switch latency or live role acceptance is claimed.
- Local browser reproduction with two synthetic memberships and the real switcher showed both brokerages checked and both linking to `/broker`. It is component-level evidence, not production-session verification.
- This is an audit of role/navigation/agent behavior. Broad product fixes, migrations, web promotion, permission changes and customer sending were not performed in this audit.

## Recommended next implementation order

1. Enable the intended preview branch and establish a deployable, migration-compatible baseline.
2. Close background offboarding gaps before activating any selected Convex routine.
3. Implement one server-validated active-workspace resolver across navigation, APIs and agent execution.
4. Unify organization naming or introduce explicit team scope and a team-lead role, according to the actual customer hierarchy.
5. Remove blocking transitions and redundant context reads; measure real switching latency.
6. Exercise agent/member/admin/owner sessions with two organizations, including role changes during a running session, before promotion.
