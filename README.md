# Chippi

Primary orientation document for humans and AI agents working in this repository.

---

## 1) Project overview

Chippi is a self-serve SaaS for U.S. realtors focused on faster lead handling through:
- intake
- qualification
- follow-up
- lightweight CRM workflows
- a polished, professional brand experience

### Who it is for (current focus)
- **Primary user now:** brand-new solo realtors in the U.S. handling renter/leasing leads.
- **Later users (future direction):** established realtors, small teams, and brokerage-driven expansion.

### Problem Chippi solves
Most new realtors handle leasing leads across DMs, texts, forms, and spreadsheets. Chippi compresses this into one structured workflow so leads can be qualified and acted on faster.

### Current wedge (important)
Chippi is **not** currently positioned as a broad CRM-first platform.
The launch wedge is:
- renter/leasing lead qualification
- speed to qualification clarity
- fast follow-up from a focused command center

---

## 2) Current product scope (what exists now)

What the app is trying to do right now:
1. Realtor signs up with Clerk.
2. Realtor completes onboarding.
3. Realtor gets a subdomain workspace and public intake link.
4. Prospect submits a structured rental application.
5. Submission is saved as a contact/lead in CRM.
6. Lead is scored (OpenAI-based scoring + summary).
7. Realtor triages and follows up in Leads/Contacts/Deals views.
8. Realtor can use AI assistant with optional RAG context.

What is present in code today:
- onboarding wizard and onboarding API
- public intake form + submission API
- CRM surfaces (overview, leads, contacts, deals kanban)
- lead scoring on intake submission
- AI assistant route + message persistence
- workspace settings and profile pages

---

## 3) Core workflows

### A) User onboarding
- Route: `/onboarding`
- Multi-step onboarding persists progress and creates the user’s workspace (`Space`) + default stages.
- Completion gate redirects users into `/s/[subdomain]` workspace.

### B) Intake link creation
- Intake link is generated from workspace/subdomain.
- Public intake URL pattern: `/apply/[subdomain]`.
- Intake page title/intro can be customized via `SpaceSetting`.

### C) Prospect application flow
- Prospect submits a structured application form (name/phone required, plus budget/timeline/areas/notes).
- Submission is written as a `Contact` tagged as intake-generated.
- Duplicate short-window protection exists for rapid repeat submits.

### D) CRM lead handling
- Leads view shows intake submissions and freshness/new markers.
- Contacts view supports lifecycle-like stages (`QUALIFICATION`, `TOUR`, `APPLICATION`).
- Deals uses a kanban model with configurable stages and drag/reorder APIs.

### E) Scoring and AI assistance
- On intake submission, lead scoring runs via OpenAI and stores:
  - `leadScore`
  - `scoreLabel`
  - `scoreSummary`
  - `scoringStatus`
- AI assistant route supports streaming responses and can pull vector context when embeddings/Zilliz are configured.

---

## 4) Repository architecture overview

### Stack (actual repo)
- **Framework:** Next.js 15 App Router
- **Language:** TypeScript
- **UI:** React 19 + Tailwind + Radix/shadcn-style components
- **Auth:** Clerk
- **Database:** PostgreSQL via Prisma
- **AI providers:** OpenAI + Anthropic SDKs
- **Vector search:** Zilliz/Milvus SDK
- **Cache/legacy tenant metadata:** Upstash Redis
- **Deployment target:** Vercel-style setup

### Major directories
- `app/` – App Router pages, layouts, and API routes
- `components/` – UI and feature components (dashboard, leads, deals, AI, etc.)
- `lib/` – data/access logic (`db`, scoring, AI, vector, redis, utils)
- `prisma/` – schema and migrations
- `scripts/` – build/deploy helper scripts for migrations/prisma shim

### Main systems and where logic lives
- **Onboarding**: `app/onboarding/*`, `app/api/onboarding/route.ts`
- **Public application intake**: `app/apply/[subdomain]/*`, `app/api/public/apply/route.ts`
- **CRM APIs**: `app/api/contacts/*`, `app/api/deals/*`, `app/api/stages/*`
- **AI assistant**: `app/api/ai/chat/route.ts`, `lib/ai.ts`
- **Lead scoring**: `lib/lead-scoring.ts` (called by public apply API)
- **Vector sync/search**: `lib/embeddings.ts`, `lib/zilliz.ts`, `lib/vectorize.ts`, `app/api/vectorize/sync/route.ts`
- **Auth middleware**: `middleware.ts`
- **Data model**: `prisma/schema.prisma`

### Data flow (high level)
1. Clerk user auth/session established.
2. Onboarding creates `User` + `Space` + default `DealStage` records.
3. Public intake creates `Contact` under `Space`.
4. Scoring result written back to `Contact`.
5. CRM UI reads from APIs/Prisma-backed routes.
6. Optional vector sync enables RAG context for AI assistant.

---

## 5) Environment and services

### Confirmed integrations in code
- **Clerk** – authentication and identity.
- **PostgreSQL (Neon-compatible)** – primary app database through `DATABASE_URL`.
- **OpenAI** – lead scoring and embeddings.
- **Anthropic (optional per-space key + env fallback)** – AI assistant provider.
- **Zilliz/Milvus** – vector storage/search for assistant context.
- **Upstash Redis** – subdomain/admin metadata path still present.
- **Vercel Analytics / Speed Insights** – frontend telemetry packages.

### Billing
- Marketing/pricing copy for `$97/mo` and `7-day free trial` exists.
- **Stripe billing implementation is not confirmed in current codebase** (no Stripe package or API routes found).

### Environment variables currently implied by code
- `DATABASE_URL`
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY` (optional global fallback)
- `ZILLIZ_URI`
- `ZILLIZ_TOKEN`
- `NEXT_PUBLIC_ROOT_DOMAIN`

Unknown/not yet confirmed:
- Dedicated `.env.example` file is not present in this repo.
- Neon-specific setup docs are not explicitly documented in repo files.

---

## 6) Setup and local development

### Prerequisites
- Node.js 18+
- pnpm (repo is pnpm-based)
- PostgreSQL database reachable via `DATABASE_URL`
- Clerk/OpenAI/etc. credentials depending on features you run

### Install
```bash
pnpm install
```

### Run dev server
```bash
pnpm dev
```

### Build
```bash
pnpm build
```

Build runs:
1. migration resolution helper
2. `prisma migrate deploy`
3. prisma client shim helper
4. Next build

### Start production mode locally
```bash
pnpm start
```

---

## 7) Protected systems and change rules (MANDATORY)

For all contributors and AI agents:

1. **Do not modify protected systems unless explicitly instructed.**
2. Protected systems include:
   - onboarding flow
   - public application flow
   - scoring logic and prompts
   - AI behavior/model configuration
   - CRM state/pipeline logic
   - auth and access control
   - billing logic
   - database schema/migrations
   - deployment/build configuration
3. **No speculative refactors.**
4. **No feature additions without explicit instruction.**
5. Follow this order: **read first → explain second → edit third**.
6. Keep edits minimal, scoped, and behavior-preserving unless behavior change is explicitly requested.

---

## 8) How to work safely in this repo

Standard operating workflow:
1. Inspect only relevant files first.
2. Map the real code path end-to-end.
3. Explain root cause/plan before editing.
4. Change only necessary files.
5. Validate using repo commands and focused checks.
6. Report exactly what changed and why.
7. If anything is unknown, state unknown (do not invent).

---

## 9) Known product principles (operator shorthand)

- Protect the launch wedge: leasing/renter qualification for solo realtors.
- Activation matters: intake link generation is a key activation moment.
- Qualification speed/clarity > CRM breadth.
- AI should be practical, explainable, and useful for action.
- Keep setup low-friction and product-led.
- Brand tone should remain modern, light, clear, calm, and professional.

---

## 10) Current known gaps or risks (visible from repo)

1. Existing README before this rewrite was stale template content.
2. Auth checks are present, but fine-grained tenant authorization should always be treated as sensitive/high-risk area.
3. Build config currently ignores TS/ESLint build errors (`next.config.ts`) — this can hide issues.
4. Billing/trial backend implementation is not clearly present despite pricing copy.
5. Repo still contains some legacy multi-tenant/admin patterns (Redis-based subdomain management) alongside Prisma-first app data.

---

## 11) Command reference

Available scripts from `package.json`:

```bash
pnpm dev
pnpm build
pnpm start
pnpm postinstall
```

Useful direct commands commonly needed:

```bash
pnpm exec prisma migrate deploy
pnpm exec prisma generate
pnpm exec tsc --noEmit
```

Note:
- `build` already runs migration helper scripts under `scripts/`.

---

## 12) Contribution note for AI agents (MANDATORY)

1. Do **not** edit protected AI logic, prompts, scoring behavior, onboarding, CRM flow, auth, billing, schema, or deployment settings unless explicitly told.
2. Do **not** add features unless explicitly told.
3. Do **not** perform unrelated cleanup or broad refactors.
4. Understand the existing implementation before proposing or making changes.
5. Preserve Chippi’s current wedge and workflow intent in every change.
6. Prefer minimal, scoped edits that solve only the requested task.

---

## Additional project details

`PASTE MY EXTRA PROJECT DETAILS HERE`

(Placeholder retained intentionally from product instruction. Replace when finalized project notes are provided.)
