# Auth & Routing Flow

How users move through sign-up, sign-in, onboarding, and into their workspace.

---

## Overview

```
Sign Up (Clerk)  ──→  /dashboard  ──→  /setup  ──→  /s/{slug}
Sign In (Clerk)  ──→  /dashboard  ──→  /s/{slug}
                                   └──→  /setup  (if no workspace yet)
```

There are NO Clerk webhooks. User records are created in the DB lazily — the
first time the user hits `/setup`.

---

## Detailed flow

### 1. Sign Up (`/sign-up`)

- **File:** `app/(auth)/sign-up/[[...sign-up]]/page.tsx`
- Renders Clerk's `<SignUp>` component with `forceRedirectUrl="/dashboard"`
- Clerk creates the user account (email/password or OAuth)
- After Clerk completes, the browser is redirected to `/dashboard`
- **At this point the user exists in Clerk but NOT in the database**

### 2. Sign In (`/sign-in`)

- **File:** `app/(auth)/sign-in/[[...sign-in]]/page.tsx`
- Renders Clerk's `<SignIn>` component with `forceRedirectUrl="/dashboard"`
- After Clerk authenticates, the browser is redirected to `/dashboard`

### 3. Dashboard redirect (`/dashboard`)

- **File:** `app/dashboard/page.tsx`
- This is NOT a real dashboard — it's a **routing page** that decides where to send the user
- Steps:
  1. `auth()` → get Clerk `userId` (redirect to `/sign-in` if none)
  2. Query DB: `SELECT u.*, s."slug" ... FROM "User" u LEFT JOIN "Space" s ... WHERE u."clerkId" = $1`
  3. If query fails → render error UI with actual error message
  4. If user has a space → `redirect('/s/{slug}')`
  5. If user has no space OR user doesn't exist in DB → `redirect('/setup')`

### 4. Setup / workspace creation (`/setup`)

- **File:** `app/setup/page.tsx`
- Steps:
  1. `auth()` → get Clerk `userId`
  2. Query DB for existing user + space (same JOIN as `/dashboard`)
  3. If user already has a space → `redirect('/s/{slug}')` (skip setup)
  4. If user doesn't exist in DB → **create the DB user record** via INSERT/upsert
  5. Render `<CreateWorkspaceForm>`
- The form submits to `POST /api/onboarding` with `action: 'create_space'`

### 5. Onboarding API (`/api/onboarding`)

- **File:** `app/api/onboarding/route.ts`
- Handles all onboarding steps via `action` parameter:
  - `start` — mark onboarding as started
  - `save_step` — save current step number
  - `save_profile` — save name/phone/business
  - `create_space` — create workspace + default deal stages + settings
  - `save_notifications` — save notification preferences
  - `complete` — set `onboard = true`
  - `check_slug` — check if a slug is available

### 6. Workspace (`/s/{slug}`)

- User's main workspace, only accessible after setup is complete

---

## Middleware (`middleware.ts`)

```
Protected routes: /dashboard, /s/*, /setup, /admin
Public routes:    /, /sign-in, /sign-up
Admin routes:     /admin, /api/admin (require role=admin in Clerk publicMetadata)
```

If a user hits a protected route without a Clerk session, they're redirected to
`/sign-in?redirect_url={original_url}`.

---

## Database

Uses `@neondatabase/serverless` (HTTP-based, no connection pooling needed).
Connection configured via `DATABASE_URL` env var.

### Key tables

| Table | Purpose |
|-------|---------|
| `User` | App user record, linked to Clerk via `clerkId` |
| `Space` | Workspace, one per user, identified by `slug` column |
| `SpaceSetting` | Per-workspace config (notifications, API keys, intake page text) |
| `DealStage` | Pipeline stages (created automatically during setup) |

### Column naming

The `Space` table column is **`slug`** (not `subdomain`). The old Prisma schema
had `@map("subdomain")` but the actual DB column has always been `slug`. All SQL
queries must use `"slug"`, never `"subdomain"`.

---

## Where user records are created

There are exactly **two** code paths that INSERT into the `User` table:

1. **`/setup` page** (`app/setup/page.tsx` line ~79) — upsert on first visit
2. **`POST /api/onboarding`** (`app/api/onboarding/route.ts` line ~91) — upsert if not found

Both use `ON CONFLICT ("clerkId") DO UPDATE` to be idempotent.

There is **no Clerk webhook** — user records are created lazily on first
authenticated page load.

---

## Common failure modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Something went wrong" on `/dashboard` | SQL query failure (check the red error box) | Check DB connection and column names |
| Sign-up completes but user stays on sign-up page | Clerk dashboard redirect settings override component props | Set "After sign-up URL" to `/dashboard` in Clerk Dashboard → Paths |
| Sign-up works but `/setup` never shows | `/dashboard` redirect to `/setup` isn't firing — likely a DB error being caught | Check Vercel function logs for `[dashboard] DB query failed` |
| User sees setup form but already has a workspace | DB query for user+space failed silently | This should now show an error UI (never hidden) |
| `column s.subdomain does not exist` | SQL queries using wrong column name | All queries must use `"slug"`, not `"subdomain"` |
| `DATABASE_URL environment variable is not set` | Missing env var in Vercel | Add `DATABASE_URL` in Vercel project settings |

---

## Clerk configuration checklist

These settings in the **Clerk Dashboard** affect the auth flow:

- [ ] **Paths → After sign-up URL** = `/dashboard`
- [ ] **Paths → After sign-in URL** = `/dashboard`
- [ ] **Email verification** — if enabled, the redirect fires only AFTER verification completes
- [ ] **Allowed redirect URLs** — must include your production domain

The `forceRedirectUrl` prop on `<SignUp>` and `<SignIn>` components should
override dashboard settings, but in practice Clerk dashboard settings can
take precedence. Set both to be safe.

---

## Debugging

- Visit `/api/health` to check DB connectivity and see which tables exist
- The `/dashboard` error page shows the actual SQL error (not hidden in production)
- Vercel function logs contain `[dashboard]` and `[setup]` prefixed error messages
