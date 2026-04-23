# TESTING.md

Validation playbook for Chippi.

This repository supports both automated and manual validation. Run automated checks first, then execute manual workflow checks for the surfaces your change touches.

---

## 1. Local setup requirements

| Requirement | Details |
|---|---|
| Node.js | 18+ |
| Package manager | pnpm (v10.12 configured in `package.json`) |
| Database | Supabase/PostgreSQL credentials configured |
| Clerk | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` configured |
| Schema | `supabase/schema.sql` applied (or equivalent migrations applied) |

### Basic run flow

```bash
pnpm install
pnpm dev
```

Dev server runs at `http://localhost:3000` with Turbopack.

### Optional services for full functionality

| Service | Required for | Env vars |
|---|---|---|
| OpenAI | AI assistant, embeddings, AI-enhanced scoring summaries | `OPENAI_API_KEY` |
| Zilliz/Milvus | Vector search (RAG context) | `ZILLIZ_URI`, `ZILLIZ_TOKEN` |
| Upstash Redis | Agent triggers, live streams, budget counters, legacy metadata paths | `KV_REST_API_URL`, `KV_REST_API_TOKEN` |
| Modal runtime | Background agent heartbeat + run-now webhook | `AGENT_INTERNAL_SECRET`, `MODAL_WEBHOOK_URL` |

---

## 2. Automated checks (run first)

Run these before manual QA whenever possible:

- [ ] `pnpm test` (Vitest suite: `tests/**/*.test.ts`)
- [ ] `pnpm test:contract` (Node contract tests: `scripts/*.test.mjs`)
- [ ] `pnpm typecheck`
- [ ] `pnpm lint`

If one fails due environment/setup constraints, record the exact failure and continue with relevant manual checks.

---

## 3. Smoke test checklist

Run these after any change to confirm nothing is fundamentally broken:

- [ ] `pnpm dev` starts without crashing
- [ ] Landing page loads at `/`
- [ ] Sign-up page loads at `/sign-up`
- [ ] Sign-in page loads at `/sign-in`
- [ ] Authenticated user hitting `/dashboard` is routed correctly (to workspace or onboarding)
- [ ] `/onboarding` route is accessible for authenticated users
- [ ] Workspace route `/s/[slug]` resolves for valid slug

---

## 4. Core workflow tests

### A. Onboarding

- [ ] New user is redirected to `/onboarding` from `/dashboard`
- [ ] Step 1 (Welcome) renders and "Get started" advances to step 2
- [ ] Step 2 (Profile) saves name, phone, business name
- [ ] Step 3 (Intake link) creates Space + slug, slug validation works, taken slugs are rejected
- [ ] Step 4 (Application flow) informational screen renders
- [ ] Step 5 (Notifications) saves notification preferences
- [ ] Step 6 (CRM preview) renders mock lead card
- [ ] Step 7 (Go live) shows intake link, copy button works, "Go to my CRM" completes onboarding and redirects to `/s/[slug]`
- [ ] `User.onboardingCompletedAt` is set after completion
- [ ] Returning to `/dashboard` after completion redirects to workspace

### B. Intake link and application submission

- [ ] Public apply page loads at `/apply/[valid-slug]`
- [ ] Public apply page returns 404 for invalid slug
- [ ] Form requires name and phone (cannot submit without)
- [ ] Successful submission shows confirmation with scoring result
- [ ] Submission creates a Contact in the correct Space
- [ ] Contact has `tags: ['application-link', 'new-lead']`
- [ ] Contact has `type: QUALIFICATION`
- [ ] Rapid duplicate submission (same name + phone within 2 min) does not create a second Contact
- [ ] Budget is parsed as float when provided

### C. Lead scoring

- [ ] Successful submission produces scored result (score, label, summary/details)
- [ ] Missing/invalid `OPENAI_API_KEY` still preserves lead creation and deterministic scoring output
- [ ] AI enhancement failures fall back to deterministic summary/tags/next-action values
- [ ] Scoring failure does **not** prevent Contact creation — lead is always saved
- [ ] True scoring engine failures return unscored fallback state and still preserve contact creation

### D. CRM rendering and actions

- [ ] Leads page (`/s/[slug]/leads`) shows intake-sourced contacts
- [ ] Leads page clears `new-lead` tag from contacts on page load
- [ ] Unread count badge decrements after viewing leads
- [ ] Score, budget, timeline, areas, notes render correctly on lead cards
- [ ] Contacts page (`/s/[slug]/contacts`) loads and shows all contacts
- [ ] Contact creation via CRM form works (CRUD)
- [ ] Contact type filter (QUALIFICATION, TOUR, APPLICATION) works
- [ ] Contact search by name/email/phone/preferences works
- [ ] Deals page (`/s/[slug]/deals`) loads with kanban board
- [ ] Deals can be created with stage assignment
- [ ] Deal drag-and-drop reorders within and across stages
- [ ] Deal stage CRUD works (create, update, delete)

### E. AI assistant

- [ ] Chat page (`/s/[slug]/ai`) loads
- [ ] Sending a message streams a response
- [ ] Messages are persisted in `Message` table (both user and assistant)
- [ ] Missing `OPENAI_API_KEY` returns explicit error text
- [ ] Vector context enrichment works when Zilliz is configured (verify response references CRM data)
- [ ] Chat works without Zilliz configured (RAG failure is silent)

### F. Auth checks

- [ ] Unauthenticated user accessing `/dashboard` is redirected to `/sign-in`
- [ ] Unauthenticated user accessing `/s/[slug]` is redirected to `/sign-in`
- [ ] Unauthenticated user accessing `/onboarding` is redirected to `/sign-in`
- [ ] Authenticated user can access all intended routes
- [ ] `/apply/[slug]` is accessible without auth (public)
- [ ] API routes return 401 for unauthenticated requests (except `/api/public/apply`)

### G. Settings

- [ ] Settings page (`/s/[slug]/settings`) loads with current values
- [ ] Saving settings persists changes
- [ ] Workspace deletion works and redirects to `/`

### H. Billing checks

- [ ] Stripe checkout flow endpoints load (`/api/billing/checkout`, `/api/billing/portal`, `/api/billing/cancel`)
- [ ] Billing settings field in Settings does not break on save
- [ ] Stripe webhook route is configured and accepting signed events in target environment

### I. Background agent checks

- [ ] Agent page (`/s/[slug]/agent`) loads Drafts, Activity, and Settings tabs
- [ ] Agent settings save correctly (`enabled`, `autonomyLevel`, `enabledAgents`, `dailyTokenBudget`)
- [ ] `Run now` triggers immediate Modal path when `MODAL_WEBHOOK_URL` is configured
- [ ] `Run now` falls back to queued trigger flow when Modal webhook is unavailable
- [ ] Agent live stream (`/api/agent/stream`) emits events for recent run IDs
- [ ] Draft review flow works end-to-end (pending → approved/sent or dismissed)
- [ ] Agent activity/usage/insights endpoints return workspace-scoped data

---

## 5. Regression checklist

Run these after any change to verify workflow boundaries are intact:

- [ ] Onboarding completion state is unaffected by intake submissions
- [ ] Intake submission state is unaffected by onboarding progress
- [ ] CRM state updates do not alter scoring prompt logic
- [ ] Auth/middleware changes do not break public `/apply` route
- [ ] No schema/migration files changed unless explicitly required
- [ ] Protected systems (see AGENTS.md section 5) unchanged unless explicitly required
- [ ] Leads page still filters by `application-link` tag
- [ ] Scoring still produces `hot/warm/cold/unscored` labels

---

## 6. Workflow boundary validation (required after cross-system changes)

Explicitly verify that onboarding and application are separate states:

| Check | Expected |
|---|---|
| Onboarding completion uses | `User.onboardingCompletedAt` (user-level field) |
| Application submission creates | `Contact` record (per-lead, per-space) |
| Shared completion flag | Must **not** exist |
| Completing onboarding | Does not create contacts |
| Submitting application | Does not affect onboarding state |

If any of these checks fail after a change, the change has introduced cross-workflow coupling and must be reverted or fixed.
