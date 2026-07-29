# Chippi Live Workbench — Slice A Independent Rejection

Date: 2026-07-29

Decision: **rejected as a completed vertical product slice**

Scope: exact clean commit `c06085ff`, reviewed independently from the implementation agent and root orchestrator.

This evidence supersedes the acceptance interpretation in `04_EXPERIENCE_SLICE_A_RESULT.md`. The earlier artifact remains immutable because it is hash-bound in the Company OS ledger; this record corrects its conclusions rather than rewriting evidence history.

## What Slice A actually proved

- the existing Chippi right panel can host a cohesive Workbench tab behind a feature flag;
- a development-only spreadsheet fixture renders in ready, empty, and unavailable states;
- the grid supports in-session cell editing, version selection, immutable helper semantics, and change receipts;
- the implementation is reversible, dependency-light, and off for paying customers;
- the exact commit passes type checking, targeted lint, focused tests, and the clean repository regression suite.

Slice A is therefore an inspectable component prototype and a useful foundation. It is **not** an end-to-end Chippi capability.

## Independent verification

- Clean full Vitest at exact commit: 4,954 passed, 1 skipped, 0 failed.
- Focused Workbench and adjacent regression: 34 passed.
- TypeScript passed.
- Targeted ESLint passed.
- Commit whitespace validation passed.
- Ready, empty, and unavailable routes rendered.
- An in-session edit and save receipt rendered.
- Refresh persistence failed in two independent attempts.
- No authenticated conversation-linked Chippi path opened a real artifact.

The earlier 4,976-test figure came from the working checkout, which also contained unrelated uncommitted tests. It was not the exact-commit count and must not be used as release evidence.

## Blocking findings

### 1. No real product path

The customer right panel mounts `LiveWorkbench` without an artifact. When the feature flag is enabled, the panel therefore displays only the honest empty state. The editable workbook is reachable only through the development route.

### 2. Save success is not durable

The browser-local persistence layer swallows storage failures. The UI can display a successful save receipt even though refresh loses the version. This fails the core Workbench trust promise.

### 3. Mobile interaction is incomplete

The minimum-width grid clips columns at a narrow viewport without a sufficiently clear horizontal-scroll affordance or alternative compact layout.

### 4. Tenant/privacy isolation is not production-grade

Browser storage is keyed only by artifact ID. It is not scoped to workspace, user, or authenticated server state, and restored content receives only shallow structural validation.

### 5. Evidence overstated completion

The earlier result described a workbook as able to open in Chippi’s existing panel. In the actual customer path only the empty state can open. It also reported the dirty-checkout test total instead of the exact-commit total.

## Brutal quality result

Overall: **5.7 / 10**

Highest scores:

- cost efficiency: 9
- rollback readiness: 9
- north-star alignment: 8
- visual quality: 8
- brand cohesion: 8
- latency: 8

Lowest scores:

- agent intelligence: 2
- autonomy value: 2
- operational readiness: 2
- customer evidence: 3
- observability: 3
- token efficiency: 3
- agent controllability: 4
- context quality: 4
- reliability: 4
- evidence integrity: 4

No critical 9/10 product gate was met for the complete feature.

## Required next iteration

Build one real feature-off vertical path:

1. user attaches a CSV or XLSX in the Chippi composer;
2. Chippi receives the real tenant-scoped attachment identity;
3. Chippi creates a durable workbook artifact from the uploaded bytes;
4. the conversation-linked right panel opens that exact artifact;
5. a cell edit appends a durable version that survives refresh;
6. the source version remains immutable;
7. the selected version exports as a valid XLSX;
8. browser verification covers authenticated interaction, failure honesty, tenant isolation, and narrow-screen behavior.

Only that result can be rescored as a vertical Chippi capability. Production activation and the recurring autonomous implementation scheduler remain rejected until independent evidence accepts it.
