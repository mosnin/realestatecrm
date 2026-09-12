# People, Deals, and Properties: product and data audit

Audited 2026-09-07 against `mosnin/realestatecrm`, branch `codex/autonomous-product-rebuild`, commit `3174aff9d196ff44ca8ad62e66eb0561ef6a6267`.

## Decision

Keep the existing product and features. These pages have substantial CRUD and useful detail tools, but do not yet make daily work reliably obvious. Simplify the first screen and strengthen the information behind it. Another visual rewrite or database migration is not the immediate fix.

Heuristic product-fit scores, not customer-research scores or measured churn attribution:

| Page | Agent fit | Brokerage fit | Main gap |
| --- | --- | --- | --- |
| People | 5/10 | 4/10 | A scored directory rather than a dependable response/follow-up queue |
| Deals | 6/10 | 4/10 | Useful pipeline and detail features, but incomplete risk signals and weak brokerage drill-down |
| Properties | 4/10 | 3/10 | Saved inventory/research gallery, not yet a practical listing-work and matching surface |

Complexity is misplaced: large introductions, repeated metrics and filters consume space, while response ownership, evidence freshness, deadlines and direct actions are missing or buried. Mobile simplification removes some of the information users actually need.

## Evidence and limits

- Read the actual agent and brokerage page components, route handlers, models, scoring, property research/merge, pipeline metrics, membership resolver, and deal risk logic.
- Exercised actual ContactTable + PerformanceStrip, DealsPageClient, PropertyListGrid, BrokerPeopleTable and BrokerPropertiesClient in an isolated local browser fixture, desktop and 390 × 844 mobile. Synthetic records, fake GET responses, mutations rejected. No customer communications or records changed.
- Browser reproduced score-first ordering over an overdue contact; an overdue inspection represented as On track; the contradictory “Steady” narrative alongside At risk; bathroom rounding; broker chat links; mobile loss of property assignment/price and deal action/risk information.
- The property server-page Market ready computation was traced in source, not exercised against a live database. Properties browser inspection mounted the actual grid, not its server-page header.
- 48 existing tests passed across five files: deals-health, contacts-pagination, contacts-filters, deals-next-move-refresh, tenant-idor-deals-properties-drafts. These establish their existing contracts; they do not cover or negate the newly identified gaps. Initial test runner thread configuration failed before tests; rerun with explicit min/max workers passed.
- All latest-commit GitHub code CI checks passed. Vercel staging still reports deployment failure; production build was ignored. This is a branch audit, not proof the live product contains this revision.
- No live customer-data sampling, migration-state verification, provider receipt reconciliation, or churn cohort analysis was performed. Actual record accuracy and causal churn impact remain unmeasured.

## People

Keep: search, saved views, import, duplicate merging, notes, follow-up dates, source attribution, detail activity, connected deals/tours and existing contact actions.

1. **P1 — Default priority is leadScore, not action urgency.** `components/contacts/contact-table.tsx:675` sorts Hottest first purely by score. Browser fixture placed a score-92 person with no action due above a score-20 buyer whose follow-up was overdue. lastContactedAt exists in Contact but is not in list rows. Lead readiness and response urgency are different signals; a low score must not hide a commitment.
2. **P1 — Sales and rental lifecycles are conflated.** `lib/constants.ts:22` and `components/contacts/contact-form.tsx:36` expose Qualifying/Tour/Applied. Buyer/seller/rental is a separate field, but the manual form does not capture leadType and `app/api/contacts/route.ts:131`/`:205` does not persist it. The checked-in schema defaults to rental (`20260401000002_buyer_leads.sql:4`); live schema not verified. A manually added seller can therefore be misclassified under that schema. Brokerage filters omit Seller entirely.
3. **P1 — Brokerage directory is incomplete after 500 results.** `app/broker/people/broker-people-table.tsx:123` makes one request without offset; `app/api/broker/contacts/route.ts:74` defaults to 500. Counts and Hottest first apply to that window. Agent directory avoids this particular truncation by fetching every 500-row page, but repeats the full fetch on each search/filter change and renders all results. That is a scale/latency risk, not measured production slowness.
4. **P1 — Broker record access is replaced by chat.** `app/broker/people/broker-people-table.tsx:563` constructs a name-based prompt, without stable contact ID, instead of opening a person detail. Duplicate names make this ambiguous; ordinary inspection should not depend on model availability.
5. **P2 — First-screen hierarchy delays actual work.** The mobile directory started roughly 858px below the top in a 844px viewport, even without the production sidebar. Large total count + marketing-style title + pipeline performance sit above search and records. The performance strip measures deal win rate, not lead conversion, and belongs in reporting or a collapsed summary.

Target default: **Needs attention**, with New / Reply needed / Follow-up due / Nurture / All. Buyer, seller and rental are filters, not the primary work queue. Keep advanced filters and saved views under one Filter control. Use a compact People title and Add person action.

Each row: person, relationship type, owner when relevant, reason attention is needed, last meaningful communication, next action and due time, plus explicit Chippi execution status. Call/message/open record are reachable on phone and desktop. Score is secondary and explained; never presented as qualification or permission to send.

## Deals

Keep: pipelines, stage movement, status history, contacts/property links, offers, checklist, contract dates, milestones, documents, commissions, quick panel and existing follow-through mechanisms.

1. **P1 — Risk omits material transaction facts.** `lib/deals/health.ts:47` only accepts stage age, expected close, follow-up and next-action dates. It does not inspect inspectionDeadline, earnestDueAt, milestones or checklist completion. Browser fixture with a yesterday inspection deadline and recent stage change displayed On track. The board can separately show checklist chips, but the risk summary is still inconsistent. Also, a close date overdue by only one or two days can fall through to On track. Today’s overdue times are compared with midnight, not current time.
2. **P1 — Conflicting summaries.** `components/deals/pipeline-summary.tsx:193` handles stuck/closing but not ordinary at-risk narration; “2 active deals. Steady.” appeared alongside “1 At risk” in browser. Avoid global reassurance when one commitment needs attention.
3. **P1 — Won-this-month uses the wrong date.** `components/deals/pipeline-summary.tsx:177` uses expected closeDate, falling back to updatedAt, instead of actual closedAt. Other performance calculations correctly use closedAt (`lib/deal-metrics.ts`). Editing an old win should not move it into this month. Volume, estimated gross commission and realized commission must remain separately labeled.
4. **P1 — Database failures can look like no deals.** Agent SSR loader (`app/s/[slug]/deals/page.tsx:25`) discards returned query errors and falls back to empty arrays. Brokerage page (`app/broker/deals/page.tsx:221`) also ignores deal/stage query errors. Membership lookup defaults to non-strict. A later successful client fetch may recover agent data, but a false-empty first paint is still misleading; brokerage has no equivalent correction here.
5. **P1 — Mobile hides the decision signals.** `components/deals/kanban-board.tsx:324` has a separate compact rendering with title/address/value, omitting desktop health, next action, deadline and checklist. Observed in browser. Mobile must preserve triage information.
6. **P1 — Brokerage drill-down also routes to a name-based chat prompt.** `app/broker/deals/broker-kanban-board.tsx:227`. Its aggregation merges custom stages by label rather than semantic stage kind (`app/broker/deals/page.tsx:55`), and reports active deals only. Brokers need owner, blocked milestone, deadline and direct record access; closed/held visibility can remain a secondary view/report.
7. **P2 — Activity does not always mean client contact.** `lib/deals/next-move.ts:337` treats any ContactActivity timestamp as a touch. A recent internal note can make a silent client appear recently contacted. Prefer verified communication events; label internal activity separately.

Target: compact **Needs attention / Pipeline / Closed** views. Default focus on due/overdue commitments and blockers; keep the board available. Show client + property, owner, stage, next milestone/deadline, blocker, and Chippi progress. One authoritative next-action calculation must feed list, board, Today and agent context. Unknown readiness must be explicit.

## Properties

Keep: photos, specs, manual editing, saved property links, property-linked deals/tours, research sources and fill-empty protection. Photo view is useful; retain it as an option.

1. **P1 — Market ready is not readiness.** `app/s/[slug]/properties/page.tsx:72` counts analyzedAt OR analysis, displayed as Market ready at line 114. `app/api/properties/[id]/analyze/route.ts:92` stamps analyzedAt for no_evidence. No source, pricing confirmation, documents or actual listing readiness is required. Rename to the precise research state immediately; build a real readiness checklist only from explicit criteria.
2. **P1 — Research and authoritative listing facts are not adequately separated.** `lib/property-analysis.ts:271` records optional fieldSources; `:358` fills blank columns from fields without requiring field provenance in the merge input. Existing values are preserved (good), but that also means stale populated price/status are not synchronized. Creation defaults status to active. An MLS number or web research result is not proof of a current licensed MLS feed. These paths do not establish current MLS synchronization.
3. **P1 — Incorrect fractional display.** `components/properties/property-list-grid.tsx:315` rounds every expanded numeric spec. Browser confirmed 2.5ba in the summary and 3bath in expanded specs. Count-up animation also temporarily displays nonfinal prices/specs. Use exact static business facts; preserve decimal bathrooms.
4. **P1 — Inventory cannot be worked efficiently.** Agent grid (`property-list-grid.tsx:42`) has no search, status filter, sort, linked client/deal summary or deadline on cards. Server advice says open the nearest deadline, but the list does not provide one. It mixes active, sold, owned and researched properties. A dense searchable list with optional gallery is the useful default as inventory grows.
5. **P1 — Brokerage pool is a dead end on mobile.** `app/broker/properties/properties-client.tsx:700` renders non-linked rows. Price and assignment are hidden below sm with no mobile alternative (`:758`/`:772`). Browser confirmed only Add property remained actionable. Rename the unassigned badge Available to Unassigned: a sold property currently displays Sold + Available, conflating assignment availability with listing availability.
6. **P2 — Brokerage Properties only shows the brokerage pool.** `app/api/broker/properties/route.ts:80` filters Property.brokerageId. It does not represent all member-owned listings. That is valid for a Pool tab, but incomplete if users read the page as total brokerage inventory. Distinguish pool and shared member inventory under explicit visibility policy.

Target: **My listings / Client shortlists / All saved**, and **Team listings / Unassigned pool / Needs attention** for brokers where supported by explicit data. Rows show address/photo, relationship/purpose, status, price, source + checked time, linked person/deal and next task. Don't infer “my listing” merely because a user saved a property. Put Area IQ/research inside the relevant property context rather than above daily inventory work.

## Data contract to implement before broader automation

| Entity | Canonical facts | Derived facts and boundaries |
| --- | --- | --- |
| People | Stable contact ID; workspace and assignment; relationship type; preferences/budget/timing; communication event direction/channel/delivery status/time; consent/suppression; commitments | Urgency from unanswered inbound + actual deadlines + assignment SLA. Keep readiness score distinct. Unknown last contact is unknown, not zero. |
| Deals | Stable DealContact and Property links; semantic stage; actual contract and milestone dates; owner; completion evidence; closedAt | Risk from unfinished due milestones, missing required data and stage-specific aging. Explain reasons. Estimate GCI separately from transaction value and realized payouts. |
| Properties | Canonical property/listing identity; purpose (listing/shortlist/research); source type + URL/provider ID + observation time; field-level provenance; manually confirmed overrides | Research suggestions distinct from verified fields. Conflicts visible. No evidence != verified; old data != fresh; default active != confirmed live listing. |
| Chippi | Existing run, tool execution, saved authority, provider receipt and outcome IDs | Queued / Running / Waiting on person / Failed / Completed shown on the relevant record. Completed requires evidence; a draft or suggested next move is not delivery. Reuse existing autonomous execution rather than add a second queue. |

Brokerage authority needs explicit reconciliation: People/Deals expand member owner IDs through `lib/brokerage-members.ts:38`, while Properties uses brokerage pool ownership. This may be intentional sharing, but it is not one consistent inventory boundary. Test a user who is an admin/member across two brokerages, removal/offboarding, and empty/error membership responses. Do not infer a confirmed customer-data leak from static inspection; do not treat selected sidebar context alone as proof of correct record scope.

## Ordered correction backlog and acceptance

1. **Truth and reachability first.** Fix wrong bathroom display, no-evidence readiness, lost brokerage pagination, closedAt reporting, false-empty errors and milestone/risk contradictions. Add seller classification to create/edit and brokerage filters. Make all three brokerage record paths ID-bound and usable on mobile.
2. **Compress the working pages.** Compact titles, one relevant attention strip, records above the fold, one filter surface. Default People to attention, Deals to deadlines/blockers with board option, Properties to searchable inventory with gallery option. Move broad analytics/research behind secondary views; preserve their features and existing routes.
3. **Connect existing execution to records.** Derive attention from canonical communications/commitments and expose Chippi status/outcome on each record. Saved autonomous authority still governs sending. Never require routine drafting approval just to make the UI feel safe; escalate only the exception that requires a person.
4. **Validate realistic data and workflows.** 1,200 contacts including a high-priority result past row 500; duplicate names; buyer/seller/rental + past client; overdue reply after a failed send; missed inspection and earnest deadline; close date changed after a win; property no-evidence and stale/conflicting sources; removed brokerage membership; desktop/mobile access. Use synthetic tests first, then authorized live reads/provider canary before release.

Proposed usability acceptance: user can identify the next person to act on, the next deal deadline, and the next listing task without opening chat; primary records/search visible within first mobile screen; direct action or detail within two interactions. Confirm these with agent and brokerage users, not only internal QA.

Success measures: time to first useful action; new-lead first response; overdue commitments; delivered follow-ups vs failed/drafted; missed transaction deadlines; searches that cannot find existing records; correction rate for imported/researched facts. Link these to retention cohorts before claiming churn improvement.

## External calibration

- [Follow Up Boss: Working Your Smart Lists](https://help.followupboss.com/hc/en-us/articles/360034301034-Working-Your-Smart-Lists): current vendor guidance centers daily work on who needs follow-up, with separate nurture/past-client rhythms. It supports action-oriented navigation, not a claim that copying a competitor solves churn.
- [Follow Up Boss: Smart Lists Overview](https://help.followupboss.com/hc/en-us/articles/1500008374882-Smart-Lists-Overview): dynamic communication-based lists and permission-scoped visibility.
- [NAR: 2025 buyer/seller profile takeaways](https://www.nar.realtor/news/economists-outlook/top-10-takeaways-from-nars-2025-profile-of-home-buyers-and-sellers): buyers seek help finding a home, negotiating and understanding the market. Product inference: relationships, transaction execution and credible property facts are the appropriate page outcomes.

No application code, customer records, migrations or deployment changed in this audit. This report is the only repository addition.
