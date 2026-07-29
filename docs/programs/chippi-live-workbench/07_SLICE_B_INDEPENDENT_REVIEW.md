# Chippi Live Workbench — Slice B Independent Review

Date: 2026-07-29
Accepted commit: `7eeae7c4`
Decision: **ACCEPT for a feature-off local commit; REJECT for activation**

## Feedback-loop record

The implementer did not certify its own work. Each revision was inspected by the
orchestrator and then challenged by a separate reviewer.

### Review 1 — rejected

The reviewer found:

- non-atomic saves and current-pointer races;
- incomplete feature gating;
- approval not bound to the current turn;
- workspace kill-switch gaps;
- unsafe payload/editor bounds;
- ordinary spreadsheet analysis being diverted from Modal;
- dishonest saved-version receipts.

### Review 2 — rejected

After the first rework, the reviewer found:

- resume authority reconstructed from the model-selected attachment;
- successful database saves displayed as failures because the timestamp was
  missing;
- disable-after-pause bypass;
- Modal-started Workbench approvals unable to resume;
- history responses that could exceed 40 MiB;
- tenant existence-oracle and feature-off listing gaps.

The orchestrator independently found and prevented an invalid PostgreSQL
`CREATE OR REPLACE FUNCTION` return-shape migration.

### Review 3 — rejected

After the second rework, the reviewer found:

- a saved version missing from the selector until page refresh;
- arbitrary history metadata recreating an unbounded payload;
- a false “history incomplete” signal at exactly 20 versions;
- ambiguous legacy `.xls` and multi-sheet behavior.

### Review 4 — accepted locally

The final review verified:

- selector merging of fixture, server-history, loaded, and newly saved versions;
- 21-row sentinel history query returning 20 metadata-only rows;
- allowlisted and byte-bounded PATCH metadata;
- exact attachment ID and filename binding through pause/resume;
- narrow Modal-runtime continuation for the approved Workbench call;
- Workbench and workspace disable-after-pause enforcement;
- atomic, row-locked, service-role-only database functions;
- honest `.xls` rejection and first-sheet disclosure.

The reviewer ran 63 focused tests, TypeScript, and diff validation without
editing any source or database state.

## Remaining activation blockers

1. Authenticated staging browser flow:
   upload → approval → resume → open → edit → save → reselect → export.
2. Real CSV, TSV, genuine XLSX, and multi-sheet XLSX fixtures.
3. Workbench disable and workspace disable after a pending approval.
4. 20/21-version history behavior in the real UI.
5. Signed-storage download failures and retry behavior.
6. Narrow-screen interaction and Chrome/Safari evidence.
7. Negated intent UX such as “do not open this CSV.”

Until those pass, the feature flag remains off.
