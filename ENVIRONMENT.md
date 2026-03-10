# ENVIRONMENT.md

Configuration and external service reference for Chippi. Based on actual repository code.

---

## 1. Environment variables

All variables found or inferable from code usage:

| Variable | Used by | What it powers | Criticality | Failure symptom if missing |
|---|---|---|---|---|
| `DATABASE_URL` | `lib/db.ts` (pg pool + Prisma adapter) | PostgreSQL connection for all app data | **Critical** | All DB operations fail; app crashes on any data access |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk SDK (client-side) | Auth UI components (sign-in, sign-up) | **Critical** | Auth pages fail to render; sign-in/sign-up broken |
| `CLERK_SECRET_KEY` | Clerk SDK (server-side) | Server-side auth verification, middleware | **Critical** | All protected routes fail; API auth returns errors |
| `OPENAI_API_KEY` | `lib/lead-scoring.ts`, `lib/embeddings.ts`, `lib/ai.ts` | Lead scoring, text embeddings, AI assistant (primary) | **High** | Scoring fails (fallback to unscored); embeddings fail; assistant may fall back to Anthropic |
| `ANTHROPIC_API_KEY` | `lib/ai.ts` | AI assistant (fallback provider) | **Medium** | Assistant falls back to OpenAI if available; if neither key set, assistant returns error message |
| `ZILLIZ_URI` | `lib/zilliz.ts` | Milvus/Zilliz vector DB endpoint | **Optional** | Vector sync and RAG context fail silently; assistant works without RAG |
| `ZILLIZ_TOKEN` | `lib/zilliz.ts` | Milvus/Zilliz authentication | **Optional** | Same as `ZILLIZ_URI` |
| `KV_REST_API_URL` | `lib/redis.ts` | Upstash Redis endpoint | **Medium** | Legacy admin path and subdomain metadata fail |
| `KV_REST_API_TOKEN` | `lib/redis.ts` | Upstash Redis authentication | **Medium** | Same as `KV_REST_API_URL` |
| `NEXT_PUBLIC_ROOT_DOMAIN` | `lib/utils.ts` | Public URL/domain construction for intake links | **Medium** | Falls back to `workflowrouting.com` (prod) or `localhost:3000` (dev); intake link URLs may be wrong if not set correctly |
| `NODE_ENV` | `lib/utils.ts`, `lib/db.ts` | Protocol selection (http vs https), Prisma logging level | **Auto-set** | Set automatically by Next.js; do not override manually |

### Clerk-specific variables

Clerk requires additional environment variables that are standard for `@clerk/nextjs`. These are not explicitly referenced in application code but are required by the SDK:

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Required for client-side Clerk components |
| `CLERK_SECRET_KEY` | Required for server-side auth verification |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Optional; defaults to `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Optional; defaults to `/sign-up` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | Optional; defaults to `/dashboard` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | Optional; defaults to `/dashboard` |

---

## 2. What each service powers

| Service | Role in Chippi | Key integration files |
|---|---|---|
| **Clerk** | Authentication, session management, route protection | `middleware.ts`, `app/(auth)/*`, all API routes using `auth()` |
| **PostgreSQL** | Source-of-truth for all app data (users, spaces, contacts, deals, stages, messages, settings) | `lib/db.ts`, `prisma/schema.prisma` |
| **OpenAI** | Lead scoring (gpt-4o-mini), text embeddings (text-embedding-3-small), AI assistant primary provider | `lib/lead-scoring.ts`, `lib/embeddings.ts`, `lib/ai.ts` |
| **Anthropic** | AI assistant fallback provider. Per-workspace key support via SpaceSetting. | `lib/ai.ts` |
| **Zilliz/Milvus** | Vector storage and similarity search for RAG-enriched AI assistant context | `lib/zilliz.ts`, `lib/embeddings.ts`, `lib/vectorize.ts` |
| **Upstash Redis** | Legacy subdomain metadata storage, admin dashboard data | `lib/redis.ts`, `lib/subdomains.ts`, `app/actions.ts` |
| **Vercel** | Deployment target, analytics, speed insights | `@vercel/analytics`, `@vercel/speed-insights` packages |

---

## 3. Critical vs optional variables

### Must have for app to function

| Variable | Why |
|---|---|
| `DATABASE_URL` | No data access without it |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Auth UI won't render |
| `CLERK_SECRET_KEY` | Server auth fails |

### Must have for core features

| Variable | Why |
|---|---|
| `OPENAI_API_KEY` | Lead scoring and embeddings require it. Assistant can fall back to Anthropic but scoring cannot. |

### Nice to have / optional

| Variable | Why |
|---|---|
| `ANTHROPIC_API_KEY` | Assistant fallback. Not needed if OpenAI key is set. |
| `ZILLIZ_URI` + `ZILLIZ_TOKEN` | RAG context enrichment. Assistant works without it. |
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` | Legacy admin path. Core CRM works without it. |
| `NEXT_PUBLIC_ROOT_DOMAIN` | Falls back to defaults. Set for correct intake link URLs. |

---

## 4. Local vs production notes

| Aspect | Local (development) | Production |
|---|---|---|
| Protocol | `http` (derived from `NODE_ENV`) | `https` |
| Default domain | `localhost:3000` | `workflowrouting.com` |
| Prisma logging | `['error', 'warn']` | `['error']` |
| Prisma client | Singleton cached on `globalThis` | Fresh per cold start |
| Build pipeline | `pnpm dev` (Turbopack) | `pnpm build` (migrations + prisma shim + next build) |
| TS/ESLint errors | Visible in dev | Ignored during build (`next.config.ts`) |

### `.env` files

All `.env*` files are gitignored. Create a `.env.local` file locally with the required variables.

---

## 5. Third-party services map

| Service | Present in code | Package | Status |
|---|---|---|---|
| Clerk | Yes | `@clerk/nextjs@^7.0.1` | Core auth, fully integrated |
| PostgreSQL (Neon-compatible) | Yes | `@prisma/client@^7.4.2`, `pg@^8.20.0` | Core database, fully integrated |
| OpenAI | Yes | `openai@^6.26.0` | Scoring + embeddings + assistant, fully integrated |
| Anthropic | Yes | `@anthropic-ai/sdk@^0.78.0` | Assistant fallback, fully integrated |
| Zilliz/Milvus | Yes | `@zilliz/milvus2-sdk-node@^2.6.10` | Vector search, optional |
| Upstash Redis | Yes | `@upstash/redis@^1.34.9` | Legacy metadata path |
| Vercel | Yes (packages) | `@vercel/analytics@^1.5.0`, `@vercel/speed-insights@^1.2.0` | Deployment target |
| Stripe | **Not confirmed** | Not in dependencies | Billing field exists in DB schema but no Stripe integration |
| Neon | **Not explicit** | No Neon-specific package | PostgreSQL connection via `DATABASE_URL`; Neon is likely the hosted provider but not confirmed in code |

---

## 6. Per-workspace configuration

The `SpaceSetting` model stores per-workspace configuration:

| Field | Purpose |
|---|---|
| `anthropicApiKey` | Per-workspace Anthropic API key for AI assistant |
| `aiPersonalization` | AI personalization preferences (tone, style) |
| `billingSettings` | Billing preferences (string, not yet functional) |
| `phoneNumber` | Realtor's phone number |
| `businessName` | Business or brand name |
| `intakePageTitle` | Title shown on public intake form |
| `intakePageIntro` | Intro text on public intake form |
| `notifications` | Email notification preference (boolean) |
| `myConnections` | Partner connections / default submission status (JSON string) |
