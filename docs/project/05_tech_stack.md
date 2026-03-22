# 05 Tech Stack

## Always Included

### Frontend

Next.js 15+ (app router) with TypeScript and Tailwind CSS v4. React Server Components for data fetching, client components for interactive UI. Turbopack for development.

Justification: App router provides file-based routing, server components reduce bundle size. Tailwind v4 with CSS-first configuration.

### UI Components

shadcn/ui (built on Radix UI primitives). Lucide React for icons. Custom components in `components/ui/`.

Supporting libraries:
- **tailwind-merge** — resolves Tailwind class conflicts
- **class-variance-authority (CVA)** — component variants
- **Sonner** — toast notifications
- **@number-flow/react** — animated number transitions

### Animation

Framer Motion / Motion for UI animations. GSAP for advanced animations (landing page effects). @paper-design/shaders for visual effects.

### Forms and Validation

react-hook-form for form state. Zod v4 for schema validation shared between client and server.

### State Management

Server components for most data fetching. React Context for theme. No external state management library. URL-based state for filters where applicable.

### Backend

Next.js API routes (`app/api/*`) and server actions (`app/actions.ts`). Server components for data fetching.

### Database

PostgreSQL via Supabase (hosted). Direct Supabase client (service_role key, bypasses RLS). No ORM — raw Supabase queries.

Supabase extensions: pgcrypto, pgvector (vector similarity search for RAG).

### Auth

Clerk (@clerk/nextjs v7). Email/password + OAuth. Middleware-based route protection. Session claims for role checks.

### Billing

Stripe Checkout for payment collection. Billing page at `/s/[slug]/billing`. $97/month plan with 7-day free trial.

### Hosting

Vercel for frontend and API routes. Supabase for managed PostgreSQL.

### Email

Resend for transactional email delivery (tour confirmations, waitlist notifications, broker notifications, invitation emails).

### Dark Mode

Custom ThemeProvider using localStorage. Inline script in `<head>` for flash prevention. Class-based `.dark` toggle.

### Fonts

Geist Sans (primary), Open Sans (headings). Both loaded via next/font.

### Analytics

Amplitude (@amplitude/unified) for product analytics. Vercel Analytics and Speed Insights for performance.

## Include When Needed (Currently Active)

### Charts

Recharts for analytics dashboard charts.

### Rate Limiting

Upstash Redis (@upstash/redis) for rate limiting on auth and public API endpoints.

### AI / ML

- OpenAI SDK — lead scoring (gpt-4o-mini), embeddings (text-embedding-3-small), AI assistant
- Anthropic SDK — alternative AI assistant backend (user-provided API key)
- pgvector + match_documents RPC — vector similarity search for RAG context

### Drag and Drop

@dnd-kit (core, sortable, utilities) — Kanban board deal reordering.

### Maps

dotted-map — decorative world map visualization.

### Misc

- frimousse — emoji picker for workspace emoji
- simplex-noise — noise generation for visual effects

## Not Included (Intentional)

| Library | Reason |
|---------|--------|
| Prisma | Using Supabase client directly — simpler for this project |
| Redux / Zustand | Server components + server actions handle state |
| tRPC | API routes + server actions sufficient |
| next-themes | Custom ThemeProvider already implemented |
| Auth.js / NextAuth | Using Clerk instead |
| T3 Env | Not currently used — env vars accessed directly |

## Constraints

- Must deploy to Vercel (existing deployment)
- Database must be Supabase PostgreSQL (existing data)
- Auth must be Clerk (deeply integrated)
- No self-hosted infrastructure — all managed services
