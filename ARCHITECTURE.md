# ARCHITECTURE.md

System map for Chippi based on current repository implementation.

---

## 0. Runtime invariants

1. **Slug-first workspace identity**: Workspace routing is slug-based (`/s/:slug`, `/apply/:slug`).
2. **Onboarding completion isolation**: Onboarding completion state remains user/workspace activation state and must not be coupled to public lead submission state.
3. **Public intake path isolation**: Prospect submissions go through `app/api/public/apply/route.ts` and write Contact records scoped to a target space.
4. **Scoring resilience**: Lead scoring uses a deterministic engine as the numeric source-of-truth with optional AI enhancement for narrative fields.

---

## 1. Tech stack snapshot

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js 15 | App Router, Turbopack in dev |
| Language | TypeScript | Server/client code in one monorepo |
| Auth | Clerk | Middleware + API-level auth checks |
| Data | Supabase PostgreSQL | Service-role server access |
| AI (in-app) | OpenAI JS SDK | Assistant + embeddings + scoring enhancement |
| AI (background) | OpenAI Agents SDK (Python) | Coordinator/specialist runtime in `agent/` |
| Agent runtime | Modal | Scheduled heartbeat + run-now webhook |
| Billing | Stripe | Checkout/portal routes + webhook processing |
| Queue/cache/metering | Upstash Redis | Legacy metadata + agent triggers/stream/budget counters |

---

## 2. Directory map (high value paths)

```text
realestatecrm/
├── app/
│   ├── setup/page.tsx
│   ├── apply/[slug]/*
│   ├── s/[slug]/*
│   │   ├── ai/page.tsx
│   │   └── agent/page.tsx
│   ├── api/
│   │   ├── public/apply/route.ts
│   │   ├── ai/task/route.ts
│   │   ├── ai/task/approve/[requestId]/route.ts
│   │   ├── ai/messages/route.ts
│   │   ├── ai/conversations/*
│   │   ├── agent/*
│   │   ├── billing/*
│   │   └── webhooks/stripe/route.ts
├── agent/
│   ├── modal_app.py
│   ├── orchestrator.py
│   ├── agents/*
│   ├── tools/*
│   └── security/*
├── lib/
│   ├── lead-scoring.ts
│   ├── scoring/engine.ts
│   ├── scoring/enhance.ts
│   ├── ai.ts
│   ├── ai-tools/*
│   ├── embeddings.ts
│   ├── vectorize.ts
│   ├── zilliz.ts
│   └── rate-limit.ts
├── supabase/
│   ├── schema.sql
│   └── migrations/*
└── middleware.ts
```

---

## 3. Major systems

| System | Primary files | Description |
|---|---|---|
| Auth and route protection | `middleware.ts`, `app/(auth)/*` | Clerk session + route protection + banned-user guardrails |
| Onboarding | `app/setup/page.tsx`, `app/api/onboarding/route.ts` | User/workspace activation flow |
| Public intake and ingestion | `app/apply/[slug]/*`, `app/api/public/apply/route.ts` | Prospect-facing intake and Contact creation |
| Lead scoring | `lib/lead-scoring.ts`, `lib/scoring/*` | Deterministic score + optional AI enhancement |
| CRM workspace | `app/s/[slug]/*`, `app/api/contacts/*`, `app/api/deals/*`, `app/api/stages/*` | Leads, contacts, deals, settings, analytics |
| In-app assistant | `app/api/ai/task/*`, `lib/ai-tools/*`, `app/s/[slug]/ai/page.tsx` | Tool-using SSE assistant with approval flow |
| Background agent | `agent/*`, `app/api/agent/*`, `components/agent/*` | Modal heartbeat + event-driven drafting/activity runtime |
| Billing | `app/api/billing/*`, `app/api/webhooks/stripe/route.ts` | Stripe-backed subscription lifecycle |
| Vector/RAG | `lib/embeddings.ts`, `lib/vectorize.ts`, `lib/zilliz.ts` | Embedding + retrieval for assistant context |

---

## 4. Data flow overview

1. User authenticates via Clerk.
2. Setup/onboarding creates or updates user/workspace state.
3. Public intake submission creates Contact in target space.
4. Scoring pipeline computes deterministic score, then optionally enriches summary/tags with AI.
5. Workspace users operate CRM surfaces (`/s/[slug]/*`).
6. In-app assistant (`/api/ai/task`) handles interactive tool-use turns and persists conversation/message records.
7. Background agent (`agent/*`, `/api/agent/*`) runs scheduled and run-now workflows, producing drafts/activity/memory updates.
8. Billing routes + Stripe webhooks manage subscription state transitions.

---

## 5. Auth boundary notes

- Protected workspace/admin/broker/setup routes are enforced in middleware.
- Prospect-facing routes are explicitly public (`/apply/*`, `/book/*`, `/api/public/*`).
- AI, billing, and agent routes enforce user/workspace ownership checks server-side.

---

## 6. Scoring boundary notes

- Numeric score is produced by deterministic engine logic.
- AI enhancement is best-effort and non-authoritative for numeric score.
- Scoring failures must not prevent Contact persistence.

---

## 7. Billing boundary notes

- Stripe is implemented via checkout, portal, cancel, and webhook routes.
- Billing must remain decoupled from onboarding completion and public intake ingestion.

---

## 8. Known coupling hotspots

1. Legacy Redis paths still coexist with Supabase source-of-truth paths.
2. Build config currently tolerates TS/ESLint issues during production build.
3. Agent runtime spans Python + Next.js boundaries; auth secret and stream/trigger contracts must remain aligned.
4. Workspace-ownership checks vary by route and require ongoing security review.

