# Chippy Workspace Runs

Feature-off, tenant-bound Workspace Runs turn `/work` into a visible managed-workspace experience. A run creates a Listing Intelligence Packet (`brief.md`, `launch-checklist.md`, `comps.csv`, `handoff.md`) from the selected tenant's bounded CRM property context and the stated goal. It does not change CRM data, send messages, or make public-network requests.

## Enablement

All three must be true: `CHIPPI_WORKSPACE_RUNS_ENABLED=true`, `NEXT_PUBLIC_CHIPPI_WORKSPACE_RUNS_ENABLED=true`, and the target Space ID appears in `CHIPPI_WORKSPACE_RUNS_SPACE_IDS`. Keep all unset to leave production behavior unchanged.

Deploy the dedicated `agent/workspace_modal_app.py` app independently. `MODAL_WORKSPACE_RUN_URL` must target its `launch_workspace` endpoint; it authenticates and returns `202`, then starts the private runner. The worker uses a Modal VM Sandbox with `block_network=True`, no inbound ports, a 120-second timeout, 1 CPU, 1 GiB memory, a 32 KB per-file cap, and termination in `finally`. Its only input is server-prepared packet content; callback and provider credentials remain outside the Sandbox.

## Rollback

Set either public/server flag false: Workspace options and the right-panel tab disappear, and existing research sessions remain unchanged. Cancel active runs from the panel. The additive migration is not applied by this change.
