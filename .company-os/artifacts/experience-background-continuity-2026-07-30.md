# Experience Contract — Durable Background Specialist Launch

## User journey

1. From an existing authenticated Chippi conversation, the user asks Chippi to delegate a substantial bounded task.
2. Chippi immediately persists one authoritative specialist run and shows its complete planned tree.
3. The launch boundary returns a short receipt for that exact run; it does not wait for model completion.
4. The user can continue chatting, navigate away, close the browser, or reload.
5. Reopening the conversation hydrates the same run and its member progress from durable state.
6. Ambiguous network loss triggers same-run reconciliation, never a second run and never a false terminal failure.
7. If launch acceptance cannot be proven within a bounded window, a reconciler records a truthful recoverable failure or safely retries the same launch attempt under idempotency.
8. Cancellation remains authoritative over late worker completion.
9. The final combined result appears in the original conversation tree.

## Acceptance conditions

- No application or Modal request remains open for model completion.
- A durable launch-attempt receipt binds tenant, conversation, run, attempt, and idempotency identity.
- Duplicate delivery cannot create duplicate model work.
- Provider/database initialization failure cannot strand a run indefinitely in `queued`.
- Unknown transport outcomes remain unknown until reconciled.
- Reload recovers the same tree and combined result.
- One forced crash-after-acceptance test, one lost-response retry test, one duplicate-delivery test, and one cancellation/completion race test pass.
- An independent reviewer accepts the complete vertical slice.
- Activation remains off until a non-customer authenticated runtime demonstrates the journey.

## Rollback

Keep the legacy feature-off path available. Disabling the new launch/reconciler flag stops new durable launch attempts without deleting run/event history. Existing accepted runs remain readable.

