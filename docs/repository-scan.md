# Repository Scan (Initial Pass)

## What this project appears to be

This repository is a Next.js 15 workspace-based real estate CRM app branded as **Chippi**, focused on leasing/renter lead intake, qualification, AI scoring, and pipeline management.

## High-level architecture findings

- **Framework/UI**: Next.js App Router + React 19 + Tailwind 4 + shadcn/ui.
- **Auth**: Clerk.
- **Data layer**: PostgreSQL via Prisma (`@prisma/client` + `@prisma/adapter-pg`).
- **AI**: Anthropic/OpenAI helper modules and vectorization utilities.
- **Workspace-based routing**: Slug-driven routes under `app/s/[slug]/...`.

## Product areas identified

- Public marketing + pricing/trial CTA (`app/page.tsx`).
- Workspace dashboard and admin pages (`app/s/[slug]/*`, `app/admin/*`).
- Lead/contact/deal APIs (`app/api/contacts`, `app/api/deals`, `app/api/stages`).
- Onboarding flow (`app/onboarding/*`).

## Issues/risk signals found quickly

1. **TypeScript build health is currently poor**
   - Running `pnpm -s tsc --noEmit` reports many errors, including:
     - Prisma type export errors (`PrismaClient`, `Deal`, `Contact`, etc.).
     - Many `noImplicitAny` errors across pages/components.

2. **Potential Prisma-client-generation mismatch**
   - The repo includes a fallback shim script (`scripts/ensure-prisma-client-shim.cjs`) that writes a minimal Prisma client file in environments where generation fails.
   - This can keep runtime from crashing in constrained environments, but does not solve type-level correctness and may obscure underlying generation/config issues.

3. **README appears partially inherited/outdated**
   - Current README title still reflects inherited template language, while product copy in app is clearly for Chippi leasing workflow.

## Recommended next actions

1. Stabilize Prisma type generation first (verify Prisma 7 setup, generated client path, and compatibility with TypeScript config).
2. Add a first-class CI `typecheck` step and reduce `implicit any` errors incrementally by domain (deals/contacts/pages).
3. Refresh README to match current product and operational setup (required env vars, local dev steps, workspace/slug behavior).
4. Add baseline engineering docs (`docs/architecture.md`, `docs/runbook.md`) for faster onboarding.
