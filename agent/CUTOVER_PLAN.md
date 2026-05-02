# Cutover plan — delete custom loop, default to SDK runtime

Read-only audit. Lens: Musk. The deletion target is ~1,051 lines across five files (`loop.ts` 447, `continue-turn.ts` 269, `execute.ts` 212, `openai-format.ts` 90, `openai-client.ts` 33). The cutover commit also flips `chatRuntime()` default to `'ts'` and decides the fate of the modal proxy branch.

The plan: most consumers die with the loop. The exceptions are `openai-client.ts` (used by 4 unrelated callers — agent memory embeddings, chippi-voice titler, contact parser, post-tour) and `execute.ts` (used by post-tour `/execute`). Both must be relocated, not deleted. Everything else goes.

---

## 1. Custom-loop import map

| Custom-loop file | Consumer file | Imported symbols | Cutover action |
|---|---|---|---|
| `lib/ai-tools/loop.ts` | `lib/ai-tools/continue-turn.ts` | `runTurn`, `summarisePendingCall`, types `DeferredToolCall`, `PendingApprovalState`, `RunTurnOutput` | **DELETE_TOO** |
| `lib/ai-tools/loop.ts` | `lib/ai-tools/pending-approvals.ts` | type `PendingApprovalState` | **DELETE_TOO** (Redis approval cache only matters to the legacy approve route — the SDK uses `AgentPausedRun` rows) |
| `lib/ai-tools/loop.ts` | `tests/lib/ai-tools-loop.test.ts` | `runTurn` | **DELETE_TOO** |
| `lib/ai-tools/loop.ts` | `tests/lib/ai-tools-continue-turn.test.ts` | type `PendingApprovalState` | **DELETE_TOO** |
| `lib/ai-tools/continue-turn.ts` | `app/api/ai/task/approve/[requestId]/route.ts` | `continueTurn` | **DELETE_TOO** (route is already marked DEPRECATED in its own header — the new approval flow is `/api/ai/task/resume/[pausedRunId]`) |
| `lib/ai-tools/continue-turn.ts` | `tests/lib/ai-tools-continue-turn.test.ts` | `continueTurn` | **DELETE_TOO** |
| `lib/ai-tools/execute.ts` | `lib/ai-tools/loop.ts` | `executeTool`, `executionToModelMessage` | **DELETE_TOO** (loop dies) |
| `lib/ai-tools/execute.ts` | `lib/ai-tools/continue-turn.ts` | `executeTool`, `executionToModelMessage` | **DELETE_TOO** |
| `lib/ai-tools/execute.ts` | `lib/ai-tools/skills/run-sub-agent.ts` | `executeTool`, `executionToModelMessage` | **DELETE_TOO** (custom skills directory dies — see §5) |
| `lib/ai-tools/execute.ts` | `app/api/chippi/post-tour/execute/route.ts` | `executeTool` | **MIGRATE_TO_SDK** — relocate `executeTool` (and `executionToModelMessage` if needed) into a smaller surviving module, e.g. `lib/ai-tools/run-tool.ts`, OR keep `execute.ts` as the surviving home and only delete its loop callers. Post-tour invokes tools imperatively without a model in the loop; the SDK's `Agent.run()` is the wrong fit. Simplest: keep `execute.ts` alive, delete only the four genuinely-loop files. |
| `lib/ai-tools/execute.ts` | `tests/lib/ai-tools-execute.test.ts` | `executeTool`, `executionToModelMessage` | **KEEP_USING** if `execute.ts` survives; **DELETE_TOO** otherwise |
| `lib/ai-tools/openai-format.ts` | `lib/ai-tools/loop.ts` | `allToolsForOpenAI` | **DELETE_TOO** |
| `lib/ai-tools/openai-format.ts` | `lib/ai-tools/skills/run-sub-agent.ts` | `allToolsForOpenAI` | **DELETE_TOO** |
| `lib/ai-tools/openai-format.ts` | `tests/lib/ai-tools-openai-format.test.ts` | `toolToOpenAIFormat`, `allToolsForOpenAI` | **DELETE_TOO** |
| `lib/ai-tools/openai-format.ts` | `tests/lib/ai-tools-skills.test.ts` | mock target only (`vi.mock('@/lib/ai-tools/openai-format')`) | **DELETE_TOO** (skills test dies with the skills dir) |
| `lib/ai-tools/openai-client.ts` | `lib/ai-tools/loop.ts` | `AGENT_MODEL` | **DELETE_TOO** |
| `lib/ai-tools/openai-client.ts` | `lib/ai-tools/skills/run-sub-agent.ts` | `AGENT_MODEL` | **DELETE_TOO** |
| `lib/ai-tools/openai-client.ts` | `lib/ai-tools/tools/delegate-to-subagent.ts` | `getOpenAIClient` | **DELETE_TOO** if `delegate-to-subagent.ts` is removed (see §5); otherwise **MIGRATE_TO_SDK** |
| `lib/ai-tools/openai-client.ts` | `lib/ai-tools/chippi-voice.ts` | `getOpenAIClient` (dynamic import inside `computeConversationTitle`) | **MIGRATE_TO_SDK** — relocate the helper or keep `openai-client.ts` alive. It's 33 lines; deleting it for cleanliness costs more than it saves. |
| `lib/ai-tools/openai-client.ts` | `lib/agent-memory/embed.ts` | `getOpenAIClient` | **MIGRATE_TO_SDK** — same as above. Embeddings path is unrelated to chat runtime. |
| `lib/ai-tools/openai-client.ts` | `app/api/ai/task/approve/[requestId]/route.ts` | `getOpenAIClient`, `MissingOpenAIKeyError` | **DELETE_TOO** (route dies with the legacy approve flow) |
| `lib/ai-tools/openai-client.ts` | `app/api/contacts/parse/route.ts` | `getOpenAIClient`, `AGENT_MODEL`, `MissingOpenAIKeyError` | **MIGRATE_TO_SDK** — keep the file or rename + relocate. Contact parser is independent of chat. |
| `lib/ai-tools/openai-client.ts` | `app/api/chippi/post-tour/route.ts` | `getOpenAIClient`, `MissingOpenAIKeyError` | **MIGRATE_TO_SDK** — same reasoning. |
| `lib/ai-tools/openai-client.ts` | `tests/api/post-tour.test.ts` | mock target | **MIGRATE_TO_SDK** path |
| `lib/ai-tools/openai-client.ts` | `tests/lib/agent-memory.test.ts` | mock target | **MIGRATE_TO_SDK** path |

**Decision.** The cleanest cut is: delete `loop.ts`, `continue-turn.ts`, `openai-format.ts`. **Keep** `execute.ts` and `openai-client.ts` — they are non-chat infrastructure that happen to live in the `ai-tools/` directory. Renaming them later is fine; ripping them out in this commit is unnecessary scope.

**Net deletion: 3 of 5 files (~806 lines).** The brief says "delete five files" but two of them have legitimate non-chat consumers. Don't break the contact parser to satisfy a round number.

---

## 2. Test-file impact

| Test file | Decision | Reason |
|---|---|---|
| `tests/lib/ai-tools-loop.test.ts` | **DELETE** | Tests the deleted `runTurn`. SDK behavior is covered by `tests/api/sdk-chat.test.ts` and `tests/lib/sdk-event-mapper.test.ts`. |
| `tests/lib/ai-tools-continue-turn.test.ts` | **DELETE** | Tests the deleted `continueTurn`. SDK approval flow is covered by `tests/api/sdk-chat-resume.test.ts`. |
| `tests/lib/ai-tools-execute.test.ts` | **KEEP** | If `execute.ts` survives, the test does too. Validates rate-limit + zod-error paths that post-tour still relies on. |
| `tests/lib/ai-tools-openai-format.test.ts` | **DELETE** | Tests the deleted JSON-schema converter. The SDK does its own conversion via `toSdkTool`. |
| `tests/lib/ai-tools-skills.test.ts` | **DELETE** | Tests `runSubAgent` (custom router). SDK uses `Agent.asTool()` — see §5. |
| `tests/lib/ai-tools-phase5.test.ts` | **KEEP** | Doesn't touch the custom loop; it covers individual mutating tools (`schedule_tour`, `move_deal_stage`, etc.) which the SDK runtime still calls. |
| `tests/lib/ai-tools-pending-approvals.test.ts` | **DELETE** | Redis-backed pending-approval store only feeds the legacy approve route. The SDK uses `AgentPausedRun`. |

---

## 3. The default-flag flip

`lib/ai-tools/runtime-flag.ts:17` reads `process.env.CHIPPI_CHAT_RUNTIME` and returns `'ts'` only on exact match, else `'modal'`. After cutover, invert: default `'ts'`, opt-in `'modal'` (or remove the modal value entirely — see §4).

**Hard-coded `CHIPPI_CHAT_RUNTIME=modal` references found:**

- None in `.env.example`, `ENVIRONMENT.md`, `.github/`, `vercel.json`, `fly.toml`, or any deploy config. The flag is implicit — production runs whatever the default is.
- Tests set the env var explicitly per case (`tests/api/sdk-chat.test.ts:185`, `tests/api/sdk-chat-resume.test.ts:133`, `tests/lib/runtime-flag.test.ts:38, 50`). These continue to work as written because they explicitly set the value; the cutover should update `tests/lib/runtime-flag.test.ts` to reflect the new default-`'ts'` semantics.

**Action:** flip the function body in `runtime-flag.ts`, update the `runtime-flag.test.ts` assertions for the default and unset cases. No production env change required.

---

## 4. The Modal proxy fate

**Recommendation: (b) DELETE the modal branch in this cutover.**

The Modal proxy is 200+ lines of SSE-translation code (`parseModalSSE`, `translate`, `tryParseFrame`, the cold-start timer, the sandbox event types) that exists exclusively to map a Python sandbox runtime we're abandoning. Keeping it as a fallback means committing to maintaining two divergent chat paths through the next stability window — that's exactly the kind of "wrap more abstraction around a third-party" we should refuse. If the SDK runtime fails in production, the right rollback is `git revert`, not a flag flip to a path we never re-tested. Delete it now.

---

## 5. The sub-agent skill router fate

`lib/ai-tools/skills/` exists for the custom loop. The SDK uses `Agent.asTool()` — already wired in `lib/ai-tools/sdk-skills.ts`. Nothing else imports the custom skills directory.

**What dies:**
- `lib/ai-tools/skills/registry.ts` — replaced by `sdk-skills.ts`
- `lib/ai-tools/skills/run-sub-agent.ts` — replaced by `Agent.asTool()`
- `lib/ai-tools/tools/delegate-to-subagent.ts` — replaced by SDK handoff tools
- `tests/lib/ai-tools-skills.test.ts`

**What stays:**
- `lib/ai-tools/skills/contact-researcher.ts` and `lib/ai-tools/skills/pipeline-analyst.ts` — only if their `systemPrompt` strings are still referenced by `sdk-skills.ts`. **Verify.** If `sdk-skills.ts` re-defines the prompts inline, the whole `skills/` directory dies.
- `lib/ai-tools/skills/types.ts` — only if `validateSkill` or `Skill` is imported anywhere outside the dying registry. Grep says no — so it dies too.

**Action: nuke the entire `lib/ai-tools/skills/` directory.** Move the two sub-agent system prompts into `sdk-skills.ts` if they aren't already there.

Also remove `delegateToSubagentTool` from `lib/ai-tools/tools/delegate-to-subagent.ts` (and its mention in `lib/ai-tools/tools/index.ts` — though it's already excluded from `ALL_TOOLS` per the comment at line 93-100). The orchestrator's `delegate_to_subagent` tool is registered via `lib/ai-tools/registry.ts`; that wiring also dies.

---

## 6. The cutover step list

Order matters. Each step's risk is what breaks if the step is wrong.

1. **Update `lib/ai-tools/runtime-flag.ts`** — flip default to `'ts'`. Risk: if not flipped first, step 12 (deleting the modal branch) leaves no chat runtime active in prod.
2. **Update `tests/lib/runtime-flag.test.ts`** — invert assertions for unset / `''` / unknown values. Risk: CI red.
3. **Update `app/api/ai/task/route.ts`** — remove the modal branch (everything from `const modalUrl = process.env.MODAL_CHAT_URL` through the final `controller.close()`), the `parseModalSSE`/`translate`/`tryParseFrame` helpers, sandbox event types, the `chatRuntime() === 'ts'` gate (now unconditional). Risk: stripping too much (e.g. the `coldStartTimer` is modal-only; the rate-limit/auth/history/attachment block stays).
4. **Delete `app/api/ai/task/approve/[requestId]/route.ts`** — the legacy approve route. Risk: any client still POSTing to this URL gets 404. Audit `components/` for callers; the SDK path uses `/api/ai/task/resume/[pausedRunId]` instead.
5. **Delete `lib/ai-tools/pending-approvals.ts`**. Risk: import error if step 4 missed something.
6. **Delete `tests/lib/ai-tools-pending-approvals.test.ts`**. Risk: vitest red.
7. **Delete `lib/ai-tools/tools/delegate-to-subagent.ts`** and remove any registry entries that reference it (check `lib/ai-tools/registry.ts`). Risk: `delegate_to_subagent` tool calls in the model's vocabulary now miss; the SDK's `asTool()` handoffs cover the use case but the system prompt may still mention the old name.
8. **Delete `lib/ai-tools/skills/`** — entire directory. Risk: `sdk-skills.ts` may import from `./skills/contact-researcher` or `./skills/pipeline-analyst` for prompt strings; verify and inline before deleting.
9. **Delete `tests/lib/ai-tools-skills.test.ts`**. Risk: none beyond test-file count.
10. **Delete `lib/ai-tools/continue-turn.ts`**. Risk: should be clean after step 4.
11. **Delete `tests/lib/ai-tools-continue-turn.test.ts`**. Risk: none.
12. **Delete `lib/ai-tools/loop.ts`**. Risk: `pending-approvals.ts` (already gone in step 5) and `continue-turn.ts` (gone in step 10) were the type-only consumers; clean.
13. **Delete `tests/lib/ai-tools-loop.test.ts`**. Risk: none.
14. **Delete `lib/ai-tools/openai-format.ts`**. Risk: clean — only loop and skills used it.
15. **Delete `tests/lib/ai-tools-openai-format.test.ts`**. Risk: none.
16. **Audit `lib/ai-tools/system-prompt.ts`** — the `delegate_to_subagent` directive is dead text after step 7. Strip or rewrite to mention the SDK handoff tool names. Risk: model still emits `delegate_to_subagent` calls until prompt is rewritten; SDK rejects.
17. **Run the full test suite + a smoke chat turn against a local Supabase.** Risk: build green, runtime broken — verify a real turn streams text, fires a tool, hits an approval, resumes via `/api/ai/task/resume/[pausedRunId]`.

`execute.ts` and `openai-client.ts` are not deleted — see §1 rationale.

---

## 7. The risk register

Most-likely → least-likely.

1. **`AgentPausedRun` cleanup cron doesn't exist.** [HIGH] Paused runs accumulate forever; the `expiresAt` column is set on insert and read on resume (the resume route marks expired rows `'expired'` lazily on access), but nothing sweeps the table. **Mitigation:** before cutover, add a daily Vercel cron or Supabase scheduled job that deletes (or status-flips) `AgentPausedRun` rows where `expiresAt < now() AND status = 'pending'`. Trivially small — one SQL query.

2. **System prompt still tells the model about `delegate_to_subagent`.** [MEDIUM] `lib/ai-tools/system-prompt.ts` references the tool by name. After step 7 the SDK has no such tool — every model turn that tries to delegate gets a tool-not-found error. **Mitigation:** rewrite the directive to name the SDK sub-agent tools (`research_person`, `analyze_pipeline`) before merging.

3. **`AgentDraft` inbox stops getting new rows.** [MEDIUM] The Modal path's `draft_message` writes `AgentDraft`; the SDK runtime uses `send_email`/`send_sms` with SDK-side approval. If the realtor's inbox UI reads `AgentDraft.status='pending'`, it goes empty. **Mitigation:** confirm before cutover whether `send_email` writes `AgentDraft` or expects the inbox to read a different table. This is the same risk #2 in `MIGRATION_GAP.md` — still open.

4. **SDK tool ctx shape mismatch.** [MEDIUM] The SDK invokes `toSdkTool`-wrapped handlers via `RunContext`; our handlers expect a bare `ToolContext`. If `sdk-bridge.ts` ever passes a slightly wrong shape (e.g. missing `signal` or `userId`), tools that branch on those fields silently misbehave. **Mitigation:** spot-test 3-4 tools through a real SDK turn (find_person, schedule_tour, send_email) before merging.

5. **Streaming event-shape regression for the chat client.** [MEDIUM] The SDK's `tool_output` events carry payloads in `{ output: { text } }` — the mapper in `sdk-event-mapper.ts` flattens them. If a tool returns a non-string `data` object (e.g. `find_person` returning structured rows), the existing chat UI may render `[object Object]`. **Mitigation:** verify the mapper's `stringifyOutput` against every tool's actual return shape.

6. **Post-tour route silently broken if `execute.ts` is renamed.** [LOW] If a future refactor moves `execute.ts` and forgets the post-tour caller, post-tour POSTs return 500. **Mitigation:** keep `execute.ts` at its current path; revisit later if scope justifies.

7. **Tests that import deleted modules linger as `.skip` / `.todo`.** [LOW] Easy to miss when nuking files. **Mitigation:** `grep -rn "ai-tools/loop\|ai-tools/continue-turn\|ai-tools/openai-format" tests` should return zero after cutover.

8. **Modal Python orchestrator still references shared types.** [LOW] The autonomous run path (`agent/orchestrator.py`, `agent/modal_app.py`) is untouched, but if it imports any TS-side schema via a generator, the deletion could break it. **Mitigation:** spot-check `agent/schemas.py` for stale references.

9. **`runtime-flag.ts` itself becomes vestigial.** [LOW] After deleting the modal branch (§4 option b) the flag has nothing to switch. **Mitigation:** in a follow-up, delete `runtime-flag.ts` and its test. Not blocking — keeping the flag for one cycle costs nothing.

10. **Legacy `/api/ai/task/approve/[requestId]` URL still hardcoded in client code.** [LOW] If a chat component still POSTs to the old approve URL, the user sees 404 on approve. **Mitigation:** grep `components/` and `app/` for `/api/ai/task/approve` before merging.
