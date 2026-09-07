# Remaining-surface execution receipt — September 7, 2026

Repository: `mosnin/realestatecrm`, branch `codex/autonomous-product-rebuild`.
Baseline: `cc8ecd743f50b93099e8b1aa7357226075394811`. Extends draft PR #612.

This sweep addresses verified defects across the remaining product surfaces. It is not blanket acceptance of every customer workflow or a claim of reduced churn.

| Area | Implemented or checked | Remaining acceptance |
| --- | --- | --- |
| Chippi, Today, Follow-through | Open commitments read every page and batch delivery receipts; users can reach work beyond row 20. Coverage failures no longer suppress fetched commitments. Stale requests cannot replace newer desk data. Briefing errors are explicit and retryable. Existing automatic-dispatch and Workforce authority tests rerun in the full suite. | Actual scheduled work, provider receipts, stop/steer and recovery in authenticated hosted workspaces. The briefing component also has no current route caller; the active Today dashboard already has unavailable-source handling. |
| Mailbox, calls, messaging | Gmail provider refusal returns 502 instead of an empty inbox. Search response ordering uses a request version, including loading-state cleanup. Outlook read limitations are stated. Mailbox heading simplified. Existing messaging and call tests rerun. | Live inbound/reply/attachment/call paths, unanswered-reply prioritization and actual delivery. Outlook reading remains unavailable. |
| Calendar and showings | Provider errors stay errors and are not cached as no events. Cache is bound to the current connection ID. Unsupported read providers return an explicit unavailable response. Existing date, availability, booking and synchronization tests rerun. | Live provider write/reschedule/reminder verification; calendar list remains a 30-day bounded view with an existing 250-event provider request. No Outlook parity claim. |
| Brokerage/team operations | Strict membership reads for team and analytics views. Team load/activity and analytics queries now paginate and fail on query errors instead of showing zero performance. Existing offboarding and selected-workspace/Workforce scope tests rerun. | Two real organizations with owner/admin/member switching and offboarding during queued work. Independent team-subgroup permissions remain a separate product model decision. |
| Integrations and onboarding | Missing provider checks and native credentials alone return `unknown`, rendered as Not verified. Only returned active provider accounts get the verified connection status. Existing onboarding tests rerun. | Actual OAuth and first useful task per supported provider. Account status is not proof every provider action works. No changes to the unused legacy onboarding checklist. |
| Documents, offers, commissions, analytics | All document list and offer list pages fetched. Document refresh clears recovered errors. Offers fail visibly, refresh server summaries after mutations, and roll back only the failed offer. YTD commissions use actual close timestamps and identify missing dates; deal/split/ledger totals read all pages. Documents and Offers headings simplified. | Authenticated document save/download and concurrent offer flows; customer-ledger reconciliation and payout acceptance. Commission ledger fallback names still depend on joined reference availability. |
| Studio, Mac, Workforce | Studio has a retry control for initial library failure; existing tools retained. Mac Swift package/navigation tests pass. Root Workforce bridge/authority/catalog tests rerun; pinned Cadre source unchanged. | Live generation/scheduling and file delivery. Mac OAuth/session/download/voice acceptance, Developer ID signing and notarization. Workforce managed VM, provider, gateway and desktop-release gates in workforce-implementation.md remain. |

## Verification

- Full web suite: 783 files passed, 6,696 tests passed, 7 skipped. Separate follow-through pagination and commission period run: two tests passed, including 501 open commitments and receipt batches no larger than 100.
- TypeScript, Next lint (existing repository warnings), tenant scanner (956 files/127 tables) and 52 script contracts passed.
- Mac: `swift test` rebuilt and passed all three XCTest navigation-policy tests. This is not a notarized distribution artifact.
- Browser: initial named-browser lookup failed; browser inventory exposed Chrome ID 1 and recovery succeeded. Actual components in an isolated synthetic fixture showed commitments during coverage outage, Show more reaching record 25, a Studio retry control, a successful empty library after the fixture recovered, and the explicit briefing outage state. Inspected 390×844 mobile and desktop; viewport reset. No app errors observed in the inspected console entries; warnings concerned the preview domain configuration and an unrelated browser extension.
- No customer messages, production data mutations, schema migrations, marketing changes, or Workforce activation were performed.

## Release evidence

Vercel deployment `dpl_B7THfYHsJ6SZN9XQc8h4KdvXFVSs`, for the previous baseline, was inspected through the Vercel connector: `BUILD_FAILED`, `Resource provisioning failed`, before a useful build log. The production project's preview-ignore rule also remains. This patch does not resolve that infrastructure gate. Keep PR #612 draft until the accepted revision is built and authenticated provider workflows pass.
