# CHANGELOG_AI.md

Ledger for AI-assisted changes in this repository.

Use this file to keep a consistent, auditable record of all AI-authored work. Both AI agents and human contributors should log entries here after AI-assisted changes.

---

## How to use this file

1. Add a new entry at the top of the log section (most recent first).
2. Fill in all required fields.
3. Be specific about files touched and why.
4. Include test evidence — what was checked and what the result was.
5. If a change is risky or touches a protected system, note that explicitly.

---

## Entry template

Copy this template for each new entry:

```md
## [YYYY-MM-DD] <short task name>

- **Task**: <what was requested>
- **Summary**: <what changed, in plain language>
- **Files touched**:
  - `<path>` — <why this file was changed>
  - `<path>` — <why this file was changed>
- **Reason**: <why the change was needed>
- **Risks**: <possible side effects, or "None identified">
- **Manual tests**:
  - <what was checked> — <result>
  - <what was checked> — <result>
- **Rollback notes**: <how to revert safely, e.g. "Revert commit <hash>" or "Delete file X">
```

### Required fields

| Field | Description |
|---|---|
| Date | YYYY-MM-DD format |
| Task | What was requested |
| Summary | What changed |
| Files touched | Each file path + reason for change |
| Reason | Why the change was needed |
| Risks | Side effects or "None identified" |
| Manual tests | What was verified and result |
| Rollback notes | How to undo the change |

---

## Log

## [2026-04-23] Continue docs normalization for runtime boundaries

- **Task**: Continue iterative documentation normalization across legacy docs.
- **Summary**: Updated architecture, prompts/scoring, API/security contracts, workflow/scope boundaries, and agent operating docs to match the current implemented stack (deterministic scoring core, in-app task assistant, background agent runtime, Stripe billing).
- **Files touched**:
  - `ARCHITECTURE.md` — Rewritten to match current code paths and subsystem boundaries.
  - `PROMPTS_AND_SCORING.md` — Rewritten for deterministic scoring + optional AI enhancement and current assistant/runtime endpoints.
  - `API_CONTRACTS.md` — Updated AI endpoint contracts to `/api/ai/task` + approval flow.
  - `SECURITY.md` — Updated AI task rate-limit entries.
  - `WORKFLOW_BOUNDARIES.md` — Corrected route protection/onboarding/scoring/billing boundary notes.
  - `PRODUCT_SCOPE.md` — Updated current-scope implementation map and removed stale out-of-scope SMS/email note.
  - `AGENTS.md` — Updated stack summary and protected-file references.
  - `DB_CONVENTIONS.md` — Removed stale Prisma migration phrasing.
- **Reason**: Multiple docs still referenced pre-agentic and pre-Stripe assumptions, causing source-of-truth drift.
- **Risks**: Documentation interpretation risk if implementation changes again without follow-up updates.
- **Manual tests**:
  - Verified referenced endpoint/file paths exist — pass.
  - Verified key rate-limit and AI endpoint docs align with current route files — pass.
- **Rollback notes**: Revert the docs-only commits from 2026-04-23 if needed.

### [PLACEHOLDER] Example entry — replace with real entries

## [2026-03-10] Create documentation stack

- **Task**: Create comprehensive project documentation for safe AI-assisted development
- **Summary**: Created 9 documentation files (AGENTS.md, ARCHITECTURE.md, PRODUCT_SCOPE.md, CHANGELOG_AI.md, DECISIONS.md, TESTING.md, ENVIRONMENT.md, PROMPTS_AND_SCORING.md, WORKFLOW_BOUNDARIES.md) covering project architecture, product scope, agent operating rules, testing playbook, environment config, AI behavior contracts, and workflow boundaries.
- **Files touched**:
  - `AGENTS.md` — AI agent operating manual
  - `ARCHITECTURE.md` — System map and technical architecture
  - `PRODUCT_SCOPE.md` — Product truth doc and scope guardrails
  - `CHANGELOG_AI.md` — This file; AI change ledger
  - `DECISIONS.md` — Decision log with templates
  - `TESTING.md` — Manual validation playbook
  - `ENVIRONMENT.md` — Environment variables and services reference
  - `PROMPTS_AND_SCORING.md` — AI prompt and scoring behavior documentation
  - `WORKFLOW_BOUNDARIES.md` — Workflow separation guide
- **Reason**: Establish governance docs for safe AI-assisted development
- **Risks**: Documentation drift if code changes are not reflected in docs
- **Manual tests**:
  - Verified all referenced file paths exist in repository
  - Confirmed technical details match actual codebase
- **Rollback notes**: Revert the commit to restore previous documentation versions
