# Repository Overview: realestatecrm

This document summarizes the repository architecture, data model, request flows, and integration points so a new contributor can quickly understand the system.

## 1) Product shape

This is a multi-tenant real-estate CRM built on Next.js App Router.

- Public marketing site on `/`.
- Clerk authentication under `/sign-in` and `/sign-up`.
- Onboarding flow under `/onboarding`.
- Tenant workspace routes under `/s/[subdomain]`.
- Public tenant intake form under `/apply/[subdomain]`.
- Admin surface under `/admin`.

## 2) Runtime and stack

- **Framework**: Next.js 15 + React 19.
- **Auth**: Clerk.
- **Primary DB**: PostgreSQL via Prisma.
- **Cache / legacy tenant key-value storage**: Upstash Redis.
- **AI**: OpenAI + Anthropic (with OpenAI preferred when configured).
- **Vector Search**: Zilliz / Milvus with embedding sync.
- **Styling/UI**: Tailwind v4 + Radix/shadcn components.

## 3) Routing and access control

`middleware.ts` enforces auth for protected areas (`/dashboard`, `/s/*`, `/onboarding/*`) and redirects unauthenticated users to sign-in.

Primary navigation logic:

1. User hits `/dashboard`.
2. Server checks Clerk session and the DB user record.
3. If onboarding completed and a space exists, redirect to `/s/{subdomain}`.
4. Otherwise redirect to `/onboarding`.

Within `/s/[subdomain]/layout.tsx`, onboarding status is checked again before rendering the workspace shell.

## 4) Core domain model (Prisma)

Main entities:

- `User`: mapped to Clerk identity (`clerkId`) with onboarding state.
- `Space`: single tenant workspace tied 1:1 to user ownership.
- `SpaceSetting`: per-space configuration (notifications, timezone, AI key, branding copy).
- `Contact`: lead/client records with pipeline type (`QUALIFICATION`, `TOUR`, `APPLICATION`).
- `Deal`: opportunity record linked to a stage and contacts.
- `DealStage`: ordered pipeline stages per space.
- `DealContact`: join table for many-to-many deal-contact mapping.
- `Message`: persisted AI chat history per space.

Notable constraints:

- One `Space` per owner (`ownerId` unique).
- One `SpaceSetting` per `Space` (`spaceId` unique).
- Cascading deletes from `Space` to dependent records.

## 5) Workspace provisioning flow

`createSubdomainAction` in `app/actions.ts` orchestrates tenant creation:

1. Requires authenticated Clerk user.
2. Validates and sanitizes requested subdomain.
3. Rejects duplicates.
4. Upserts local `User` from Clerk profile.
5. Enforces one-space-per-account policy.
6. Writes lightweight subdomain metadata to Redis (`subdomain:{name}`).
7. Creates `Space`, default `SpaceSetting`, and default CRM `DealStage` rows.
8. Redirects to `/dashboard`.

## 6) Data APIs

The app uses Next.js route handlers in `app/api/**` for CRUD and operational flows, including:

- Contacts, deals, and stage management.
- Deal reordering endpoint.
- Onboarding state updates.
- Public lead intake (`/api/public/apply`).
- AI chat streaming (`/api/ai/chat`).
- Vector synchronization endpoint (`/api/vectorize/sync`).

The public intake handler deduplicates rapid double submissions (same name+phone in a 2-minute window) and tags created leads with `application-link` + `new-lead`.

## 7) AI + RAG pipeline

AI response flow (`app/api/ai/chat/route.ts` + `lib/ai.ts`):

1. Validate authenticated user + target space.
2. Persist latest user message.
3. Build query embedding from latest user input.
4. Search vector store for related contacts/deals.
5. Fetch matching relational data from Postgres.
6. Build system prompt with optional retrieved context.
7. Stream model response (OpenAI first, Anthropic fallback).
8. Tee the response stream so assistant output is also persisted in `Message`.

This design allows workspace-specific chat memory and lightweight retrieval-grounded answers.

## 8) Integration modules (`lib/*`)

- `lib/db.ts`: Prisma client initialization with `@prisma/adapter-pg` and pooled `pg` connections.
- `lib/space.ts`: space lookup helpers.
- `lib/subdomains.ts`: Redis-based subdomain helpers and emoji validation.
- `lib/embeddings.ts`: embedding generation.
- `lib/zilliz.ts`: vector upsert/search/delete operations.
- `lib/vectorize.ts`: transforms contacts/deals to vectorized text and syncs them.

## 9) Front-end composition

- `app/layout.tsx`: global app shell and providers.
- `app/page.tsx`: marketing landing page.
- `app/onboarding/*`: onboarding wizard UX.
- `app/s/[subdomain]/*`: tenant dashboard pages (contacts, deals, AI, settings, leads, profile).
- `components/ui/*`: design-system primitives.
- `components/dashboard/*`: workspace navigation and header components.

## 10) Build and operational notes

- Build script runs migration recovery helper + `prisma migrate deploy` before `next build`.
- `scripts/ensure-prisma-client-shim.cjs` is run at build/postinstall to guarantee Prisma client availability.
- Missing AI/vector env vars are tolerated with graceful degradation in chat behavior.

## 11) Suggested mental model for contributors

Think of the system in three layered concerns:

1. **Tenant identity and access** (Clerk + onboarding + route guards).
2. **Operational CRM** (contacts/deals/stages in Postgres).
3. **Assistive intelligence** (vector retrieval + streaming LLM responses).

Most feature work will touch one or two of these layers, but robust changes usually verify all three boundaries.
