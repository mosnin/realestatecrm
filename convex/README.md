# Chippi follow-up execution pilot

Supabase owns customer data, permissions, integration credentials and routine schedules.
Convex owns only the selected routine's execution jobs. See
`docs/product-rebuild/convex-follow-up-pilot.md` for setup and acceptance.

No browser-readable functions or duplicate authentication system are introduced.
HTTP actions use service authentication; the existing Clerk-authenticated Next.js
endpoint scopes status reads to the current Supabase workspace.

`_generated` currently contains typed bootstrap bindings because this account requires
project creation through Vercel. After linking a deployment, run `pnpm exec convex dev --once`
to replace them with Convex-generated bindings and deploy the functions.
