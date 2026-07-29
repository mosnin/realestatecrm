# Chippi Live Workbench — Inspectable Experience Contract

Date: 2026-07-29
Program evidence type: experience

## Existing visual language

The authenticated production composer is centered, restrained, and built
around a conversation plus an optional right panel. Live Workbench extends
that system; it does not add a new dashboard, room, or competing navigation
model.

## Primary screen states

### 1. Instruction

The existing composer accepts a file and a plain-language goal. Chat and Agent
remain explicit. The voice button opens Realtime Voice Delegation and can start
the same Workbench goal.

### 2. Working

The conversation shows one durable Work Session card with:

- current step and overall progress;
- stop and close controls;
- any blocking question;
- a concise record of source files and intended outputs.

Closing the voice dialog or conversation surface does not cancel the run.

### 3. Artifact opened beside chat

The right panel opens a Workbench tab with:

- artifact title, type, version, and last update;
- editable spreadsheet grid;
- formula/value distinction;
- source and execution receipt;
- save-as-new-version control;
- export control;
- linked narrative tab when present.

The chat remains visible so the user can ask for revisions while inspecting the
result.

### 4. Revision

A revision request creates a new version, highlights changed regions, and
provides a short change receipt. The user may keep the new version or return to
an earlier one. The source upload is immutable.

### 5. Failure and recovery

If parsing, sandbox execution, persistence, or export fails, the surface names
the failed stage and preserves the last valid artifact. Retry resumes from a
safe boundary. The UI never substitutes a Markdown answer while implying an
editable workbook was created.

## First bounded implementation cycle

The first cycle ends when a generated spreadsheet-shaped artifact can be
opened in Chippi's existing right panel, edited in one cell, and saved as a new
local version through a tested, feature-off path. Sandbox generation, narrative
creation, and export remain explicitly queued for later slices.

## Review gate

The root reviewer accepts the cycle only with:

- a working customer-visible path or inspectable local prototype;
- source and behavior tests;
- a screenshot comparison against the current Chippi surface;
- no regression to Realtime Voice Delegation;
- an evidence report that distinguishes local proof from staging/production;
- no drift into unrelated hardening.
