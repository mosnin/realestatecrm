# Routing contract: onboarding + intake

## Canonical onboarding completion

A user is considered onboarded **only** when they have a `Space` row linked to their user record.

- `User.onboardingCompletedAt` is metadata only.
- If `Space` exists and timestamp is null, we backfill timestamp for legacy consistency.
- If timestamp exists but `Space` is missing, onboarding is treated as incomplete.

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
