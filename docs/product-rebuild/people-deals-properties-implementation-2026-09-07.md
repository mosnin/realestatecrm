# People, Deals, Properties implementation — 2026-09-07

Baseline: `mosnin/realestatecrm`, `codex/autonomous-product-rebuild`, `3174aff9d196ff44ca8ad62e66eb0561ef6a6267`. Extends draft PR #612.

## Delivered

- People defaults to attention ordered by existing commitments, delivery state, due follow-ups, and explicitly new leads. Scores remain a secondary sorting option. Reporting is collapsible; search and all-people views remain available. Manual intake requires buyer/seller/rental classification and preserves it during editing. Brokerage People loads every page and includes sellers.
- Existing ClientCommitment and ScheduledMessage records supply follow-through status. A draft is never treated as sent. Missing execution data is surfaced as unavailable without hiding contacts. This adds visibility to the existing autonomous system; it does not introduce another execution engine.
- Deals considers inspection, earnest-money, milestone, and checklist deadlines, respecting recorded checklist completion. Recently overdue closings are flagged. Monthly wins use closedAt. Summary fetch failures display an unavailable state. Mobile cards retain risk and next action. Internal notes no longer count as client contact.
- Brokerage people, deals, and pool properties open exact ID-bound record pages. Every request checks current brokerage membership and scopes the record query. Detail pages are read-only; existing assignment and management flows remain.
- Properties defaults to a searchable list, preserving the expandable gallery. Prices and fractional specifications render directly. Saved research is not called market readiness; automatic blank-field enrichment requires attribution to a consulted source. Existing manual facts take precedence. Linked-deal summaries use checklist completion context. Brokerage pool price and assignment controls remain visible on mobile, with search and assignment filtering.
- Public website, existing data, CRM architecture, and Cadre submodule remain unchanged. No migrations or production flags were applied.

## Verification

- Full Vitest run: 775 files passed; 6,679 tests passed, 7 skipped. Subsequent focused run: 30 tests passed for pagination, commitment receipts, deadlines, and rendered working pages.
- TypeScript and Next lint checked; lint retains repository warnings.
- Node contract suite: 52 passed.
- Tenant scope scanner: 956 files, 127 registered tables, no unscoped call sites reported. This is a static check, not proof of production authorization.
- Exact-record access tests cover foreign records and membership failure. Source-only UI assertions for replaced headings/chat navigation were replaced with rendered behavior checks.
- Browser QA used actual components in an isolated synthetic workspace, not a signed-in customer environment. At 390px: People records surfaced near the first screen; Deals retained deadline reasons; property search filtered correctly and displayed 2.5 bathrooms/$550,000; broker price/assignment controls were visible. No customer messages or mutations were made.

## Remaining release and product gates

- Production build and authenticated agent/team/brokerage workflows need provider verification before release. Earlier staging provisioning failure is not resolved by these code changes.
- Brokerage pool inventory is still a pool, not a union of every member's inventory. Member-space sharing semantics are unchanged and need explicit multi-brokerage policy review.
- Large People directories are fetched in pages but still rendered as a complete result; server-driven search/windowing remains a performance follow-up. The follow-up review removed the deal/checklist caps from agent SSR, the stages API, and brokerage board/detail queries.
- No native MLS freshness guarantee or new listing-versus-buyer-shortlist data model is claimed. Web research remains supplementary evidence.
- Inbound unanswered-reply prioritization and broader automation reliability need separate end-to-end acceptance. Live Workforce/VM and Convex release gates from PR #612 remain in force.

## Second-review corrections

- Pipeline summary state is keyed by workspace and pipeline. Component tests exercise A → B → A and a delayed B response after returning to A.
- Stuck severity is evaluated before deadline warnings; the reason retains the contract deadline. Both stage-stalled and overdue-closing regressions are covered.
- Brokerage person detail loads the same commitment/delivery enrichment as the directory, including unavailable data. Rendered tests cover failed delivery and unavailable execution state.
- Agent initial pipeline, stages API, brokerage board, and brokerage deal detail read all deal/checklist pages with deterministic ordering. The stages API batches relation IDs in groups of 100. A route test exercises 1,101 deals and 1,101 checklist rows including last-page completion evidence; another verifies a later-page failure returns 500.
- These fixes require no schema changes or production mutations. Provider deployment and authenticated acceptance remain separate gates.

Second-review validation: 779 Vitest files passed; 6,688 tests passed and 7 skipped. TypeScript, lint (existing warnings), tenant scope scanner and 52 script contracts passed. The delayed pipeline-response regression also passed separately.
