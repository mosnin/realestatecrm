# Chippy Frontier Requirements-to-Tests Traceability

Evidence is local only unless explicitly marked otherwise. No row implies production verification.

| Requirement | Implementation evidence | Test evidence | Status |
|---|---|---|---|
| Explicit unattended pure-read allowlist | `lib/agent/unattended-tool-policy.ts`; Work Session integration | `tests/lib/unattended-tool-policy.test.ts` | locally verified for TS Work Sessions only |
| Typed proposal output | `lib/agent/action-proposal.ts`; migration table | `tests/lib/action-proposal.test.ts` | contract verified; persistence unrun |
| Signed run mode/capabilities | `lib/agent/run-policy.ts` | `tests/lib/run-policy.test.ts` | primitive verified; caller propagation missing |
| Deny side effects for signed unattended run | integration/message routes | integration and team-message run-policy route tests | locally verified at both modified TypeScript endpoints; Python caller propagation missing |
| Missing Redis is dependency failure | Composio receiver + Inngest handler | webhook/Inngest trigger tests | locally verified |
| Configured Redis failure releases claim | Composio receiver | webhook rejection tests | locally verified; process-kill window remains |
| Failed autonomous trigger is retried/DLQed | `dispatchTrigger` throws; Inngest catch marks failed/rethrows | integration trigger + Inngest tests | locally verified |
| Workflow failure not reported as success | workflow cron counts returned failure as error | cron workflow tests | locally verified |
| Workflow schedule does not advance on failure | deferred until occurrence + step idempotency | none | open/no-go |
| Durable job authority | additive `AgentJobRun` migration | independent review only | unrun/no-go |
| Atomic lease/heartbeat/terminal transition | migration RPCs | disposable DB tests required | unrun/no-go |
| Ordered run events | `eventSequence` + append RPC | contention tests required | unrun/no-go |
| Parent-child task hierarchy | migration parent FK/depth + TS policy | delegation policy tests | policy verified; DB unrun |
| No privilege escalation | DB capability subset/inherited-denial guard; TS derivation | delegation tests + DB negative fixtures required | partial |
| Bounded autonomous loop | `lib/agent/autonomous-loop.ts` | `tests/lib/autonomous-loop.test.ts` | pure policy verified; worker wiring missing |
| Cancellation/stop/anti-loop | loop policy + schema cancellation fields | loop tests; worker fault tests required | partial |
| Secure sandbox capabilities | architecture plan only | isolation tests required | designed only |
| Browser-independent continuation | durable schema only | process-kill/reopen test required | designed only |
| Modern server-managed Realtime voice | architecture plan; existing direct-token route identified as obsolete | official-doc review only | not implemented/no-go |
| Voice can manage scoped child tasks | delegation policy + planned gateway control tools | voice/task synthetic E2E required | designed only |
| Provider credentials never reach browser | target gateway decision | runtime/network inspection required | existing route violates target; no-go |
| OpenRouter multi-model routing preserved | no routing changes in this slice | existing model-routing tests not rerun in focused set | source-preserved |
| Prompt caching measured, not assumed | existing cache seams identified | cache A/B harness required | open |
| Backward-compatible rollout | additive migration; shadow policy flag; existing UI untouched | regression suite + flag matrix required | partial |
| Quality gate ≥9 critical/security clear | quality matrix | final re-audit | no-go |
