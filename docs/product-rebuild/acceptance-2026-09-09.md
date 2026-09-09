# Team follow-through and agent actions

This follow-up extends the existing team workspace without replacing the CRM
or its logged-out website.

- Team membership reads and role changes revalidate the sponsoring account.
  Team cards exclude accounts that fail current access checks. A failed overdue
  counter is shown as unavailable rather than zero.
- Managers see a deadline-driven attention link for all open overdue team work;
  members see their own overdue count. The list refreshes every minute while
  visible and when returning to the tab. Completed/cancelled items leave the
  count. This is in-app manager attention, not off-session email/push delivery.
- New assignments recover within the authenticated actor/team browser tab.
  A stable request UUID reconciles a lost response against the saved task;
  foreign actor/team IDs and conflicting payloads cannot reuse that identity.
- Chippi has a separate non-read-only team action tool. Its catalog describes
  create/update work and, when enabled, explicitly delegated record editing.
  The server binds the authenticated actor and team, uses the same role and
  version checks as the UI, and audits the returned item or edit receipt.
  Cancellation is checked before dispatch. No simulated success is returned.
- Cadre only advertises the tool for team authority when explicitly enabled;
  standalone and personal/brokerage executions retain their existing tools.
  Signed bridge requests bind the exact payload and reauthorize current access.

Validation: TypeScript and lint pass. The complete app suite passes 811 files,
6,893 tests, with seven skipped. Cadre adapter typechecking passes; its adapter
suite passes 116 files and 1,219 tests, with three files/nine tests skipped.
The 55 script checks pass; tenant scanning covers 972 files and 131 tables.
Browser inspection used the actual Teams component and application styles with
synthetic API data in a temporary Chrome guest window: the manager attention
link, existing orange/sans-serif styling, and destination team-work route were
verified. The guest window and local fixture server were closed. This does not
prove hosted multi-user or provider execution.

Release requires the existing team migrations and flags. Enable
`CHIPPI_TEAM_ACTIONS_ENABLED` on both Chippi and the Workforce server after
acceptance; delegated edits additionally require their migration and flag.
No production migration, live CRM edit, external communication or flag change
was performed here. These flags default off and are not evidence of activation.

Remaining release gates: populated hosted workflows across solo agents, team
members/managers and brokerage admins; provider-backed autonomous completion
and recovery; the separate staging project's provisioning failure; and an
authenticated, Developer-ID-signed/notarized Mac release. Off-session team
escalation delivery and conflict-aware recovery against changed form baselines
remain implementation work. Retention improvement needs actual customer data.

A final review corrected the brokerage error-screen Reload link to retain the
selected brokerage query parameter. Its rendered-page regression verifies the
exact scoped destination, so changing the default selection in another tab
cannot retarget recovery. The full local app gate was repeated after this fix.
