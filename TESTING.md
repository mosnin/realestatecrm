# TESTING.md

Manual validation playbook for Chippi.

## 1) Local setup requirements

- Node.js 18+
- pnpm
- Env vars for features being tested (`DATABASE_URL`, Clerk keys, etc.)
- Database schema migrated

Basic run flow:
```bash
pnpm install
pnpm dev
```

## 2) Smoke test checklist

- [ ] Landing page loads
- [ ] Sign-up and sign-in pages load
- [ ] Authenticated user can reach dashboard routing gate
- [ ] Onboarding route is accessible when expected
- [ ] Workspace route `/s/[subdomain]` resolves

## 3) Core workflow tests

### A) Onboarding
- [ ] New user is redirected to onboarding
- [ ] Step progression persists
- [ ] Space/subdomain creation succeeds
- [ ] Completion redirects into workspace

### B) Intake link + submission
- [ ] Public apply page loads for valid subdomain
- [ ] Required field validation works
- [ ] Submission creates new lead/contact in workspace
- [ ] Duplicate rapid submit does not create duplicate row

### C) Scoring
- [ ] Successful submission writes scoring status/label/summary
- [ ] Missing/invalid provider key falls back gracefully
- [ ] Failure path still saves lead with fallback unscored state

### D) CRM rendering and actions
- [ ] Leads list shows intake records
- [ ] Contacts page loads and supports CRUD actions
- [ ] Deals board loads with stages and cards
- [ ] Drag/reorder stage movement persists

### E) AI assistant
- [ ] Chat endpoint responds for authenticated workspace user
- [ ] Message persistence stores user + assistant entries
- [ ] Missing provider config returns explicit error stream

### F) Auth checks
- [ ] Protected routes redirect unauthenticated users
- [ ] Authenticated users can access intended routes
- [ ] Middleware protection behaves as expected

### G) Billing checks
- Current repo status: Stripe flow not confirmed.
- [ ] Validate only existing billing settings UI fields do not break saves.

## 4) Regression checklist

- [ ] Onboarding completion state unaffected by intake submissions
- [ ] Intake submission state unaffected by onboarding progress
- [ ] CRM state updates do not alter scoring prompt logic
- [ ] Auth/middleware changes do not break public apply route
- [ ] No schema/migration files changed unless explicitly required

## 5) Workflow boundary validation (required)

Explicitly verify onboarding and application are separate states:
- Onboarding completion uses user-level onboarding fields.
- Application submission creates/updates contact-level records.
- No shared “generic completion” flag should unify them.
