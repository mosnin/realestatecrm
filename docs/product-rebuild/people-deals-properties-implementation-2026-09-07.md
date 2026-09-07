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
- Large People directories are fetched in pages but still rendered as a complete result; server-driven search/windowing remains a performance follow-up. Some deal queries retain existing provider caps.
- No native MLS freshness guarantee or new listing-versus-buyer-shortlist data model is claimed. Web research remains supplementary evidence.
- Inbound unanswered-reply prioritization and broader automation reliability need separate end-to-end acceptance. Live Workforce/VM and Convex release gates from PR #612 remain in force.
