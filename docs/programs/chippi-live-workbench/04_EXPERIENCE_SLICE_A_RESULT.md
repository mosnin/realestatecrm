# Chippi Live Workbench — Experience Slice A Result

Date: 2026-07-29

Evidence scope: local source, local runtime, and automated tests only

Production status: feature off; not deployed

## User-visible result

Chippi now has a feature-gated **Workbench** surface in the existing right panel. A spreadsheet-shaped artifact can open beside the conversation, a user can edit cells, and every save creates a new selectable version instead of overwriting the source. The interface shows what changed and explicitly confirms that the source remains unchanged.

This is the first vertical product slice toward the larger outcome:

1. give Chippi a CSV/XLSX file through chat or Realtime Voice;
2. let Chippi create an editable workbook and a narrative artifact beside the conversation;
3. revise either artifact conversationally;
4. export the finished workbook or document.

Slice A proves the work surface and local versioning contract. Agent ingestion, durable persistence, voice-driven revision, and export are intentionally not claimed yet.

## Product behavior

- Workbench is hidden unless `NEXT_PUBLIC_CHIPPI_WORKBENCH_ENABLED=true`.
- A stale Workbench tab selection self-corrects to Activity while the flag is off.
- The paying-customer panel defaults to an honest empty state; it never receives demo data.
- A development-only route supplies explicit fixture data for product review.
- Empty and unavailable states are explicit and do not imply saved work exists.
- The source snapshot is authoritative even if browser storage contains a forged version with the same ID.
- Saved versions receive monotonic labels, including when a user branches from an older version.
- Duplicate browser-stored version IDs are ignored.
- Save receipts announce the number of changed cells and the save time.
- Spreadsheet inputs and the version selector have accessible labels.

## Existing-product cohesion

The slice extends Chippi’s current right-panel model rather than creating a parallel application:

- existing panel dimensions, border treatment, typography, motion constants, and theme tokens are reused;
- the new tab follows the existing tab motion and horizontal overflow behavior;
- the editor uses the current neutral visual language and compact information density;
- the implementation introduces no new visual dependency or grid package.

## Local runtime evidence

A development server was started with inert, process-local placeholder configuration. No vendor or database calls were required by the preview.

- `/dev/chippi-workbench` returned HTTP 200 and rendered `Northstar pipeline plan` plus `Save version`.
- `/dev/chippi-workbench?state=empty` returned HTTP 200 and rendered `Nothing in the workbench yet`.
- `/dev/chippi-workbench?state=error` returned HTTP 200 and rendered `Workbench is temporarily unavailable`.

The first start attempt failed closed because required environment variables were absent. The preview was then rerun with non-secret local placeholders and succeeded. No `.env` file or credential was created.

## Verification evidence

- Focused Workbench and adjacent Chippi contracts: 24 tests passed.
- Full Vitest regression: 546 files passed; 4,976 tests passed; 1 skipped.
- TypeScript: `tsc --noEmit` passed.
- Targeted ESLint for every changed Workbench file passed.
- Git whitespace validation passed.

## Safety and reversibility

- The feature is off by default.
- No Supabase schema or customer data was changed.
- No external message, agent action, or deployment was triggered.
- Browser persistence is local-only and keyed by artifact ID.
- The source snapshot is never mutated by the workbook helpers.

## Known limits and next acceptance work

This slice is not ready for production activation:

1. versions are browser-local rather than tenant/user-scoped durable records;
2. no Chippi chat or Realtime Voice path creates the artifact yet;
3. no CSV/XLSX import or XLSX/PDF export path is connected;
4. no authenticated visual interaction run has exercised editing, saving, switching, refreshing, or mobile behavior;
5. accessibility has contract-level coverage, not a browser/assistive-technology audit;
6. numeric cells become editable text values in this first grid;
7. the customer panel shows only an empty state until artifact delivery is wired.

The honest next slice is durable, tenant-scoped workbook persistence plus one agent-created CSV/XLSX artifact path. Production enablement remains blocked until that path, export, browser interaction, security, and product-quality gates pass.
