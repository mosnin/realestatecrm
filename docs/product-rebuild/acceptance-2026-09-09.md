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

## Shared-record draft conflicts

The preceding revision `a11ccb9c2e63a11d68d87961edec111b252e911d` passed all
GitHub jobs and the main preview deployment. The separate staging project
continued to fail provisioning; no production activation is implied.

Shared-record editing now retains an unsaved draft when its source baseline
changes. A comparison lists only fields the user edited. Fields also changed
on the server keep the current value by default; the user can explicitly choose
the draft value. Applying the selection preserves unrelated teammate changes,
uses the current record revision, and still requires Save. Keeping the current
record discards the stale draft without a write. Unresolved recovery survives
repeated reloads in the same actor/team tab. This opt-in recovery behavior is
currently used by the shared-record editor; other CRM forms retain their
previous behavior.

A refreshed read-only grant now removes its open editor. The server's atomic
permission checks remain authoritative; the UI no longer invites an edit that
has already lost permission.

Validation: TypeScript and lint pass; 811 files and 6,897 tests pass with seven
skipped. All 55 script checks and the tenant scanner pass. Behavioral tests
cover overlapping/non-overlapping changes, repeated reloads, explicit discard,
latest-revision payloads and revoked editor visibility. A temporary Chrome guest
window exercised the actual component and application styles with synthetic
data: choose the conflicting name, preserve the newer email, then save a payload
containing only the selected name change. The window and fixture server were
closed. This is browser component acceptance, not a live multi-user database
write. No migration or flag change was introduced in this follow-up.

## Team-work service validation

Team-work services now validate creation/update input and pagination themselves,
and recheck the actor's active account before reads, attention counts, creation
or transitions. This protects direct/internal callers as well as the already
validated HTTP routes. Focused tests cover malformed input, invalid pages and
offboarded actors, alongside existing role, scope, version and retry cases.
No schema, UI, provider configuration or customer data change is required.

The full local TypeScript/lint/web gate passes: 811 files, 6,900 passing tests
and seven skipped. All 55 script checks and the tenant scanner pass. The prior
revision's GitHub checks and main preview passed; the separate staging project
still fails provisioning. This follow-up does not resolve the remaining live
provider, activation, escalation-delivery or Mac release gates.

## Recovery and theme startup stability

The recovery request referred to an older checkpoint. Accountable Chippi team
actions and shared-record draft conflicts were already implemented; the newest
local batch is the reference-inspired light/dark dashboard candidate.

ThemeProvider now keeps its provider tree stable through hydration rather than
remounting the application when the preference loads. It validates stored values,
tolerates denied storage reads/writes, and retains an explicit session choice
when persistence is unavailable. This changes startup behavior, not public-site
styling. Four behavioral tests cover child mount count, retained draft state,
OS versus explicit preferences, invalid values, and restricted storage.

The full working-tree gate passes: TypeScript, lint (existing warnings), and
813 files / 6,908 tests, with seven skipped. This includes the four uncommitted
dashboard-shell tests from the separate design candidate. The theme fix is
isolated from those pending layout/palette changes.

Browser access recovered for the root session. Actual shell/control components
rendered with synthetic People records at desktop and mobile widths, including
both appearances, dark modal fields, mobile navigation, empty tools search, and
Escape focus restoration. Tablet DOM width matched its viewport. These are
component checks, not authenticated CRM/provider or multi-role acceptance. The
independent reviewer still cannot access a browser in its tool context; the
broader redesign remains a local candidate. Off-session escalation delivery,
hosted/provider acceptance and Mac release gates remain open. No migration,
production activation, provider send, or production CRM write occurred.
