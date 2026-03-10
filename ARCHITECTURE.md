# ARCHITECTURE.md

System map for Chippi. Based on actual repository contents.

---

## 1. Tech stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js 15 (App Router, Turbopack dev) | `next@^15.3.6` |
| Language | TypeScript 5.8 | Build errors currently ignored via `next.config.ts` |
| UI | React 19, Tailwind 4, Radix/shadcn-style components | framer-motion + GSAP for animations |
| Auth | Clerk (`@clerk/nextjs@^7.0.1`) | Middleware-based route protection |
| Database | PostgreSQL via Prisma 7 (`@prisma/client`, `@prisma/adapter-pg`) | `pg` pool adapter |
| AI - scoring | OpenAI (`openai@^6.26.0`) | `gpt-4o-mini`, structured JSON output |
| AI - assistant | OpenAI (preferred) + Anthropic SDK (`@anthropic-ai/sdk@^0.78.0`) fallback | `gpt-4o-mini` / `claude-sonnet-4-6` |
| AI - embeddings | OpenAI `text-embedding-3-small` | 1536-dim vectors |
| Vector DB | Zilliz/Milvus (`@zilliz/milvus2-sdk-node@^2.6.10`) | Per-space collections, COSINE metric |
| Cache/legacy | Upstash Redis (`@upstash/redis@^1.34.9`) | Slug metadata, admin path |
| Forms | react-hook-form + zod validation | |
| Charts | recharts | |
| Drag/drop | @dnd-kit | Deals kanban board |
| Package manager | pnpm 10.12 | |
| Deployment target | Vercel | Analytics + Speed Insights packages present |

---

## 2. Directory map

```
realestatecrm/
├── app/                        # Next.js App Router pages, layouts, API routes
│   ├── (auth)/                 # Sign-in / sign-up (Clerk hosted components)
│   ├── admin/                  # Admin dashboard (legacy Redis-based)
│   ├── api/
│   │   ├── ai/chat/            # AI assistant streaming endpoint
│   │   ├── contacts/           # Contact CRUD + [id] routes
│   │   ├── deals/              # Deal CRUD + [id] + reorder routes
│   │   ├── onboarding/         # Onboarding wizard API (multi-action POST)
│   │   ├── public/apply/       # Public intake form submission (unauthenticated)
│   │   ├── spaces/             # Workspace CRUD
│   │   ├── stages/             # Deal stage CRUD + [id] routes
│   │   └── vectorize/sync/     # Vector sync trigger
│   ├── apply/[slug]/      # Public intake page (prospect-facing)
│   ├── dashboard/              # Routing gate → redirects to workspace or onboarding
│   ├── header/                 # Landing page header
│   ├── legal/                  # Terms, privacy, cookies
│   ├── onboarding/             # 7-step onboarding wizard
│   ├── s/[slug]/          # Authenticated workspace (CRM)
│   │   ├── ai/                 # AI assistant page
│   │   ├── contacts/           # Contacts list + [id] detail
│   │   ├── deals/              # Deals kanban board
│   │   ├── leads/              # Intake leads list
│   │   ├── profile/            # User profile
│   │   └── settings/           # Workspace settings
│   ├── actions.ts              # Server actions (legacy space creation/deletion)
│   ├── layout.tsx              # Root layout (Clerk provider, theme, fonts)
│   └── page.tsx                # Landing page
├── components/
│   ├── ai/                     # Chat interface, message bubble
│   ├── contacts/               # Contact table, form
│   ├── dashboard/              # Sidebar, header, mobile nav
│   ├── deals/                  # Kanban board, column, card, form
│   └── ui/                     # shadcn-style primitives
├── lib/
│   ├── ai.ts                   # AI assistant logic (provider routing, RAG, streaming)
│   ├── db.ts                   # Prisma client singleton
│   ├── embeddings.ts           # OpenAI text-embedding-3-small
│   ├── lead-scoring.ts         # Lead scoring (OpenAI gpt-4o-mini, structured JSON)
│   ├── nav-links.ts            # Landing page nav config
│   ├── redis.ts                # Upstash Redis client
│   ├── space.ts                # Space lookup helpers
│   ├── slugs.ts           # Legacy slug helpers (Redis-based)
│   ├── utils.ts                # cn(), protocol, rootDomain
│   ├── vectorize.ts            # Contact/deal → vector sync
│   └── zilliz.ts               # Milvus client, collection CRUD, search
├── prisma/
│   ├── schema.prisma           # Data model
│   └── migrations/             # SQL migration history
├── scripts/
│   ├── ensure-prisma-client-shim.cjs   # Build helper
│   └── resolve-failed-migrations.cjs   # Migration recovery helper
├── middleware.ts               # Clerk auth middleware + route protection
├── next.config.ts              # Next.js config (TS/ESLint errors ignored)
├── prisma.config.ts            # Prisma config
└── package.json                # Dependencies, scripts
```

---

## 3. Major systems and locations

| System | Primary files | Description |
|---|---|---|
| Auth + route protection | `middleware.ts`, `app/(auth)/*` | Clerk middleware protects `/dashboard`, `/s/*`, `/onboarding` |
| Onboarding UI | `app/onboarding/page.tsx`, `wizard-client.tsx` | 7-step wizard: welcome → profile → intake link → app flow → notifications → CRM preview → go live |
| Onboarding API | `app/api/onboarding/route.ts` | Multi-action POST: `start`, `save_step`, `save_profile`, `create_space`, `save_notifications`, `complete`, `check_slug` |
| Public intake form | `app/apply/[slug]/page.tsx`, `application-form.tsx` | Prospect-facing form: name (req), phone (req), email, budget, timeline, areas, notes |
| Intake ingestion | `app/api/public/apply/route.ts` | Creates Contact, deduplicates within 2min window, triggers scoring |
| Lead scoring | `lib/lead-scoring.ts` | OpenAI gpt-4o-mini, structured JSON, score 0-100, labels hot/warm/cold/unscored |
| CRM workspace | `app/s/[slug]/*` | Leads list, contacts CRUD, deals kanban, AI assistant, settings, profile |
| Contacts API | `app/api/contacts/route.ts`, `[id]/route.ts` | CRUD with search/filter, async vector sync on create |
| Deals API | `app/api/deals/route.ts`, `[id]/route.ts`, `reorder/route.ts` | CRUD with stage association, position ordering, async vector sync |
| Stages API | `app/api/stages/route.ts`, `[id]/route.ts` | Deal stage CRUD |
| AI assistant | `app/api/ai/chat/route.ts`, `lib/ai.ts` | Streaming chat with RAG context from Zilliz, message persistence |
| Vector system | `lib/embeddings.ts`, `lib/zilliz.ts`, `lib/vectorize.ts`, `app/api/vectorize/sync/route.ts` | OpenAI embeddings → Zilliz per-space collections |
| Data model | `prisma/schema.prisma` | User, Space, SpaceSetting, Contact, Deal, DealStage, DealContact, Message |
| Dashboard gate | `app/dashboard/page.tsx` | Redirects to workspace if onboarding complete, or to `/onboarding` |
| Admin (legacy) | `app/admin/*` | Redis-based admin dashboard, legacy path |
| Server actions (legacy) | `app/actions.ts` | `createSlugAction`, `deleteSlugAction` — older space creation path using Redis |

---

## 4. Data flow overview

```
1. User signs in via Clerk
2. /dashboard checks onboarding state
   → If no space: redirect to /onboarding
   → If space exists: redirect to /s/[slug]
3. Onboarding wizard (7 steps):
   → Creates User record (upsert from Clerk)
   → Creates Space + SpaceSetting + default DealStages
   → Sets onboardingCompletedAt on User
4. Intake link: /apply/[slug]
   → Public form → POST /api/public/apply
   → Creates Contact with tags ['application-link', 'new-lead']
   → Calls scoreLeadApplication (OpenAI)
   → Updates Contact with score fields
   → On failure: persists fallback unscored state
5. CRM workspace views:
   → Leads page: reads contacts with 'application-link' tag
   → Contacts page: full CRUD with type filter
   → Deals page: kanban with stages and drag/reorder
6. AI assistant:
   → Streams response via OpenAI (preferred) or Anthropic (fallback)
   → Optionally enriches with vector context from Zilliz
   → Persists messages to Message table
```

---

## 5. Auth flow

- **Middleware** (`middleware.ts`): Clerk middleware protects `/dashboard`, `/s/*`, `/onboarding`. Unauthenticated users are redirected to `/sign-in` with `redirect_url`.
- **Public routes**: `/`, `/sign-in`, `/sign-up`, `/admin`, `/apply/*`, `/legal/*` are accessible without auth.
- **Onboarding guard**: `/dashboard` page and `/s/[slug]/layout.tsx` both check `onboardingCompletedAt` or space existence. Legacy accounts with space but no completion timestamp are auto-healed.
- **API auth**: Protected API routes call `auth()` from Clerk and return 401 if no `userId`.
- **Public API**: `/api/public/apply` does **not** require auth (prospect-facing).

---

## 6. Onboarding flow

7-step wizard persisted via `User.onboardingCurrentStep`:

| Step | Name | What happens |
|---|---|---|
| 1 | Welcome | Intro screen, no data saved |
| 2 | Profile basics | Saves name, phone, business name to User + SpaceSetting |
| 3 | Public intake link | Creates Space with slug, SpaceSetting, default DealStages (New, Reviewing, Showing, Applied, Approved, Declined) |
| 4 | Application flow | Informational — shows what the intake form collects |
| 5 | Notifications | Saves email notification preference and default submission status |
| 6 | CRM preview | Informational — shows mock lead card |
| 7 | Go live | Shows intake link, copy button, test submit. Marks `onboardingCompletedAt`. |

Completion sets `onboardingCurrentStep = 7` and `onboardingCompletedAt = now()`.

---

## 7. Application submission flow

1. Public page at `/apply/[slug]` resolves Space by slug.
2. Form collects: name (required), phone (required), email, budget, timeline, preferred areas, notes.
3. POST to `/api/public/apply` with JSON payload.
4. API validates required fields (`slug`, `name`, `phone`).
5. Deduplication: checks for same name + normalized phone + `application-link` tag within last 2 minutes.
6. Creates Contact with `type: QUALIFICATION`, `tags: ['application-link', 'new-lead']`, `scoringStatus: 'pending'`.
7. Calls `scoreLeadApplication` → updates Contact with score fields.
8. Returns 201 with contact ID and scoring result.
9. On scoring failure: Contact still persisted with `scoringStatus: 'failed'`, `scoreLabel: 'unscored'`.

---

## 8. Scoring flow

- **Function**: `scoreLeadApplication` in `lib/lead-scoring.ts`
- **Model**: OpenAI `gpt-4o-mini`, temperature 0
- **Format**: Structured JSON output via `response_format.json_schema`
- **Input**: name, email, phone, budget, timeline, preferredAreas, notes
- **Output contract** (`LeadScoringResult`):
  - `scoringStatus`: `scored` | `failed` | `pending`
  - `leadScore`: 0-100 or null
  - `scoreLabel`: `hot` (75-100) | `warm` (45-74) | `cold` (0-44) | `unscored`
  - `scoreSummary`: explainable text, max 300 chars
- **Validation**: Zod schema validates parsed JSON
- **Fallback**: On any failure (missing key, empty response, invalid JSON, schema failure, provider error), returns `{ scoringStatus: 'failed', leadScore: null, scoreLabel: 'unscored', scoreSummary: 'Scoring unavailable right now. Lead saved successfully.' }`

---

## 9. CRM flow

- **Leads page** (`app/s/[slug]/leads/page.tsx`): Filters contacts by `application-link` tag. Clears `new-lead` tag on page load. Shows score, budget, timeline, areas, notes, scoring summary.
- **Contacts page** (`app/s/[slug]/contacts/page.tsx`): Full CRUD. Lifecycle types: `QUALIFICATION`, `TOUR`, `APPLICATION`. Search by name/email/phone/preferences.
- **Deals page** (`app/s/[slug]/deals/page.tsx`): Kanban board with DealStages. Drag-and-drop via @dnd-kit. Position-based ordering.
- **Contact detail** (`app/s/[slug]/contacts/[id]/page.tsx`): Individual contact view.
- **AI assistant** (`app/s/[slug]/ai/page.tsx`): Chat interface with streaming responses and message history.

---

## 10. Billing flow

- **Current state**: `SpaceSetting.billingSettings` field exists as a string column.
- **Settings UI** shows a billing settings input field.
- **No Stripe package** in dependencies. No Stripe-related API routes.
- **Intended pricing** (per product context, not confirmed in code): $97/month, 7-day free trial.
- **Status**: Billing is boundary-sensitive. Treat as not yet implemented.

---

## 11. Deployment notes

- **Build command**: `node scripts/resolve-failed-migrations.cjs && prisma migrate deploy && node scripts/ensure-prisma-client-shim.cjs && next build`
- **`next.config.ts`**: ignores TypeScript and ESLint build errors (`ignoreBuildErrors: true`, `ignoreDuringBuilds: true`)
- **Server external packages**: `@zilliz/milvus2-sdk-node` (for Node.js native modules)
- **Vercel packages**: `@vercel/analytics`, `@vercel/speed-insights` present
- **Domain handling**: `NEXT_PUBLIC_ROOT_DOMAIN` env var, falls back to `workflowrouting.com` (prod) or `localhost:3000` (dev). Protocol derived from `NODE_ENV`.
- **Postinstall**: runs `ensure-prisma-client-shim.cjs`

---

## 12. Known risks, coupling points, unclear areas

1. **Legacy Redis path**: `app/actions.ts` and `lib/slugs.ts` use Upstash Redis for slug metadata. This coexists with the Prisma-first workspace model. The admin dashboard relies on Redis. Potential for state divergence.
2. **Build error suppression**: TypeScript and ESLint errors are ignored during build. Type and lint issues can accumulate silently.
3. **Billing not implemented**: Field and UI exist but no payment processing. Enabling billing will require Stripe integration and careful boundary work.
4. **Tenant isolation**: API routes check auth but workspace ownership verification varies. Sensitive area for security review.
5. **Onboarding auto-heal**: Both `/dashboard` and `/s/[slug]/layout.tsx` contain onboarding completion auto-heal logic for legacy accounts. Duplicated logic.
6. **Two space creation paths**: `app/api/onboarding/route.ts` (create_space action) and `app/actions.ts` (createSlugAction) both create spaces with different default stage names (New/Reviewing/Showing/Applied/Approved/Declined vs Lead/Qualified/Proposal/Negotiation/Closed Won/Closed Lost).
7. **Vector dependency optional**: Zilliz/embeddings failures are silently caught — assistant works without RAG. But scoring requires OpenAI.
