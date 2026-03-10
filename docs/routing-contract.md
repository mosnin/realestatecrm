# Routing contract: onboarding + intake

## Canonical onboarding completion

A user is considered onboarded **only** when `User.onboard === true`.

- `User.onboard` is the canonical source of truth for onboarding state.
- Workspace existence is used only for one-way legacy backfill (`onboard=false && space exists` -> set `onboard=true`).
- `onboardingCompletedAt` is metadata only.

This contract is implemented in `lib/onboarding.ts` and used by:

- `app/dashboard/page.tsx`
- `app/onboarding/page.tsx`
- `app/s/[slug]/layout.tsx`
- `app/api/onboarding/route.ts`

## Canonical intake URL format

Chippi intake links are **always path slugs**:

- ✅ `https://<root-domain>/apply/<slug>`
- ❌ `https://<slug>.<root-domain>`

This contract is implemented in `lib/intake.ts`.


## Workspace identity rule (hard constraint)

Chippi does **not** use tenant subdomains.

- Workspace identity is the `slug` field on `Space`.
- Routing identity comes only from path params (`/s/:slug`, `/apply/:slug`).
- Identity must never be inferred from host headers, hostname, or subdomain parsing.

## Storage mapping note

Runtime uses `Space.slug`. For deploy safety, the Prisma model maps this field to the existing DB column via `@map("subdomain")`.

This keeps runtime slug-only while avoiding destructive column renames during rollout.
