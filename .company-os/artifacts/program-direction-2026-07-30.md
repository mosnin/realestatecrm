# Chippi Frontier Program Direction — 2026-07-30

## Current outcome

Deliver durable background specialist launch continuity: an authenticated user can start one authoritative specialist run, continue chatting or leave, and later recover the same run and result without duplicate work, stranded `queued` state, or a launch request held open for model completion.

## Success metric

One independently accepted, feature-off vertical slice proves all of the following:

- a short accepted/queued receipt for the exact authoritative run;
- a durable launch-attempt record;
- bounded same-run reconciliation after ambiguous transport loss;
- no duplicate model execution under duplicate delivery or retry;
- no indefinite `queued` state after provider/database initialization failure;
- reload-visible member progress and combined result;
- cancellation wins over late completion;
- focused fault tests and a disposable-database concurrency test pass;
- the accepted product and evidence commits are recorded in the program ledger.

## Constraints

- No production deployment, customer data, provider billing, outbound communication, privilege change, or Vercel build.
- Additive and default-off changes only.
- One implementation owner and one different reviewer.
- Existing paying-user behavior remains compatible.
- A missing live dependency remains NO-GO rather than inferred success.

## Non-goals for this outcome

- Voice redirect/retry/spawn.
- General unrestricted shell access.
- Broad chat or sidebar redesign.
- Scheduler, webhook, or infrastructure hardening unrelated to the user journey.
- Production activation.

