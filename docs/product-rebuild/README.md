# Chippi: a daily desk that does the work

Baseline: `mosnin/realestatecrm` main at `75113c0d68f40df0999d2dd470b831ffde3c3665`. Implementation branch: `codex/autonomous-product-rebuild`.

This rebuild focuses the product on responding to leads, following up, keeping appointments and deals moving, and giving brokerages clear ownership. It preserves the existing CRM, customer records, permissions and provider connections. It does not establish that churn has fallen or that every production path works.

## The daily experience

- **Agents and brokerage members:** Today shows what needs attention, work Chippi completed, upcoming tours, and a compact deal summary. The command box starts a real task. The previous oversized greeting, atmosphere, and competing KPI surfaces are removed.
- **Brokerage owners/admins:** Today shows unassigned leads, missed first responses, recent completed work, and team ownership. Forecasts and detailed reports remain available separately.
- **Navigation:** Today, People, Deals and Calendar are the main agent destinations. Brokerage navigation prioritizes Today, Leads, Team and Deals. Secondary capabilities remain under More. Mobile keeps visible labels and Today stays accessible.
- **First use:** create the workspace, then connect real apps. The default agent signup no longer runs a ten-stage sample demonstration or silently seeds a fake completed result. Existing broker setup stays role-specific.
- **Sending policies:** first responses, follow-up sequences, saved automations and periodic background review are explained together. First-response sending is moved out of Notifications. Sequence sending can finally be configured through the API and UI. The budget is a secondary control.
- **One task surface:** new agent tasks start with Work capability, including the New conversation action. The Chat/Work chooser is removed. Existing conversations keep their persisted mode. A task still offers Review changes or Run requested actions.

## Autonomy and reliability repairs

| Problem | New behavior |
|---|---|
| CRM questions, attachments and follow-ups lose tools depending on wording | Only exact greetings/empty turns take the lightweight path; other workspace turns keep tool capability. |
| Relaxed model schemas reach handlers without original validation | Arguments are coerced and validated against the original Zod schema before execution. Aborted turns stop at the boundary. |
| Automatic `run_chippi` workflow steps pause as review work | Saved automatic workflows grant the exact native tools implied by the owner's stored instruction. Expanded event data cannot grant extra authority. Destructive checkpoints remain. |
| New scheduled sends can contain instructions such as “ask them about…” | Explicit instruction-mode rows are composed into finished content after claiming the row. Composition failure prevents delivery. Historical literal rows retain their meaning. |
| Drafts from headless runs disappear with the model response | Draft email/SMS results are persisted to the real review inbox. A persistence failure is an error. Draft completion requires a saved-draft outcome. |
| Concurrent draft dispatches duplicate work | Drafts use the same atomic claim boundary as sends. Losing a claim does not run the model or send. |
| A queued message ignores later permission changes | Workflow steps re-check whether the workflow is enabled and whether sending remains authorized. Sequence sends re-check the sequence sending policy. Unavailable permission reads defer execution. |
| A failed/unacknowledged Run now request reports success | A durable queue receipt is labeled queued. Executor rejection is surfaced. Missing acknowledgement stays unconfirmed and is not automatically retried. Queued wakeups are retained after the HTTP response. |
| Successful execution does not feed activation/Today | Actual native tool outcomes feed `TelemetryEvent` and `AgentActivityLog`; drafts, errors and uncertain outcomes remain distinct. First-action events use a deterministic per-space identity. Writes are retained after the request. Tour booking uses its persisted tour receipt. |
| Today turns read failures into “nothing to do” | Failed sources are marked unavailable. Team membership reads support strict failure handling. Unaffected agent sections remain usable. |
| Today's window uses the server's time zone | Follow-ups and tours use the workspace's calendar day, including DST boundaries. |
| Invitation routing swallows the redirect exception | The invitation destination is resolved before redirecting outside the catch. |
| Subscription snapshots are labeled churn | Billing snapshots are labeled canceled share/current subscription status. A separate cohort report measures repeat completed work, with mature denominators and explicit limits. |
| Pricing contradicts the implemented free entry offer | English, Spanish and Russian describe 100 signup credits, the paid card trial, varying task costs and 30-day monthly-credit rollover. |

Existing customer opt-outs are not bulk-enabled. Scheduled sends still use tenant checks, messaging consent/suppression, delivery guards and the existing scheduler. No second cron system is enabled. Unknown delivery is not automatically retried.

Legacy review routines remain available as **Scheduled reviews**. They are not silently converted into sending authorizations. New scheduled automatic work belongs in the automation engine. This distinction matters: this change makes automatic workflows execute, but does not claim that the legacy Modal review runtime has become an unrestricted autonomous executor.

## Required schema repair

`20260520000000_drop_dead_agent_settings_columns.sql` removed `AgentSettings.autonomyLevel`. The later sequence engine still reads it, and a read error falls back to drafting. The new migration, `20260918000000_restore_sequence_sending_policy.sql`, restores the column without overwriting any existing value. Existing spaces without the column and newly inserted settings default to `draft_required` until the owner changes the policy.

The migration passed on an isolated PostgreSQL 18.4 cluster with a minimal fixture representing the table after column removal: initial application, repeat application, preserving an explicit autonomous value, preserving paused review, the new-row default, and rejecting invalid policy values. See [migration-verification.json](migration-verification.json).

**Apply the additive migration to the target database before deploying this application revision.** It has not been applied to staging or production. Follow the repository's approved [migration procedure](../RELEASE.md); application deployment alone does not apply SQL.

## Design contract and fidelity ledger

[today-concept.png](today-concept.png) is the generated design reference, **not a screenshot of the application**. The implementation uses native components and real records.

| Reference point | Implemented in source | Rendered acceptance |
|---|---|---|
| Cool gray sidebar and white main surface | Shared application tokens and dashboard canvas | Outstanding |
| Restrained blue navigation and actions | Brand/action tokens, Today navigation | Outstanding |
| Upright system sans-serif | Title/serif compatibility tokens resolve to sans; global italic override; italic editor controls removed | Outstanding |
| Dominant attention/work column | Shared agent/member Today grid | Outstanding |
| Quieter appointments/deals column | Real tours and deal summary, unavailable states | Outstanding |
| Compact brokerage operational desk | Ownership, response gaps and completed work | Outstanding |
| Mobile follows the same priorities | Stacked grid and five labeled navigation destinations | Outstanding |
| Real task entry rather than a sample result | Existing Work handoff and execution lifecycle | Outstanding |

Local browser control exposed no browser in this session. A temporary, development-only fixture route returned HTTP 200 and was removed before the production build. Server-render tests cover Today navigation, section content and failure states. They do not substitute for authenticated desktop/mobile visual inspection.

## Verification and release boundary

Local checks passed: **6,566 tests in 752 files**, typecheck, lint (with warnings), the Next.js production build, 52 script contract tests, and the tenant-scope audit. Seven live-model eval cases are skipped. See [verification.json](verification.json) for the results and their scope. Tests mock provider calls; the optional live-model eval cases remain skipped. The existing public-browser CI job now fails normally rather than soft-failing. Agent Evals uses the primary TS/OpenRouter runtime and the correct secret, while retaining its explicit enable/manual-run condition. Neither is authenticated provider acceptance.

Before a production release, exercise a controlled staging workspace through:

1. Sign up or accept an invitation; connect one real inbox and calendar.
2. Receive a test lead and execute an authorized first response. Check the actual provider acknowledgement and stored transcript.
3. Enable one automatic follow-up, let its scheduled step run, and check its receipt. Pause another before it is due and verify no send occurs.
4. Book a tour, reload the calendar, and verify the reminder on a controlled recipient.
5. Disconnect an integration, interrupt/Stop a turn, and reopen the task. Verify failures and unfinished work remain visible without duplicate sends.
6. Inspect Today, the task composer, sending policies and brokerage/member navigation at desktop and mobile sizes.

Production provider health, schema state, scheduler delivery, live checkout/seat reconciliation and actual retention improvement remain unverified in this change. No customer message was sent and no production deployment or database mutation was performed during implementation.
