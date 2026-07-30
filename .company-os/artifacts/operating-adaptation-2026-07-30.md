# Operating Adaptation Proposal — Replace Loose Cron Fan-Out

## Failure pattern

The prompt-and-memory cron created separate tasks without a project Company OS instance or fenced controller lease. Eleven recent tasks included two system errors, and overlapping ownership caused at least two wakes to stop. The safety stop worked, but the operating model wasted time and tokens and could not measure cost per accepted capability.

## Hypothesis

A project-scoped state machine with one primary outcome, one fenced lease, explicit cycle receipts, and an exception scorecard will prevent duplicate ownership and make cost/value drift visible without weakening customer or production boundaries.

## Smallest reversible experiment

1. Pause the loose cron.
2. Initialize the Chippi project instance.
3. Bind reality, direction, experience, and scorecard artifacts by hash.
4. Keep scheduler readiness false until the protected launcher/issuer prerequisite is independently satisfied.
5. Forward-test one manually initiated governed cycle before proposing any recurring schedule.

## Success metrics

- Zero overlapping controller leases.
- Zero system-error wakes during the forward test.
- Exactly one primary capability.
- Every completed cycle records elapsed time, token usage, cost, accepted movement, reviewer, and evidence digest.
- A rejected cycle leaves work active or records an explicit stop; it never advances the product baseline.

## Rollback

Cancel the project instance, keep the cron paused, preserve its events and artifacts, and continue only through an explicitly user-directed bounded task.

