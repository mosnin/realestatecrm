# Team record sharing

Team membership grants access to operational collaboration, not to a member's entire CRM. The new `/teams/[teamId]/records` page lets a team member explicitly share selected records from a workspace they own. The original records remain in that workspace; grants reference them rather than copying them.

The shared view and Chippi use the same allowlist:

| Record | Shared fields |
| --- | --- |
| Person | Name, email, phone, buyer/seller/rental type |
| Deal | Title, status, value, close date |
| Property | Address, city, listing status, list price, bedrooms, bathrooms |

Notes, messages, application details, files, commissions, and linked records are excluded. Brokerage-owned contacts and properties cannot be shared through an agent's personal workspace, even when assigned to that agent. Brokerage pool sharing and delegated edits are not implemented by this change.

Each read checks current team access, the active grant, the grantor's account and membership, and continued ownership of the source workspace. A missing record is omitted. A source or membership lookup error fails the request instead of reporting a successful empty list. Grants are paginated in batches of 25. The sharer or team owner can stop sharing; team admins cannot revoke another member's grant. Successful shares and revocations emit audit events.

Chippi discovers a team-specific `list_shared_records` query through its existing CRM catalog. The query uses the verified team and actor, validates arguments, and cannot invoke general CRM tools, select a private workspace, send messages, or edit records. Shared-record access does not itself authorize any downstream delivery. Existing separately authorized tools and autonomy policies remain in force.

## Rollout

The code is off by default. Both `CHIPPI_WORKFORCE_ENABLED=true` and the new server-side `CHIPPI_TEAM_CRM_ENABLED=true` are required for the page/API; the latter also enables the team CRM catalog. Do not enable the flag before the schema and account acceptance checks are complete.

1. Review and merge the intended application revision and append-only migration `supabase/migrations/20260921000000_team_record_sharing.sql`.
2. Use the existing database migration workflow in `docs/RELEASE.md`, including its dry run and human approval. This migration creates `TeamRecordGrant` with explicit foreign keys, uniqueness, record-kind restrictions, RLS, and service-role-only grants. No existing customer record is moved or shared.
3. With a test account, enable team sharing in a non-production deployment and verify owner/member/removed-member flows, each record type, failed saves, and revocation against the real auth/database path. Verify the team's actual Chippi runtime can discover and call the shared reader.
4. Enable the server flag in the intended deployment only after those checks pass. Roll back access by disabling `CHIPPI_TEAM_CRM_ENABLED`; do not delete customer grants to roll back application behavior.

Local acceptance used mocked authenticated contexts, the actual UI with synthetic browser responses, and an isolated Postgres 18 database with minimal parent tables. SQL checks applied the migration twice and verified uniqueness, invalid-kind rejection, role grants, revocation, and source-delete cascade. These checks are not proof that production schema or provider execution is ready. The migration and flag have not been applied to production by this change.

Validation for this revision: 799 test files passed, 6,809 tests passed and seven skipped; TypeScript and lint passed (existing warnings); tenant scanner passed across 964 files and 128 registered tables; 55 script contract tests passed. Browser fixtures exercised denied save, successful sharing, revocation, and 390px layout without horizontal overflow.
