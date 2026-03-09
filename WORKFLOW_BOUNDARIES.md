# WORKFLOW_BOUNDARIES.md

Workflow separation guide to prevent accidental cross-system coupling.

## 1) High-level boundary map

- Auth boundary: identity/session + route protection
- Onboarding boundary: user setup + workspace activation
- Application boundary: public lead ingestion
- Scoring boundary: lead prioritization metadata
- CRM boundary: post-ingestion operations and pipeline handling
- Billing boundary: settings/copy present; Stripe flow not confirmed

## 2) Onboarding boundary

- Purpose: activate user/workspace and intake link setup
- Trigger: authenticated user onboarding flow
- Source of truth: user onboarding fields + `Space` creation
- Key records/fields: `User.onboarding*`, `Space`, `SpaceSetting`, default `DealStage`
- Can change: onboarding progress/completion, workspace setup data
- Must never change: application submission records or scoring outputs directly

## 3) Application flow boundary

- Purpose: capture structured prospect application
- Trigger: public `/apply/[subdomain]` form submit
- Source of truth: `Contact` intake record under workspace
- Key records/fields: contact intake fields + tags + scoring status fields
- Can change: contact creation and intake metadata
- Must never change: onboarding completion state

## 4) Scoring boundary

- Purpose: provide explainable triage metadata
- Trigger: post-submission scoring call
- Source of truth: score fields on `Contact`
- Key records/fields: `leadScore`, `scoreLabel`, `scoreSummary`, `scoringStatus`
- Can change: scoring-related fields only
- Must never change: onboarding state or unrelated CRM pipeline state

## 5) CRM boundary

- Purpose: triage/follow-up operations
- Trigger: authenticated workspace usage
- Source of truth: `Contact`, `Deal`, `DealStage`, relations
- Key records/fields: lifecycle type, stage, deal associations, notes
- Can change: CRM records and pipeline ordering
- Must never change: model prompt/scoring contracts unless explicitly tasked

## 6) Auth boundary

- Purpose: protect user and workspace access
- Trigger: route/API request requiring auth
- Source of truth: Clerk user/session + middleware + route checks
- Can change: sign-in state and guarded access paths
- Must never change: business workflow states as side effect

## 7) Billing boundary

- Purpose: billing preferences/settings (current visible scope)
- Trigger: settings updates
- Source of truth: `SpaceSetting.billingSettings` (string field) and legal/copy context
- Can change: billing settings field value
- Must never change: auth, onboarding, scoring, or CRM core logic
- Status: Stripe workflow not confirmed in current repo

## 8) Critical separation rule

Onboarding completion and application submission are separate states.
They must never share generic completion logic.

- Onboarding completion is user/workspace activation state.
- Application submission is contact/lead ingestion state.

Any change that blends these states requires explicit product and technical approval.
