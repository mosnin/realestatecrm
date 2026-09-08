# Collaborative team accounts

Teams are explicit shared workspaces for people and their Chippi agent teams. A team can be sponsored by an existing entitled personal account or brokerage administrative account. Members join with an expiring invitation code. Owners manage roles/removal; admins can invite and inspect membership; members work in the shared Cadre workspace.

## Implemented

- `/teams`: create/join teams, select the sponsoring account, generate a replacement invitation code, inspect members, change member/admin roles, remove members, and open the shared workspace. It uses the existing Chippi theme, sans-serif typography, upright text, and orange actions.
- A Teams entry in the CRM workspace switcher and team accounts in the existing Cadre workspace selector.
- Supabase `CollaborationTeam` and `CollaborationTeamMember` tables, service-only access, foreign keys, role constraints, hashed seven-day invitation codes, and durable membership revocation. A removed member cannot reuse a known invitation code.
- Signed `team` principals retain each human actor's identity for authority checks while resolving one shared Cadre operational workspace across team roles. Personal and brokerage administrative identities remain separate.
- Current membership and the sponsoring account's entitlement are checked on access. Existing background/run/tool authorization rechecks remain in place.
- Team membership does not expose the sponsor's CRM records. Team CRM catalog/workspace requests are empty and direct queries are refused until explicit record-sharing grants are implemented. Team conversations, files, integrations, and computers are collaborative operational resources.
- Cadre's protected Chippi orchestrator already uses team computer mode. Its original delegation, shared files/browser sessions, separate screens, and persistent Fly adapter remain the execution implementation.

## Infrastructure

The dedicated Render PostgreSQL database and runtime service have been created in the confirmed workspace. A separate Fly app and R2 artifact bucket have been created. Cadre's Cloudflare gateway is deployed with separate secrets and an exact configured Fly app restriction. Chippi runtime configuration selects Fly, Pi, Graphile, Postgres realtime, and the model configured on the inspected Cadre runtime. Cadre source pin: `3ead9d8406360edc0fcc87f4dae11fb733d0231c`.

The initial Render service deployment preceded database/provider configuration and failed. A deployment with the saved settings was then triggered. Runtime health, successful real computer use, model delivery, and restart/recovery remain distinct acceptance checks.

## Verification

- Root full test run: 6,707 passed, seven skipped before the final revocation regression and route tests; all fourteen focused team-account tests subsequently passed.
- Existing Workforce scope/proxy/CRM tests plus new team scope and CRM refusal coverage passed.
- Cadre suite: 2,816 passed, 133 skipped. The configured-Fly-host and signed-team-principal tests pass.
- Root TypeScript and lint passed (existing unrelated lint warnings). Cadre core/API/worker TypeScript checks passed. Tenant-scope scanner passed.
- Migration applied to an isolated local PostgreSQL database. SQL checks verified client-role denial, foreign-key enforcement, and rejection of an invalid owner membership role. No production CRM migration was applied.
- The actual TeamsClient was exercised in the internal browser using synthetic API fixtures: team creation, invitation display, membership controls, desktop and 390-pixel mobile layouts. Mobile document width remained 390 pixels. This is component/browser verification, not authenticated hosted acceptance.

## Release gates

The existing Workforce flags remain off. Apply the team migration through the repository's human-gated release workflow. Verify real account entitlement, membership revocation during active work, shared-machine coordination/recovery, model/provider actions and billing before customer exposure. CRM record sharing, native mutation/credit integration, and trusted inbound messaging remain open; preserving Cadre source is not proof of those integrations.
