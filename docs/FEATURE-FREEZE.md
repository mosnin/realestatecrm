# Feature freeze until Gates 1–3 are green

Do not enable these in production to look complete. Code may be merged;
rollout flags stay off. See `docs/PROD-STATE.md`.

## Stay default-off

| Feature | Flags / gate | Why |
|---|---|---|
| Research Workspace / headless browser | `CHIPPI_RESEARCH_WORKSPACE_*` + space allowlist | `docs/BROWSER-CONTROL.md` — not activated on live `chippi` |
| Managed Workspace Runs | `CHIPPI_WORKSPACE_RUNS_*` | `docs/chippy-workspace-runs.md` |
| Workbench | `NEXT_PUBLIC_CHIPPI_WORKBENCH_ENABLED` | Spreadsheet surface |
| Studio | `NEXT_PUBLIC_CHIPPI_STUDIO_ENABLED` | Paused — default off. Implementation and tables stay; flag restores the surface |
| Realtime voice + floor manager | `REALTIME_VOICE_GATEWAY_ENABLED`, `CHIPPI_REALTIME_VOICE_FLOOR_MANAGER_ENABLED` | Server-controlled beta |
| Durable schedule occurrences | `DURABLE_SCHEDULE_OCCURRENCES_ENABLED` | Construction-only — no executor |
| Account hard-delete | `ACCOUNT_DELETION_HARD_DELETE` | Needs `docs/DATA-DELETION.md` sign-off |
| Chrome Web Store extension | store listing | `debugger` + `<all_urls>` — extended review |
| Inngest cron mirrors | `INNGEST_CRONS_ENABLED` | Double-fires with the Worker |
| Team / Team Plus billing expansion | Team signup is advertised in the current UI; live checkout is unverified | Require seat and annual add-on receipts before expanding rollout |

## Coming soon (honest)

Compass, BoomTown, Real Geeks — `COMING_SOON_TOOLKITS` in
`lib/integrations/catalog.ts`. kvCORE and Follow Up Boss are native
API-key connects, not coming soon.

Workflow **Wait / Delay** is hidden from the add-step picker. Existing
delay steps halt the run instead of skipping the wait. Starter templates
that used to insert a delay now use `schedule_message` (the working
deferred-message path: sends when authorized, drafts when configured). Async resumption of a mid-workflow wait is Phase 5.

## After Gates 1–3 (order)

1. Team billing that cannot under-bill (`isAnnualAvailable`, seat reconcile)
2. FUB + kvCORE sync quality
3. Real workflow delays
4. Research Workspace canary — `docs/RELEASE.md` steps 3–5, isolated Modal app
5. In-app i18n (marketing is already ahead)
6. Hard-delete on

Non-goals until demand: voice floor manager, swarm, Chrome Store, customer
MCP, more Composio logos.
