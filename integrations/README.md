# Cadre source integration

`cadre/` is the complete `mosnin/cadre` repository, pinned as a Git
submodule. It includes all 1,209 tracked files at the initial import: web, API,
worker, desktop, mobile, shared packages, provider adapters, infrastructure,
tests, documentation, lockfile, and Apache-2.0 license. It is not a UI recreation
or a selection of components.

Initial revision: `e7c7fbf68d15dcd2f144591a81ce4db40b96f0b3`.
Initial source tree: `71bb9a12cadbfa63dffc4d123cabe406cf999e4d`.

After cloning Chippi:

```sh
git submodule update --init --recursive integrations/cadre
git submodule status integrations/cadre
```

The parent Git commit pins the revision. Do not use `--remote` in a build: that
would silently change the runtime being reviewed. Changes to the upstream
runtime belong in an explicitly reviewed fork revision, followed by a pin update.
Preserve the source license and notices when distributing it.

Cadre is a separate pnpm monorepo with its own dependency versions, TypeScript,
Prisma migrations, build, tests, and deployment processes. Chippi's root Next.js
typecheck and lint exclude the monorepo, but import the small shared signing
protocol directly. Initialize the pinned submodule in all root build and test
jobs; execute Cadre's independent checks separately. The fork adds a signed
Chippi host adapter, permanent orchestrator, and scoped navigation while
preserving the standalone product and its provider adapters.

The authenticated Workforce client is built from the actual Cadre web app when
`CHIPPI_WORKFORCE_ENABLED=true`. Importing or building it does not deploy its
API, worker, database, screen gateway, or computer provider. See
[setup and acceptance](../docs/product-rebuild/workforce-implementation.md).

The integration design, parity inventory, and required acceptance flows are in
[the workforce integration plan](../docs/product-rebuild/cadre-workforce-integration.md).
