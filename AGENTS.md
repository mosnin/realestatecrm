# AGENTS.md

AI operating manual for the Chippi repository.

## 1) Project summary

Chippi is a self-serve SaaS for U.S. realtors focused on faster lead handling through intake, qualification, follow-up, and lightweight CRM workflows.

## 2) Current wedge (must protect)

Current launch wedge:
- renter + leasing lead qualification
- for new solo realtors
- fast setup and activation
- practical, explainable AI assistance

Do **not** treat this repo as a “generic CRM expansion” project unless explicitly instructed.

## 3) In-scope vs out-of-scope behavior

### In scope by default
- small, targeted bug fixes
- copy updates
- scoped UI fixes
- documentation updates
- narrow improvements to existing requested surfaces

### Out of scope by default
- new feature development
- broad refactors
- architecture rewrites
- changing product direction
- any edits to protected systems (below) without explicit instruction

## 4) Safe workflow for AI agents

Follow this order for every task:
1. Read relevant files first.
2. Map code path and system boundary.
3. Explain diagnosis/plan.
4. Edit only what task requires.
5. Validate with commands/manual checks.
6. Report exact files changed + test evidence.

## 5) Protected areas (explicit)

Do not modify these unless task explicitly requires it:
1. Onboarding logic (`/onboarding`, `/api/onboarding`)
2. Public application flow (`/apply`, `/api/public/apply`)
3. AI prompts / assistant behavior (`lib/ai.ts`)
4. Lead scoring logic/contracts (`lib/lead-scoring.ts`)
5. Model configuration/provider routing (OpenAI/Anthropic choices)
6. CRM state/pipeline logic (contacts/deals/stages APIs and data contracts)
7. Auth and middleware (Clerk + `middleware.ts`)
8. Billing-related behavior (if/when implemented)
9. Database schema/migrations (`prisma/schema.prisma`, `prisma/migrations/*`)
10. Deployment/build config (`next.config.ts`, build scripts)
11. Core routing behavior and guard logic
12. Environment variable handling

## 6) Expected output format by task type

### Bugfix tasks
- Root cause
- Files changed
- Why fix is minimal/safe
- Validation steps + results
- Risks/rollback notes

### Audit/orientation tasks
- Current behavior map
- Gaps/risks
- Unknowns
- No-change confirmation (if applicable)

### Feature tasks (only when explicitly requested)
- Scope boundaries
- Affected systems
- Safety checks and migration impact
- Test plan and rollback plan

## 7) Definition of done for AI tasks

A task is done only when:
- requested scope is fully addressed
- unrelated files are untouched
- protected systems unchanged unless explicitly required
- verification has been run and reported
- final report includes files touched, reason, and checks

## 8) Hard rules

1. Never edit AI/scoring/prompt systems unless explicitly told.
2. Never add features unless explicitly told.
3. Never refactor unrelated code while doing targeted work.
4. Preserve behavior unless behavior change is requested.
5. Prefer minimal, scoped edits over “cleanup.”
