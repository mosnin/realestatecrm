# Chippi Live Workbench — Slice B Result

Date: 2026-07-29
Commit: `7eeae7c4`
Disposition: **Local engineering gate passed; activation gate remains closed**

## Product outcome

Chippi can now turn a spreadsheet uploaded in the current chat turn into an
editable, versioned Workbench artifact after an explicit user approval.

This is not a “Draft Mode.” It is a live work surface connected to the agent
conversation:

1. The user uploads a CSV, TSV, or XLSX file.
2. The user explicitly asks Chippi to open or edit it.
3. Chippi shows an approval naming the exact file and stable attachment ID.
4. Approval resumes even when the broader agent runtime is Modal.
5. The Workbench opens in the existing right panel.
6. Each save creates an immutable server version.
7. Source and saved versions can be selected without refreshing.
8. The selected version exports as a real XLSX.

The feature is disabled by default through
`NEXT_PUBLIC_CHIPPI_WORKBENCH_ENABLED=false`.

## Accepted behavior

- Exact-turn attachment authority survives pause and resume independently of
  model-supplied tool arguments.
- A stale approval cannot execute after the workspace or Workbench is disabled.
- Artifact creation and version append are atomic database functions.
- Concurrent saves receive monotonic version numbers and update the current
  pointer to the latest version.
- Failed appends do not leave a partial version or move the current pointer.
- Workbook reads, writes, history, lazy version fetches, and downloads are
  tenant-scoped.
- Workbook history returns 20 metadata-only entries and discloses real
  overflow.
- Workbook content, rows, columns, cells, source bytes, and PATCH metadata are
  bounded.
- Legacy `.xls` is rejected with an honest conversion instruction.
- Multi-sheet XLSX imports disclose that the first sheet is being shown.
- Ordinary requests such as “summarize this CSV” keep the normal agent/Modal
  route; only explicit open/edit intent selects the Workbench tool.

## Verification

### Exact committed source

- 63 focused tests passed across 10 files.
- TypeScript `--noEmit` passed.
- Diff whitespace validation passed.
- Full clean-commit suite passed:
  - 548 test files
  - 5,000 tests passed
  - 1 test skipped

### Chippi staging database

Applied only to `chippistaging`; production was not touched.

- Existing workbook artifact-type constraint verified.
- Existing `(artifactId, versionNumber)` uniqueness prerequisite verified.
- Atomic create/append functions applied.
- Paused-run attachment-manifest column applied.
- Functions verified as `SECURITY INVOKER`.
- `service_role` can execute; `authenticated`, `anon`, and `PUBLIC` cannot.
- Two simultaneous appends returned versions 2 and 3.
- Current pointer resolved to version 3.
- A forced failed append preserved both version count and current pointer.
- Paused-run manifest defaulted to an empty JSON array.
- Every temporary test user, space, paused run, artifact, and version was
  removed; cleanup counts were all zero.

## Explicitly not claimed

- No Vercel deployment was created.
- No production database migration was applied.
- No production environment flag was enabled.
- No customer data was read or changed.
- No authenticated browser vertical has passed yet.
- No Chrome/Safari, narrow-screen, signed-storage-failure, or disable-after-pause
  browser evidence exists yet.

## Next product slice

After staged browser acceptance, the next feature slice should make Chippi able
to transform a workbook through conversation—clean columns, calculate fields,
build a comp or pipeline forecast, preview the proposed changes, and save a new
version only after approval. That is the agent-native value layer; the current
slice establishes the reliable work surface it needs.
