# Chippi Product Reality Audit — 2026-07-30

## Verified product state

- Chippi is an established, paying-customer real-estate operating workspace. This program is not authorized to change production, customer data, privileges, billing, outbound communication, or deployment state.
- The accepted local product baseline is `90003e32d1daf91b4707a06ae7fac4284c89e72f`, with ledger receipt `8b1f5e83`.
- Four material capabilities are accepted locally:
  1. a fixed, server-validated Workspace interpreter that produces grounded Markdown, CSV, and JSON artifacts;
  2. a persisted 2–6-member specialist tree with bounded depth, truthful progress/results, reload continuity, and cancellation;
  3. a completed Workspace CSV → editable Workbench journey with cell editing, immutable source, version history, and XLSX export;
  4. Realtime Voice coarse specialist status and explicit conversation-bound cancellation.
- All four remain feature-off or activation-gated. The specialist Modal launch still holds the request open for the full model run and lacks durable launch-attempt receipts and bounded stale-run reconciliation.
- The latest background-launch cycle was rejected and removed because a Modal acceptance followed by database-initialization loss could strand an authoritative run in `queued`.

## Verified operating-system state

- The former 25-minute automation used a shared prompt, automation memory, and product ledger but no project `.company-os` instance, lease, certification, or project scorecard.
- Eleven recent Chippi automation tasks were visible at audit time: one active, six idle, two `systemError`, and two not loaded.
- Overlapping wake ownership caused multiple cycles to stop before work; that stop behavior protected the checkout but consumed time and tokens.
- The loose cron has been paused before this instance was created.
- The Elastic Company OS controller itself passes 42 unit tests, but its project audit previously failed because no Chippi instance existed.

## Access and evidence limits

- No production or customer runtime was inspected or changed.
- No live Modal, Realtime provider, browser microphone, customer database, or production queue behavior is claimed.
- Several migrations remain unapplied outside disposable validation.
- The connected research-database lookup repeatedly returned `INVALID_ARGUMENT`; no raw database fallback was attempted.
- Historical cost and token totals are unavailable, so prior cost efficiency is unknown rather than green.

## Decision impact

The next program outcome is not another isolated feature or hardening pass. It is durable background launch continuity: a user starts a specialist task, continues chatting or leaves, and later recovers the same authoritative run without duplicate work, stranded `queued` state, or a request held open for model completion.

