# Slug rollout checklist (deploy-safe)

## Why this rollout is safe

- Runtime uses `Space.slug` everywhere.
- Database stays physically on column `Space.subdomain` via Prisma mapping (`slug @map("subdomain")`).
- This avoids destructive column renames and avoids deploy windows where old/new app versions disagree on DB column names.

## Static verification before deploy

1. `node scripts/verify-routing-intake-regressions.mjs`
2. `pnpm exec tsc --noEmit` (or record blockers if Prisma engine download is blocked)
3. `pnpm exec prisma generate` and `pnpm exec prisma validate` (if engine download allowed)

## Runtime smoke verification

Run app locally or in preview, then:

```bash
BASE_URL=https://<preview-or-local-url> SLUG=<known-workspace-slug> node scripts/smoke-slug-flow.mjs
BASE_URL=https://<preview-or-local-url> SLUG=<known-workspace-slug> SMOKE_SUBMIT=1 PHONE=+15555550123 node scripts/smoke-slug-flow.mjs
```

## Production rollout order (Vercel)

1. Ensure env vars are present for app + Prisma + auth.
2. Run static checks and smoke checks on preview.
3. Deploy app revision.
4. Perform post-deploy manual QA for onboarding routing, dashboard routing, intake link copy/preview, and public intake submission.
5. Monitor logs (`[onboarding-guard]`, `[apply]`) for 4xx/5xx spikes.

## Backout

- Re-deploy last known good app revision.
- Since DB column remains `subdomain` physically, rollback does not require schema rollback for this change set.
