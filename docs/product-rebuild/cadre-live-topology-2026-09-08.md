# Cadre live topology compared with Chippi

## Verified evidence

Render reports the existing Cadre runtime deployment live at source revision `e7c7fbf68d15dcd2f144591a81ce4db40b96f0b3`. Its public health endpoint returned `ok=true`, `runtime=pi`, `sandbox=fly`, `jobs=graphile`, `realtime=postgres`, `composio=true`, `pipedream=false`, and `messaging=false`.

The Chippi Cadre pin `60d2307fa846635ce94d8c96f75557eca0b876d3` contains that entire revision plus the hosted Chippi adapter and browser coverage commits. No upstream runtime update is needed to reach the observed deployed source.

The committed standalone and Chippi Render blueprints, plus the cloud-workforce guide, still specify Modal. They do not describe the active sandbox provider. Do not provision the Chippi Modal blueprint as if it reproduced live Cadre.

## Exact implementation paths

All paths below are relative to `integrations/cadre`.

| Concern | Cadre implementation | Chippi deployment consequence |
| --- | --- | --- |
| API and worker | `infra/render-start.mjs` supervises both long-lived processes; either child exiting stops the service | Retain this composition on a dedicated Render service |
| Durable jobs and events | `apps/worker/src/index.ts` composes Graphile and Postgres realtime | Use a dedicated operational PostgreSQL database |
| Shared computer | `packages/db/src/computers.ts` upserts one computer by `team:<spaceId>` in team mode | Share within the verified Chippi workspace, preserving brokerage role boundaries |
| Persistent VM | `packages/adapters/src/fly-sandbox.ts` requests 2 shared CPUs, 4096 MB, restart always, autostop off, and an encrypted home volume at `/home/rakazo` | Use Fly, with app/token/image/region configuration, rather than Modal credentials |
| Recovery | Fly adapter reuses owned machines/volumes, starts stopped machines, and flushes the persistent home | Retain the durable volume; verify replacement/restart rather than assuming session continuity |
| Separate agent screens | `packages/adapters/src/computer-screens.ts` uses bot identity for screen session keys; `infra/modal/screens.py` is also included in the Fly image | Keep the original shared-machine, separate-screen implementation |
| Shared browser | `infra/fly/start.sh` enables shared browser sessions and resumes sessions; `infra/modal/browser_sessions.py` ships in the Fly image | Retain the original session broker and image build |
| Artifacts | `packages/adapters/src/cloud-storage.ts` provides durable home/artifact stores; `infra/cloudflare/worker.ts` serves R2 objects | Provision isolated Chippi storage and gateway secrets |
| Screen gateway | Cloudflare worker verifies signed capabilities and currently explicitly allows the original Fly hostname | A separate Chippi Fly app needs an exact configured host allowance before its screens will work; do not broaden to arbitrary hosts |
| Model execution | Worker composes Pi and resolves the deployment model | Verify configured provider/model independently; health reports runtime type, not a successful model call |
| Integrations | Live health enables Composio, disables Pipedream and messaging | Do not advertise enabled inbound messaging or infer all provider functionality from preserved source |

## Next deployment steps

Use the existing Cadre implementation unchanged wherever possible. Correct Chippi deployment configuration to Fly, provide an isolated Fly app/image and persistent volumes, dedicated Render runtime/Postgres, and isolated Cloudflare storage/screen gateway. Retain Chippi authentication, protected orchestrator identity, and role-scoped authority adapter. The user confirmed the Render workspace; no new resources were created during this source/live comparison.

Before enabling the customer-facing toggle, exercise a real orchestrator with two workers, shared files and separate screens, a restart/recovery, stop/steer, and role revocation. A health response establishes configuration and reachability only; it does not prove these workflows.
