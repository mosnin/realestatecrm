# ARCHITECTURE.md

System map for Chippi (repo-truth based).

## 1) Tech stack

- Framework: Next.js 15 (App Router)
- Language: TypeScript
- UI: React 19 + Tailwind + Radix/shadcn-style components
- Auth: Clerk
- DB: PostgreSQL via Prisma
- AI: OpenAI + Anthropic SDKs
- Vectors: Zilliz/Milvus
- Cache/legacy tenant metadata: Upstash Redis
- Deployment target: Vercel-oriented setup

## 2) Directory map

- `app/` pages, layouts, API routes
- `components/` UI + feature components
- `lib/` database and service logic
- `prisma/` schema + migrations
- `scripts/` build/migration helper scripts

## 3) Major systems and locations

| System | Primary files |
|---|---|
| Auth + route protection | `middleware.ts`, `app/(auth)/*` |
| Onboarding UI | `app/onboarding/page.tsx`, `app/onboarding/wizard-client.tsx` |
| Onboarding API | `app/api/onboarding/route.ts` |
| Public intake UI | `app/apply/[subdomain]/page.tsx`, `application-form.tsx` |
| Public apply ingestion | `app/api/public/apply/route.ts` |
| Lead scoring | `lib/lead-scoring.ts` |
| CRM views | `app/s/[subdomain]/*` |
| Contacts/deals/stages APIs | `app/api/contacts/*`, `app/api/deals/*`, `app/api/stages/*` |
| AI assistant API | `app/api/ai/chat/route.ts`, `lib/ai.ts` |
| Vector sync/search | `lib/embeddings.ts`, `lib/zilliz.ts`, `lib/vectorize.ts`, `app/api/vectorize/sync/route.ts` |
| Data model | `prisma/schema.prisma` |

## 4) Data flow overview

1. User signs in via Clerk.
2. Onboarding ensures user record + creates workspace (`Space`) and default pipeline stages.
3. Intake link points prospects to `/apply/[subdomain]`.
4. Public submission writes a `Contact` row under that `Space`.
5. Scoring runs and updates score fields on that contact.
6. Workspace views read/update contacts/deals/stages via API routes.
7. AI assistant streams responses and can enrich with vector context if configured.

## 5) Auth flow

- Middleware protects `/dashboard`, `/s/*`, `/onboarding` for signed-in users.
- Sign-in/up pages use Clerk hosted components.
- Workspace pages include onboarding completion guard before main CRM access.

## 6) Onboarding flow

- Multi-step wizard persists progress (`onboardingCurrentStep`) and completion (`onboardingCompletedAt`).
- `create_space` action creates:
  - `Space`
  - `SpaceSetting`
  - default `DealStage` rows

## 7) Application submission flow

- Public page resolves `Space` by subdomain.
- Form posts JSON to `/api/public/apply`.
- API validates required fields (`subdomain`, `name`, `phone`).
- API deduplicates very recent duplicate submits.
- Contact is created with intake tags and pending scoring status.

## 8) Scoring flow

- `scoreLeadApplication` (OpenAI) produces JSON contract:
  - `leadScore` 0-100
  - `scoreLabel` hot/warm/cold/unscored
  - `scoreSummary`
- API persists scoring result to contact.
- Failure path persists fallback unscored state.

## 9) CRM flow

- Leads page: intake-focused list, unread/new semantics via tags.
- Contacts page: CRUD + lifecycle type (`QUALIFICATION`, `TOUR`, `APPLICATION`).
- Deals page: kanban with stage/order updates.

## 10) Billing flow

- Current repo state: billing settings fields/copy exist.
- Stripe implementation not confirmed in code (no stripe package/routes found).
- Treat billing as boundary-sensitive and unknown/partial in implementation.

## 11) Deployment notes

- `pnpm build` runs migration helper script + `prisma migrate deploy` + prisma shim + next build.
- `next.config.ts` currently ignores TypeScript and ESLint build errors.
- Vercel analytics/speed-insights packages are present.

## 12) Known risks, coupling points, unclear areas

1. Legacy Redis subdomain/admin path coexists with Prisma-first workspace data.
2. Build error ignores can mask type/lint issues.
3. Billing implementation is not clearly complete.
4. AuthN exists; authZ/tenant-boundary checks are sensitive and should be reviewed carefully before edits.
