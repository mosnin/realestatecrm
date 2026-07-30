# Chippi Background Continuity — Independent Experience Review

## Decision

REJECT at the experience gate. The lower independent score is **4.8/10** against
the required **9/10**. This is a governance result, not a production-runtime
claim.

Two independent reviewers assessed the current primary outcome:
`durable-background-specialist-launch-v1`. Both found that the product direction
is coherent, but the outcome has not been delivered or demonstrated. The
controller must remain paused.

## Governed scores

The lower score is used whenever the reviewers differ.

| Dimension | Score | Evidence-based reason |
|---|---:|---|
| accessibility | 1 | No keyboard, screen-reader, focus, contrast, mobile, or authenticated-browser evidence. |
| brand_cohesion | 2 | The Chippi product thesis is coherent, but this outcome has no captured visual or brand review. |
| differentiation | 7 | Durable continuity is stronger than a request-bound tool wrapper, but lacks competitive and customer validation. |
| domain_fit | 5 | The surrounding product is real-estate specific; this outcome has no demonstrated brokerage workflow. |
| evidence_integrity | 7 | Evidence boundaries are explicit, but delivery, verification, runtime, and customer proof are absent. |
| information_architecture | 5 | The planned journey is clear on paper; navigation and discoverability are unobserved. |
| innovation | 6 | The outcome enables frontier behavior, but is currently an unproven reliability prerequisite. |
| interaction_quality | 4 | No human interaction, measured latency, recovery-copy, or browser evidence. |
| north_star_alignment | 8 | It directly addresses background continuity, but is only one prerequisite for the agentic workspace promise. |
| product_coherence | 7 | The task graph is the correct shared spine; the vertical slice is not delivered. |
| usability | 4 | The intended flow removes a real problem, but no task-completion evidence exists. |
| user_value | 6 | Leave/reload continuity is valuable in principle, but has not been demonstrated to a user. |
| visual_quality | 1 | No screenshot, prototype, responsive review, or browser QA exists for this outcome. |

## Required remediation

1. Implement the feature-off durable launch receipt and bounded stale-run
   reconciler that closes the accepted-launch-before-worker-start crash window.
2. Prove the database contract under duplicate delivery, timeout, worker crash,
   stale lease, cancellation, replay, and concurrent reconciliation.
3. Run one authenticated non-customer browser journey:
   launch specialist → return to chat → leave/reload → reconcile the same run →
   cancel safely.
4. Capture the actual interface and independently review accessibility,
   responsive behavior, interaction copy, motion, and brand cohesion.
5. Measure launch acceptance latency, reconciliation latency, cost, token usage,
   duplicate-effect count, and user-visible completion.

No recurring scheduler may resume before those results are recorded, rescored,
and independently certified.

## Operating adaptation

The reviewers accept `adaptation-single-controller-v1` only as a bounded manual
experiment:

- one project instance;
- one fenced controller;
- one primary outcome;
- the loose recurring automation remains paused;
- every cycle records time, cost, tokens, evidence, and reviewer decision;
- collision, system error, incomplete receipt, or false progress triggers
  rollback;
- recurring scheduling remains blocked until an externally protected launcher
  can enforce issuer and scheduler authority outside the local controller.
