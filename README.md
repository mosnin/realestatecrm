# Chippi

Real estate CRM and lead management platform for realtors and brokerages.

---

## What is Chippi?

Chippi is a SaaS platform that helps realtors capture, qualify, and manage rental leads through a streamlined workflow. It combines a public-facing intake form, AI-powered lead scoring, a full CRM pipeline, tour scheduling, and brokerage team management into a single product.

### Key features

- **Public intake forms** — Custom-branded application pages for prospects to submit rental applications
- **AI lead scoring** — Deterministic scoring engine with optional AI-enhanced summaries and recommendations
- **CRM pipeline** — Kanban-style deal management with customizable stages, drag-and-drop, and contact linking
- **Tour scheduling** — Public booking page, calendar integration, automated confirmations/reminders
- **Brokerage management** — Multi-user team dashboards, invite system, performance tracking across realtors
- **AI assistant + agent system** — Interactive in-app assistant plus a background agent runtime for automated monitoring, drafting, and follow-up orchestration
- **Notifications** — Email (Resend) and SMS (Telnyx) notifications for leads, tours, deals, and follow-ups
- **Analytics** — Weekly trends, conversion funnels, and team performance metrics

### Who it's for

- **Solo realtors** handling leasing and rental leads
- **Small teams** and brokerages managing multiple realtors
- **Broker-only users** overseeing team performance without a personal workspace

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| UI | React 19, Tailwind CSS 4, shadcn/ui components |
| Auth | Clerk |
| Database | PostgreSQL via Supabase |
| AI | OpenAI (in-app assistant + agent workflows) + OpenAI Agents SDK (background agent runtime) |
| Vector search | Supabase pgvector |
| Agent runtime | Modal (Python service in `agent/`) |
| Email | Resend |
| SMS | Telnyx |
| Cache | Upstash Redis |
| Deployment | Vercel |

---

## Project structure

```
app/                    # Next.js App Router pages, layouts, API routes
  (auth)/               # Sign-in, sign-up, login pages
  s/[slug]/             # Workspace pages (dashboard, leads, contacts, deals, tours, settings)
  broker/               # Brokerage management pages
  setup/                # Onboarding and workspace creation
  api/                  # API routes (contacts, deals, tours, onboarding, AI, etc.)
components/             # UI and feature components
  ui/                   # Base shadcn/ui components
  dashboard/            # Dashboard widgets (header, sidebar, notification center)
  deals/                # Kanban board, deal forms
  broker/               # Brokerage-specific components
  auth/                 # Auth page layout, onboarding flow
lib/                    # Core business logic
  email.ts              # Resend email templates (leads, deals, invitations, digests)
  tour-emails.ts        # Tour confirmation, reminder, follow-up emails
  sms.ts                # Telnyx SMS integration
  notify.ts             # Unified notification dispatcher (email + SMS)
  lead-scoring.ts       # AI lead scoring via OpenAI
  ai.ts                 # AI assistant with provider fallback
  supabase.ts           # Supabase client
  permissions.ts        # Auth helpers and broker context
agent/                  # Background AI agent service (Modal + OpenAI Agents SDK)
  agents/               # Coordinator + specialist agents
  tools/                # Agent tool implementations (contacts, deals, drafts, activities, memory)
  orchestrator.py       # Multi-space run orchestration and budgeting
  modal_app.py          # Modal heartbeat + webhook entrypoints
supabase/
  schema.sql            # Database schema and migrations
docs/framework/         # Design system documentation (tokens, components, archetypes)
```

---

## Getting started

### Prerequisites

- Node.js 18+
- pnpm
- Supabase project (or PostgreSQL database)
- Clerk account for authentication

### Environment setup

Copy `.env.example` to `.env.local` and fill in your credentials:

```bash
cp .env.example .env.local
```

Required variables:
- `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — Supabase connection
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` — Clerk auth
- `OPENAI_API_KEY` — AI assistant, embeddings, and AI-enhanced scoring summaries

Optional:
- `RESEND_API_KEY` + `RESEND_FROM_EMAIL` — Email notifications
- `TELNYX_API_KEY` + `TELNYX_FROM_NUMBER` — SMS notifications
- `AGENT_INTERNAL_SECRET` + `MODAL_WEBHOOK_URL` — Background agent webhook/auth wiring
See [ENVIRONMENT.md](./ENVIRONMENT.md) for the full reference.

### Install and run

```bash
pnpm install
pnpm dev
```

### Database setup

1. Create a Supabase project
2. Enable the pgvector extension (Database > Extensions > search "vector")
3. Run `supabase/schema.sql` in the SQL editor

### Build for production

```bash
pnpm build
pnpm start
```

---

## Core workflows

1. **Realtor signs up** via Clerk and completes onboarding (or skips to set up later)
2. **Workspace created** with a custom slug and public intake link
3. **Prospects submit** rental applications through the public intake form
4. **Leads are scored** via deterministic scoring + optional AI enhancement and saved as contacts
5. **Realtor manages** leads, contacts, deals, and tours from the workspace dashboard
6. **In-app assistant** supports conversational CRM help and tool-driven task execution
7. **Background agent (optional)** runs on heartbeat or manual trigger, monitors workspace signals, and drafts/suggests follow-ups based on configured autonomy
8. **Notifications and delivery** send via email and/or SMS based on workspace preferences and approval settings
9. **Brokers** can invite realtors, track team performance, and manage the brokerage

---

## Environment reference

See [ENVIRONMENT.md](./ENVIRONMENT.md) for a detailed breakdown of all environment variables, services, and per-workspace configuration.

---

## Design system

The design system documentation lives in `docs/framework/` and covers:
- Design tokens (colors, spacing, typography, motion)
- Component specs (cards, tables, forms, modals, etc.)
- Screen archetypes (dashboard, analytics, table index, detail, settings)
- Dashboard archetypes (queue, pipeline, analytics, admin overview)
- Responsive breakpoints and mobile behavior

---

## License

Proprietary. All rights reserved.
