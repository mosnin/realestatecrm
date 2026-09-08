# Workspace separation implementation

Baseline: `mosnin/realestatecrm` at `e323d312e6b9c8c3a171fcd643989223b14db980`, Cadre at `b10afc64de0b23580948998aebed782f56b849de`.

Implemented after the research findings:

- Named, searchable Agent workspace / Teams / Brokerages picker. Each entry shows the person's role. Active brokerage identity is passed from the resolved server context rather than inferred from list position in the active shell.
- The switcher sits at the top of the desktop sidebar and beneath the mobile/dock header. Team memberships are loaded on the server with a visible failure state, and only navigation metadata reaches the client.
- Team creation and brokerage creation have separate, correctly labeled destinations. The brokerage document title and navigation grouping no longer call the brokerage a team.
- Equivalent People, Deals, Properties, and Messages list destinations are preserved when switching contexts. Record IDs, query parameters, and fragments are not copied. The brokerage switch endpoint independently checks membership and its role-specific redirect allowlist. Unknown destinations use the existing default.
- Cross-workspace navigation reloads the document. The current shell also has a workspace-specific React key. These measures do not solve cross-tab cookie selection or unsaved-draft handling.
- CRM/Workforce view selection is restored in the actual Sicarii shell. It remains hidden for brokerage members who do not have administrative Workforce authority.
- Cadre's hosted selector groups workspace types, and team workspaces link to team management instead of presenting the team directory as a CRM tab. Existing Cadre agent/team/computer infrastructure is retained.
- Existing CRM records, permissions, memberships, billing, public website, and feature flags are preserved. There is no production database migration in this change.

Validation: full local CRM suite passed 6,727 tests with seven skipped before the last eight route/directory regressions; those eight passed separately. Root TypeScript and lint passed (existing warnings); tenant scanner passed. All 22 Cadre package checks and the hosted web build passed. Three hosted navigation unit tests passed. Desktop and mobile actual-component browser fixtures exercised grouped entries, long names, exact current identity with non-first active brokerage, search/empty results, Escape/focus return, and 390-pixel layout with no horizontal overflow. Fixture users/data were synthetic; this is not authenticated production acceptance. CI adds desktop/mobile hosted-team selection and screenshot coverage.

Remaining architecture work: URL/request-bound brokerage identity for independent tabs; workspace-scoped unsaved draft behavior; explicit team record sharing; team handoff/ownership queues on CRM data; real-account role/revocation acceptance and existing Workforce billing/provider gates. The dashboard-responsibility table in decision.md describes the target, not three newly implemented complete dashboard experiences.

Evidence review: `review-v2.md` and `independent-review-v2.json` retain the independent assessment. The packet remains needs_evidence because freshness and discovery/coverage are limited. The citation gap in the original claim c5 was corrected in v2. No churn, usability, or security certification is claimed.

## Solo workspace follow-through

A single known workspace now shows a static identity in the CRM shell. A second membership restores the existing grouped picker; directory failures keep the picker available instead of asserting that the account is solo. Workspace settings expose optional team creation/join and brokerage setup. Team links select the matching existing form directly. Personal onboarding finishes at Today.

Post-login routing resolves personal and brokerage capabilities together and honors explicit brokerage intent. A brokerage role no longer steals the personal landing destination. Invited admins without personal workspaces retain brokerage access. Failed directory queries render a retry state rather than sending customers into setup. Existing personal workspaces also bypass repeated setup regardless of brokerage membership. No personal records are migrated or shared by these navigation changes. Personal Workforce remains independent of human-team membership, behind its existing deployment gates.

Validation: 791 test files passed; 6,746 tests passed, seven skipped. TypeScript passed. Lint passed with existing warnings. Tenant scanner found no unscoped call sites across 961 files and 127 registered tables. Actual-component Chrome fixtures verified static solo identity, membership-driven picker appearance, grouped team access, Escape/focus restoration, settings links, and a 390px mobile layout with no horizontal overflow. Fixture memberships were synthetic; authenticated provisioning and production activation were not exercised. No migrations or provider changes were made.

The architecture gaps listed above remain outstanding; this addition completes the solo navigation and landing behavior, not team CRM sharing or production Workforce rollout.
