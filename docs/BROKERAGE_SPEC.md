# Brokerage Tier

> The multi-agent layer on top of the realtor CRM: organisations ("brokerages")
> that own a roster of realtor workspaces, route inbound leads, run commission
> ledgers, manage seat-based billing, and surface a compliance-grade activity
> log. This doc is the canonical reference for engineers touching anything
> under `/app/broker/*`, `/app/api/broker/*`, or the brokerage-scoped
> migrations.

A broker owner signs up; creates their Brokerage; invites realtors; each
realtor gets a workspace ("Space") linked back to the brokerage. Leads route
in via public application forms or manual broker-side entry and land in the
right agent's workspace. Deals close, commissions land in a persistent
ledger. The broker gets visibility across every agent without stepping into
their individual Space.

**Table of contents**

1. Concepts
2. Permission model
3. Data model

_Chunks covering the feature map (BP1–BP7 + the three linear step features),
the route inventory, audit logging, and known gaps are appended by
subsequent writers in separate commits. Search the file for `# Feature map`,
`# Route inventory`, etc._

## 1. Concepts

- **Brokerage** — top-level organisation. Owned by a single `User` via
  `Brokerage.ownerId` (FK `ON DELETE RESTRICT`, supabase/schema.sql:34). Has
  a `status` of `active | suspended` (schema.sql:35) and an optional unique
  `joinCode` (schema.sql:38).
- **BrokerageMembership** — user ↔ brokerage join row carrying a `role`
  (schema.sql:239). Unique `(brokerageId, userId)` so a given user holds at
  most one role per brokerage (schema.sql:246).
- **Space** — the per-agent workspace. Linked back to a brokerage via the
  nullable `Space.brokerageId` column (schema.sql:54), `ON DELETE SET NULL`
  so un-brokering never cascades.
- **Invitation** — token-based invite row with a 7-day default TTL
  (schema.sql:257). Status CHECK enum is
  `pending | accepted | expired | cancelled` (schema.sql:255-256).
- **Public entry paths**:
  - `/apply/b/[brokerageId]` — inbound lead application form.
  - `/s/[slug]` — a realtor's workspace (agent-facing).
  - `/broker/*` — broker-owner/admin control surface.

## 2. Permission model

Three nested helpers, each building on `requireAuth`'s offboarding gate
(`User.status !== 'offboarded'` at lib/api-auth.ts:30-56).

| Helper | Returns | Roles allowed | When to use |
|---|---|---|---|
| `requireAuth` | `{ userId }` or `NextResponse` (401/403) | Any signed-in, non-offboarded user | Default API auth |
| `getBrokerContext` | `{brokerage, membership, dbUserId}` or `null` | `broker_owner`, `broker_admin` | Server components; page-level gates |
| `requireBroker` | same, throws on null | same | API routes that 403 on missing broker ctx |
| `getBrokerMemberContext` | same | `broker_owner`, `broker_admin`, `realtor_member` | Pages/routes that should be visible to any brokerage member |

**Offboarding hard-stop.** Every broker helper re-checks `User.status` after
Clerk auth and returns `null` if the user has been offboarded (hardening
applied in Phase BP3 audit follow-up, commit 6d05915; see
lib/permissions.ts:72-79 and :131-132). Server-side pages under
`/app/s/[slug]/reviews/*` also re-check this locally (Linear Step 1 audit
follow-up, 4e3fc5e) because they use `auth()` directly instead of going
through `requireAuth`.

**Dual-auth pattern.** `POST /api/broker/reviews/[id]/comments` accepts
EITHER a broker member OR the requesting agent (`review.requestingUserId
=== dbUser.id`). That's the path that lets the realtor post comments on
their own flagged-for-review deal.

**Role enum** (lib/permissions.ts, via CHECK at schema.sql:243):
`broker_owner`, `broker_admin`, `realtor_member`. The
`Invitation.roleToAssign` column only accepts `broker_admin | realtor_member`
(CHECK constraint, schema.sql:253; a new owner is minted by the
create-brokerage path, not by an invitation).

## 3. Data model

One compact paragraph per table. Cite the migration or schema.sql line
where the table is defined. **Do not dump every column** — name the
important ones and the constraints that matter for correctness, and link
out.

### Brokerage
The top-level org. Base columns come from
`supabase/migrations/20260314000003_org_system.sql` and are mirrored in
supabase/schema.sql:31-45: `name`, `ownerId` with `ON DELETE RESTRICT`,
`status` enum `active|suspended`, optional `logoUrl`/`websiteUrl`,
`joinCode` (UNIQUE). Billing + routing + commissions add:
- `plan` (`starter|team|enterprise`), `seatLimit`
- `stripeCustomerId`, `stripeSubscriptionId`, `stripeSubscriptionStatus`,
  `stripePeriodEnd`
- `autoAssignEnabled`, `assignmentMethod` (`manual|round_robin|score_based`),
  `lastAssignedUserId` (round-robin cursor)
- `defaultAgentRate`, `defaultBrokerRate` (commission defaults snapshotted
  onto ledger rows at close time)

Added across migrations `20260507000000_commission_ledger.sql` (rate
defaults), `20260509000000_brokerage_billing.sql`
(plan/seatLimit/stripe*), and `20260513000000_brokerage_routing.sql`
(autoAssign/method/cursor). See the feature-map chunk for which phase
added which column.

### BrokerageMembership
User ↔ Brokerage join with a `role` enum (schema.sql:239-247). Unique on
`(brokerageId, userId)` so a user can only join a given brokerage once
(schema.sql:246).

### Invitation
Token-based invite (see columns + indexes in
`supabase/migrations/20260314000003_org_system.sql`; mirrored at
schema.sql:249-260). Token is 64-char hex via
`encode(gen_random_bytes(32), 'hex')` (schema.sql:254); 7-day default
`expiresAt` (schema.sql:257). Status enum:
`pending | accepted | expired | cancelled` (schema.sql:255-256).

### Space
The per-agent workspace. Gains a nullable `brokerageId` column (same
migration; schema.sql:54) linking it back to the brokerage; `ON DELETE SET
NULL` so un-brokering a Space doesn't cascade-delete the agent's data.

### Contact
Gains a nullable `brokerageId` column in
`supabase/migrations/20260402000001_contact_brokerage_id.sql` (mirrored
at schema.sql:134) — distinguishes brokerage-owned leads (routed,
reportable) from an agent's personal contacts. FK is
`ON DELETE SET NULL`.

### CommissionLedger
One row per `won` Deal. Sync trigger on Deal (migration
`supabase/migrations/20260507000000_commission_ledger.sql`). Rates are
snapshotted at close — `defaultAgentRate` / `defaultBrokerRate` from the
Brokerage at the moment of close. Status CHECK enum:
`pending | paid | void` (migration line 71). `UNIQUE (dealId)` +
`ON CONFLICT DO NOTHING` makes the won-trigger idempotent across
status bounces. Rate-sum cap (≤ 100%) and referral invariant
(non-zero `referralRate` ⇒ non-null `referralUserId`) are enforced at
the API layer, not the schema.

### DealReviewRequest + DealReviewComment
Broker sign-off queue on a specific deal. Migration
`supabase/migrations/20260510000000_deal_review_requests.sql`. Partial
unique index `idx_dealreview_open_per_deal ON "DealReviewRequest"("dealId")
WHERE status = 'open'` (migration lines 92-93) enforces one active
review per deal — API callers must translate a 23505 unique-violation
into a 409. Status CHECK enum: `open | approved | closed` (migration
lines 26-27). `DealReviewComment` references `DealReviewRequest.id`
via `reviewRequestId` with `ON DELETE CASCADE`.

### BrokerageTemplate + MessageTemplate.sourceTemplateId / sourceVersion
Versioned playbook library. Migration
`supabase/migrations/20260511000000_brokerage_templates.sql` replaces a
legacy "magic Note" JSON hack (a Note row with
`title = '[BROKER_TEMPLATES]'` in the broker_owner's personal Space).
That migration also adds two provenance columns to MessageTemplate
(per-agent copies): `sourceTemplateId` (FK to `BrokerageTemplate`,
`ON DELETE SET NULL`) and `sourceVersion` (integer, nullable). The
publish flow uses `sourceVersion IS NULL` as the signal that the agent
edited the copy locally and skips those rows on re-publish. Migration
`20260512000000_template_published_version.sql` adds `publishedVersion`
on BrokerageTemplate so the UI can compare `version === publishedVersion`
directly (replaces a flaky `updatedAt` vs `publishedAt` 1-second-slack
heuristic).

### DealRoutingRule
Optional rules-first routing layer. Migration
`supabase/migrations/20260514000000_deal_routing_rules.sql` + hardening
in `supabase/migrations/20260515000000_routing_rules_hardening.sql`.
Criteria fields (`leadType`, `minBudget`, `maxBudget`, `matchTag`) are
all nullable and AND-combined. Destination is XOR-enforced via CHECK
`deal_routing_rule_destination_xor`:
`("destinationUserId" IS NOT NULL AND "destinationPoolMethod" IS NULL) OR ("destinationUserId" IS NULL AND "destinationPoolMethod" IS NOT NULL)`
(migration lines 72-76). A second CHECK
`deal_routing_rule_budget_range` requires `maxBudget >= minBudget` when
both are set. Hardening flipped `destinationUserId` FK from
`ON DELETE SET NULL` to `ON DELETE CASCADE` because the SET NULL +
XOR combination would make a user hard-delete roll back on the CHECK
(20260515 header).

### AuditLog
Single immutable audit table (supabase/schema.sql:284-294). Columns: `id`,
`clerkId` (nullable for system events), `ipAddress`, `action`, `resource`,
`resourceId`, `spaceId` (nullable for brokerage-wide events), `metadata`
(jsonb — MUST include `brokerageId` for null-spaceId events, per the
Linear Step 2 scoping rule), `createdAt`. The `AuditAction` union in
lib/audit.ts:25-36 currently enumerates `CREATE | UPDATE | DELETE |
ACCESS | LOGIN | LOGOUT | ADMIN_ACTION | OFFBOARD`.
