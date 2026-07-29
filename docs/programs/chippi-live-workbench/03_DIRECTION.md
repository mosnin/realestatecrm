# Chippi Live Workbench — Product Direction

Date: 2026-07-29  
Program evidence type: direction

## Program outcome

Deliver Chippi Live Workbench: from chat or Realtime Voice, turn an uploaded
brokerage spreadsheet into editable spreadsheet and narrative artifacts in the
existing right panel, keep revisions linked to the conversation, and export
the finished work.

## Acceptance journey

1. The user uploads a CSV or XLSX production workbook.
2. The user says or types: “Clean this, calculate conversion by source and
   agent, forecast next quarter, and build the presentation for Friday.”
3. Chippi creates a visible Work Session with bounded steps and progress.
4. A versioned workbook and narrative document appear in the right panel.
5. The user edits a value and saves a new version.
6. The user asks Chippi to revise the analysis; the change is applied to the
   same artifact family with an inspectable revision receipt.
7. The user exports XLSX and PDF.

## Delivery sequence

### Slice A — artifact contract and workbench shell

- Define a versioned multi-format artifact contract tied to space,
  conversation, and Work Session.
- Open a generated spreadsheet artifact in the existing right panel.
- Render a real editable grid with deterministic cell state.
- Save a new version without altering the source upload.

### Slice B — agent production and revision

- Produce workbook data and formulas through a bounded sandbox job.
- Generate a linked narrative artifact.
- Apply a conversation-linked revision to a new artifact version.
- Show execution receipts, provenance, and failures honestly.

### Slice C — export and voice journey

- Export the workbook to XLSX and the narrative/package to PDF.
- Start the same Workbench job through Realtime Voice Delegation.
- Verify close/reopen continuation, cancellation, retry, and artifact replay.

## Constraints

- No production deployment or customer-data mutation during the local loop.
- Preserve Chippi's current visual system and right-panel interaction.
- Never overwrite the uploaded source file.
- External sends and CRM writes retain explicit approval boundaries.
- One primary customer-visible vertical slice; enablers may not replace it.
- Each agent returns a report with changed files, executed evidence, remaining
  uncertainty, cost/time, and a recommendation.
- The root orchestrator reviews each report and either accepts, rejects, or
  requests bounded rework before the next cycle.
- Two consecutive cycles without user-visible movement or decision-changing
  learning pause the loop automatically.

## Feedback loop

Every cycle follows:

Observe → decide one bounded product increment → delegate bounded work →
review agent reports → integrate → verify → publish evidence → audit drift →
schedule the next cycle.

The loop itself may adapt only through a reversible proposal with independent
review. It cannot broaden production authority, approval scope, spending, or
the number of simultaneous product lanes.

