# Chippy Workspace Runs

Feature-off, tenant-bound Workspace Runs turn `/work` into a visible managed-workspace experience. A run creates a Listing Intelligence Packet (`brief.md`, `launch-checklist.md`, `comps.csv`, `handoff.md`) from the selected tenant's bounded CRM property context and the stated goal. It does not change CRM data, send messages, or make public-network requests.

## Enablement

All three must be true: `CHIPPI_WORKSPACE_RUNS_ENABLED=true`, `NEXT_PUBLIC_CHIPPI_WORKSPACE_RUNS_ENABLED=true`, and the target Space ID appears in `CHIPPI_WORKSPACE_RUNS_SPACE_IDS`. Keep all unset to leave production behavior unchanged.

## Private continuations

Completed workspaces may optionally be continued from the same right panel.
This is a separate allowlist: in addition to the Workspace Run switches, set
`CHIPPI_WORKSPACE_RUN_FOLLOW_UPS_ENABLED=true`,
`NEXT_PUBLIC_CHIPPI_WORKSPACE_RUN_FOLLOW_UPS_ENABLED=true`, and list the Space
ID in `CHIPPI_WORKSPACE_RUN_FOLLOW_UPS_SPACE_IDS`. The panel shows a bounded
three-command plan, live terminal callbacks, and one new private
`workspace-follow-up-N.md` artifact. Existing packet generation remains
unchanged when this switch is off.

`MODAL_WORKSPACE_RUN_TASK_URL` must target `launch_workspace_task` in the same
Modal app. Its function needs `CHIPPI_WORKSPACE_TASK_CALLBACK_URL` and
`CHIPPI_WORKSPACE_TASK_LAUNCH_CLAIM_URL`; both are signed with the existing
callback secret. Each continuation gets a fresh no-network 1 CPU / 1 GiB VM,
hydrated only with bounded private text files. The persisted task, events, and
private artifact links remain authoritative after that VM terminates.

Deploy the dedicated `agent/workspace_modal_app.py` app independently. `MODAL_WORKSPACE_RUN_URL` must target its `launch_workspace` endpoint; it authenticates and returns `202`, then starts the private runner. The worker uses a Modal VM Sandbox with `block_network=True`, no inbound ports, a 120-second timeout, 1 CPU, 1 GiB memory, a 32 KB per-file cap, and termination in `finally`. Its only input is server-prepared packet content; callback and provider credentials remain outside the Sandbox.

## Rollback

Set either public/server Workspace Run flag false: Workspace options and the right-panel tab disappear, and existing research sessions remain unchanged. Set either continuation flag false or remove a space from its continuation allowlist to hide only the continuation input; existing private artifacts remain downloadable. Cancel active base runs from the panel. The additive migrations are not reversed by this change.
