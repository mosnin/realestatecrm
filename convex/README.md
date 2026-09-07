# Chippi follow-up execution pilot

Supabase owns customer data, permissions, integration credentials and routine schedules.
Convex owns only the selected routine's execution jobs. See
`docs/product-rebuild/convex-follow-up-pilot.md` for setup and acceptance.

No browser-readable functions or duplicate authentication system are introduced.
HTTP actions use service authentication; the existing Clerk-authenticated Next.js
endpoint scopes status reads to the current Supabase workspace.

The production backend is deployed to `charming-armadillo-315`. `_generated` now contains official Convex CLI bindings. Run `pnpm exec convex codegen` after backend changes and deploy to the explicitly selected environment. See `docs/product-rebuild/deployment-and-role-audit-2026-09-07.md` for the verified configuration and web-release gap.
