# Migration gap — Python (Modal) chat → TypeScript SDK runtime

Read-only audit. Branch: `claude/audit-7-to-8-fixes`. Lens: Musk. The job is to call out, before PR 1, what the cutover would lose, replicate, or accept losing.

The headline: **the Python "Chippi" agent is 21 tools, ~22% of which are dead weight, ~50% map cleanly to TS today, and the remaining 25% are real work that has to land before or with the cutover.** The biggest blocker is `recall_memory` / `store_memory` (pgvector). The biggest "we can lose this" is the autonomous-run / trigger-queue path — it isn't part of PR 1's surface, but half the Python tooling exists for it, and that's where most of the "do we port this?" fog comes from.

---

## 1. Python tool inventory

The realtor's chat agent (`agent/chippi.py`) wires 21 `function_tool`s plus `log_activity_run`. Below: every tool, what it does, the closest TS verb, the call.

| Python tool | One-line function | TS equivalent | Action |
|---|---|---|---|
| `find_contacts` | Find people in space; filters by id, name, lead type, overdue follow-up, quiet days | `find_person` (`lib/ai-tools/tools/find-person.ts`) + `find_overdue_followups` + `find_quiet_hot_persons` | **PORT** — TS has the surface area, but the `quiet_days` filter logic should be cross-checked against `find-quiet-hot-persons.ts` for parity. |
| `get_contact_activity` | Last N activity rows for a contact | Implicit in `find_person` (returns `recentActivities`) and `recall_history` for query-by-text | **ACCEPT_LOSS** — TS folds recent activity into find_person's response. The dedicated tool isn't worth keeping. |
| `update_contact` | Tag, change pipeline type, set follow-up, store brief, score-explanation, re-engagement bump | Spread across `set_followup` / `clear_followup` / `mark_person_hot` / `mark_person_cold` / `archive_person` / `note_on_person` | **PORT** — already decomposed on TS side. The "score explanation as memory" and "agent_brief" memory writes have NO TS equivalent → see memory section. |
| `find_deals` | Find deals; filters by id, status, stalled days, closing-within-days | `find_deal` + `find_stuck_deals` | **PORT** — clean overlap. |
| `update_deal` | Probability, follow-up date, prepend agent note | `update_deal_value` / `update_deal_close_date` / `note_on_deal` (no probability writer in TS) | **NEW_BUILD (small)** — TS has no `update_deal_probability`. Either add or accept the loss; chat barely uses it. |
| `advance_deal_stage` | Move deal between pipeline stages by name or id | `move_deal_stage` | **PORT** — direct map. |
| `request_deal_review` | Brokerage-only: file a `DealReviewRequest` for broker review | NONE | **NEW_BUILD (small)** — brokerage-only verb; one DB insert + space lookup. Skip if broker review isn't a PR-1 promise. |
| `book_tour` | Create Tour row with guest details | `schedule_tour` | **PORT** — direct map; TS one is richer (handles reschedule sibling tools too). |
| `route_lead` | Brokerage routing — preview or commit moving a contact's `spaceId` | `assign_lead_to_realtor` | **PORT** — direct map. Verify pool-method preview semantics survive. |
| `add_property` | Insert a Property row | NONE (TS has no create-property tool, only `find_property`, `update_property_status`, `note_on_property`) | **NEW_BUILD (small)** — one zod-validated INSERT. Trivial. |
| `send_property_packet` | Draft a packet share (looks up packet + draft a message) | NONE (TS has no packet tool) | **KEEP_PYTHON or NEW_BUILD (medium)** — packets exist in the schema; no TS verb. If the realtor uses packets, build it. If packets are a dormant feature, ACCEPT_LOSS. |
| `recall_memory` | Keyed + semantic (pgvector) recall over `AgentMemory` | NONE (TS `recall_history` searches activity rows via ILIKE, NOT the AgentMemory table or pgvector) | **NEW_BUILD (large)** — see "the blocker" below. |
| `store_memory` | Insert into `AgentMemory` with embedding | NONE | **NEW_BUILD (large)** — paired with `recall_memory`. |
| `manage_goal` | List / create / update_status on `AgentGoal` | NONE | **KEEP_PYTHON** for autonomous-run. **ACCEPT_LOSS** for chat. The chat doesn't need to manage goals from inside a turn; the goals UI + `/api/agent/goals` already covers CRUD. The Python tool exists because the autonomous run wants to schedule its own follow-up sequences. |
| `draft_message` | Create a pending `AgentDraft` (sms / email / note) with 48h dedup | `draft_email` / `draft_sms` (no `note` channel) | **PORT** — TS draft tools are read-only (no AgentDraft row); the Python tool is the path that creates approval-bound drafts. The TS `send_email` / `send_sms` tools are mutating-with-approval, which is the equivalent flow under the new SDK runtime. The semantics are different but the user-visible outcome is the same: "Chippi proposed, I approved, it sent." |
| `outcome` | Record draft outcome OR summarise outcomes over a window | NONE | **ACCEPT_LOSS for chat**. The realtor has the inbox UI; outcome-recording from chat is theoretical. Outcome summaries can be a future read-only verb, not a blocker. |
| `analyze_portfolio` | Compute pipeline-level metrics + write a memory | `pipeline_summary` | **PORT** — TS version is leaner and doesn't write a memory side effect. Net win. The narrative-insights string can move into the chat reply itself. |
| `generate_priority_list` | Score every contact, store top-N as a memory | NONE (closest: `find_quiet_hot_persons` + `find_overdue_followups`) | **ACCEPT_LOSS** — daily priority lists belong in a dashboard route (`/api/agent/today` already exists), not a chat tool. The chat can call the existing read tools to compose the same answer at request time. |
| `process_inbound_message` | Insert ContactActivity for a reply, bump score, classify intent | NONE | **ACCEPT_LOSS for chat**. This tool exists to process webhooks (SMS / email replies) — the realtor's chat agent should never call it. It belongs on a server route, not in the chat tool catalogue. |
| `read_attachment` | Pull bytes from a Supabase URL, extract text from PDF/DOCX/XLSX | NONE | **NEW_BUILD (medium)** — the chat lets realtors drop files. PDF/docx/xlsx extraction has to land somewhere. Easiest path: do the extraction at upload-time on the Next.js side (`/api/ai/attachments`), then the chat just reads `extractedText` from the row — no tool needed. That's the simpler architecture. |
| `ask_realtor` | Insert AgentQuestion (async question to realtor) | NONE | **ACCEPT_LOSS** — relevant for autonomous runs, not chat. In chat, the agent IS talking to the realtor; asking a follow-up question is just sending text. |
| `log_activity_run` | End-of-run audit log entry | NONE | **ACCEPT_LOSS for chat**. Required by autonomous runs; chat already persists transcripts. |

### Action breakdown
- **PORT** (already mappable to TS, verify parity): 7 — `find_contacts`, `update_contact`, `find_deals`, `advance_deal_stage`, `book_tour`, `route_lead`, `analyze_portfolio`, `draft_message`. (8 if you split out the `update_contact` decomposition into its own line.)
- **NEW_BUILD**: 5 — `recall_memory` + `store_memory` (1 unit, **large**), `add_property` (small), `request_deal_review` (small), `read_attachment` (medium, ideally moved to upload-time), and depending on the call: `send_property_packet` (medium) or **KEEP_PYTHON** if packets are dormant.
- **ACCEPT_LOSS for chat**: 7 — `get_contact_activity`, `manage_goal`, `outcome`, `generate_priority_list`, `process_inbound_message`, `ask_realtor`, `log_activity_run`. These exist to support autonomous / brokerage / webhook paths that the chat agent doesn't need.
- **KEEP_PYTHON** (autonomous side keeps using the Python catalog): all of the "ACCEPT_LOSS for chat" set, plus the autonomous orchestrator itself. The Modal app keeps `run_now_webhook` and the trigger queue. Cutover is **chat only**, not the autonomous run.

---

## 2. System prompt diff

**Python** (`agent/chippi.py`, ~95 lines):

```
You are Chippi, an AI cowork for a real estate professional. Direct,
useful, no filler. You're a peer, not a chatbot — never apologise for
being software, never say "as an AI."

# Modes
The opening message tells you which:
- CHAT — the realtor sent a message...
- AUTONOMOUS — you woke up on a trigger... End with log_activity_run.

# Sweep mode (no specific trigger)
  find_contacts(no_followup_quiet_days=7)
  find_deals(stalled_days=14)
  find_deals(closing_within_days=14)

# Tool-first
... For "what's the topic?" questions use recall_memory(query="...")
Always check memory before drafting anything contact-facing.

# Lifecycle moves (brokerage-grade actions)
- book_tour ...
- advance_deal_stage ...
- send_property_packet ...
- route_lead ... [preview vs commit semantics]
- request_deal_review ... [brokerage-only]

# Drafting
Always draft, never send. draft_message creates a pending AgentDraft.
Auto-dedupes...

# Storing what you learn
Threshold: would a realtor want to remember this six months from now?
... Worth storing: deadlines, pre-approval amounts, neighbourhood
constraints, channel preferences, ghosting patterns.

# Mode hints in the user message
- [Search: ...] → semantic recall + ranked results, matching detail
  quoted, no summary.
- [Draft: ...] → longer artifact (email, market summary, sequence).
  Skip conversational framing.
- [Think: ...] → systematic. State what you know, what you don't,
  what tools you'll use, then execute.

# Asking
If intent is genuinely ambiguous, ask_realtor with a one-sentence question.

# Boundaries
- Never reveal internal IDs, API keys, or per-row metadata. Use names.
- Never claim a write you didn't execute. "Drafted" if drafted.
- Never change deal status, value, or title from chat — that's the
  realtor's call. Probability and follow-up dates are fine.

# Style
Lead with the answer. Reasoning second...
```

**TypeScript** (`lib/ai-tools/system-prompt.ts`, ~40 lines):

```
You are Chippi's assistant, an AI that helps real estate professionals run their pipeline.

Workspace: "<name>"
Today: <date>

Vocabulary: the UI calls them "people" (not contacts or leads) and "deals"
(not pipeline). Use those words back to the user. "Hot" / "warm" / "cold"
remain as score tiers ("hot person", not "hot lead").

How you work:
- Use tools to answer questions; do not speculate...
- Prefer a single read-only tool over asking the user to clarify...
- For research-heavy sub-tasks, prefer delegate_to_subagent over calling
  many read tools yourself...
- When the user asks for a batch action, first use read tools to identify
  the list, then propose the action...
- Mutating tools always prompt the user for approval...
- When the user message opens with a [SUBJECT CONTEXT] block, treat its
  contents as ground truth and don't re-fetch...
- When you have nothing useful to add, say so plainly.

Tone: concise, warm, direct. Lead with the answer...
```

### What's in Python that isn't in TS
1. **Persona statement** ("a peer, not a chatbot — never apologise for being software"). Keep this; it sets the voice.
2. **CHAT vs AUTONOMOUS mode split.** Irrelevant after cutover — TS chat only ever runs in chat mode. Drop.
3. **Memory directive.** "Always check memory before drafting anything contact-facing." Cannot be ported until the memory tools exist on TS side.
4. **Drafting boundary.** "Always draft, never send" is the entire approval semantic. TS handles this with `requiresApproval` on the tool — the model doesn't need an instruction. **Drop the line.**
5. **Brokerage-grade actions block.** `route_lead` / `request_deal_review` need explicit guidance (preview vs commit, brokerage-only). When those tools land in TS, add a tight equivalent.
6. **Mode hints block** (`[Search:]` / `[Draft:]` / `[Think:]`). Are these still used? Grep doesn't show them being injected by the Next.js side. **Likely dead** — confirm and drop.
7. **Boundaries block** — "never reveal internal IDs, never change deal status from chat, never claim a write you didn't execute." The "never claim a write you didn't execute" is **load-bearing**; the others are tool-shape concerns the TS tools already enforce structurally. Port the one.

### What's in TS that isn't in Python
1. **Vocabulary directive** ("people" not "contacts"). Python prompt uses "contacts" directly. Better is the TS version. Keep.
2. **`delegate_to_subagent` directive.** Python has no sub-agent concept. Keep on TS side.
3. **`[SUBJECT CONTEXT]` block convention.** Python doesn't use this. Keep on TS side; it's a real performance win for context-aware questions.
4. **No mode hints, no autonomous mode.** Right call.

### Net recommendation
Keep TS prompt almost as-is. **Add three things** when the corresponding tools land:
- One sentence: "You are a peer to the realtor — direct, no filler, never apologise for being software."
- One sentence: "Never claim a write you didn't execute. If a tool errored, say it errored."
- When memory tools land: "Before drafting anything contact-facing, recall what you already know about that person."

Drop everything else from the Python prompt. It's longer than it needs to be.

---

## 3. Behaviors not in tools

What the Python orchestrator does between the LLM calls.

| Behavior | What it does | PR-1 action | Justification |
|---|---|---|---|
| Memory injection at run start | Loads top 15 space-level memories, formats them into the opening prompt (`format_memories_for_prompt`, 3000 chars) | **ACCEPT_LOSS for chat** in PR 1, NEW_BUILD before PR 2 | Chat is interactive; the realtor can ask "what do you know about X" and the agent calls `recall_memory`. Pre-injection of stale workspace-level facts is autonomous-run hygiene, not chat hygiene. |
| `prune_expired` memories at run start | Deletes expired memory rows | **KEEP_PYTHON** | Cron-style cleanup; nothing to do with chat. Move to a scheduled job if Python goes away. |
| Trigger queue (Redis lpop of `agent:triggers:{space_id}`) | Drains 0-10 events into the opening prompt for autonomous mode | **KEEP_PYTHON** | Not chat. |
| Per-space daily token budget (Upstash, `check_budget` / `record_usage`) | Skips the whole run if budget exhausted | **NEW_BUILD (small)** | Cheap insurance against a runaway loop on someone's account. The `runs` and `usage` tables already exist on TS side; wire enforcement into `lib/ai-tools/loop.ts` if not already there. |
| `pending_drafts_guardrail` (input guardrail, ≥10 unreviewed → trip) | Blocks a fresh run when the realtor's inbox is overloaded | **ACCEPT_LOSS for chat** | This is autonomous-run protection. In chat, the realtor IS asking for the agent to do something — refusing because their inbox is full would feel broken. |
| `publish_event` (POST to `/api/agent/events`) | Emits real-time progress events to the SSE bus | **NEW_BUILD (small)** | The TS SDK already streams tool events via `loop.ts` / `events.ts`. Verify the event shape matches what the agent UI consumes. There may be no work to do here. |
| Translation of SDK stream events to JSONL (`translate()` in `modal_app.py`) | Maps `RawResponsesStreamEvent` / `RunItemStreamEvent` → `{type: token|tool_call_start|tool_call_result}` SSE | **PORT (small)** | TS SDK's stream events have a different shape than the Python SDK. The translation layer in `lib/ai-tools/loop.ts` already produces `text_delta` / `tool_call_start` / `tool_call_result` events for the OLD custom loop. Verify the SDK-bridge produces the same shape so the client doesn't break. |
| `attach_message` / `build_user_input` (image vs text-extracted attachment routing) | Folds attachments into the user message: images via `image_url`, text via `[Attached <name>]\n<extracted>` | **NEW_BUILD (small)** | Has to be replicated on the TS side once `read_attachment` is ported. Fastest path: extract at upload time, inject `extractedText` into the user message. Skip the tool entirely. |
| `AgentContext.from_settings` — spaceId boundary | spaceId injected once at runtime; tools read it from `RunContextWrapper` | **PORT** | TS has `ToolContext` with `ctx.space.id`. Same pattern. Already works. |
| `AGENT_INTERNAL_SECRET` for the Modal webhook | Bearer-secret auth on the `/run_now_webhook` and `/chat_turn` endpoints | **KEEP_PYTHON** | Becomes irrelevant for chat once Modal is out of the chat path. Still needed for autonomous runs. |
| Conversation history loading (last N messages) | `app/api/ai/task/route.ts` already loads + forwards history | **PORT** | Already works on TS side; keep. |

Streaming protocol differences worth flagging: the Python translation produces `{type: "tool_call_result", ok: true, summary: "..."}`. The TS SDK's tool-result event has a different shape (`tool_call_output`). **The bridge in `lib/ai-tools/sdk-bridge.ts` is real but PR 1 doesn't have a wired-up streaming adapter yet.** Need to confirm `extractApprovals` + the stream loop produce the same `text_delta` / `tool_call_start` / `tool_call_result` events the existing client already renders.

---

## 4. Persistence diff

| Surface | Python writes | TS writes | Diff / risk |
|---|---|---|---|
| Chat transcripts | Doesn't write directly. Relies on `/api/ai/task/route.ts` to persist user + assistant messages to `Conversation` / `Message` | Same | None. Already TS-owned. |
| `AgentMemory` (pgvector) | Writes via `save_memory` from inside `update_contact`, `analyze_portfolio`, `generate_priority_list`, `store_memory` tool, autonomous run summary | **DOES NOT WRITE** | **Cutover risk.** If chat moves to TS without porting memory, every chat turn that "should have stored a fact" silently loses it. Most realtors won't notice for weeks; then they'll wonder why the agent forgot. |
| `AgentDraft` | Writes via `draft_message`, `send_property_packet`, `outcome` | Writes via `send_email` / `send_sms` (mutating, approval-gated) | Different model. Python "always drafts" via AgentDraft. TS "always asks for approval" via SDK interrupt + `requiresApproval`. Same UX outcome, different DB rows. **AgentDraft inbox UI may break if no new rows land.** Verify the inbox screens read both (or that the SDK approval flow writes AgentDraft equivalents). |
| `AgentActivityLog` | Writes per lifecycle action (`persist_log`) and once per run (`log_activity_run`) | TS tools write to it via the loop's `events.ts` event stream → `/api/agent/activity` | Should be parity — confirm by spot-checking 2-3 lifecycle tools (`schedule_tour`, `move_deal_stage`). |
| `AgentRun` | Captures the autonomous run row | N/A for chat | Not a chat concern. |
| `ContactActivity` / `DealActivity` | Written from inside every Python tool that mutates a contact/deal | Same on TS side | Spot-check parity per ported tool. |
| `AgentGoal` | `manage_goal` writes | TS `/api/agent/goals` writes | The chat doesn't need to read/write goals. ACCEPT_LOSS for chat. |
| `AgentQuestion` | `ask_realtor` writes | TS has `/api/agent/questions` route but no tool | ACCEPT_LOSS for chat. |
| `AgentMemory` PRIORITY_LIST / PORTFOLIO summary | `generate_priority_list` and `analyze_portfolio` write JSON-encoded space memories the UI reads | **NOT migrated** | The dashboard / "today" route reads these. Removing them silently breaks `/api/agent/priority` and `/api/agent/portfolio` consumers. **Check first.** Either keep these as autonomous-only, or move the writes to the existing API routes. |

---

## 5. The cutover risk register

Most-likely → least-likely. Severity: how bad if it happens. Blocking: must be fixed before PR 1 ships?

| # | Risk | Severity | Blocking? |
|---|---|---|---|
| 1 | **Memory tools missing.** Chat agent has no `recall_memory` / `store_memory`. Realtors who currently say "what do we know about Sarah" get hallucinated answers (or the agent calls `recall_history`, which is keyword-only over activity rows, NOT pgvector over `AgentMemory`). | High | **Yes**, if the chat ever exposed memory recall as a real feature. The Python prompt explicitly tells Chippi to do this. Cutting over without TS memory → the agent silently regresses on its biggest "feels smart" capability. |
| 2 | **`AgentDraft` inbox stops getting new rows.** If TS chat uses `send_email`/`send_sms` (immediate-send-with-approval) instead of `draft_message` (approval-bound queue), the realtor's "drafts inbox" UI may go quiet. | High | Yes — verify the inbox component. If it reads `AgentDraft.status='pending'`, it's empty after cutover. |
| 3 | **Streaming shape mismatch.** Python emits `{type, delta}` for tokens, `{type, tool, args}` for tool starts. TS SDK has a different stream-event shape. The chat client UI is built around the old shape. | High | Yes — the bridge in `sdk-bridge.ts` claims compatibility but I didn't see a wired-up streaming adapter in PR 1. Test with a live turn. |
| 4 | **`read_attachment` gone.** Realtor drops a PDF; chat can't read it. | Medium | Yes if file-drop is a daily feature. The clean fix is upload-time extraction (`/api/ai/attachments` already persists rows; extend it) rather than porting the tool. |
| 5 | **`add_property` gone.** "Add 123 Main St as a listing" no longer works from chat. | Medium | No — small build, ~50 LOC. Land alongside PR 1. |
| 6 | **`update_deal` probability writer gone.** Chat can't say "bump this deal to 80% probability." | Low | No — TS has `update_deal_value` and `update_deal_close_date`; add a third small tool or accept the loss. |
| 7 | **Per-space token budget.** TS loop may not enforce daily caps. A bad prompt-injection day burns through OpenAI credits. | Medium | No — not blocking PR 1, but worth landing within a week. |
| 8 | **`request_deal_review` (brokerage).** Brokers can't be asked to review a flagged deal from chat. | Low | No — brokerages are a small fraction of users. ACCEPT_LOSS until churn signals otherwise. |
| 9 | **`send_property_packet` gone.** Realtors can't share a packet via chat. | Low/Medium | Depends on packet usage. If packets are a real feature, NEW_BUILD (medium). If they're dormant, ACCEPT_LOSS. |
| 10 | **System prompt drifts.** TS prompt is tighter than Python's. Some Python directives (memory check, peer voice) aren't in TS. Realtors notice tone shift. | Low | No — drop in the three sentences I called out above. |
| 11 | **Autonomous run accidentally broken.** PR 1 changes the chat path, but if the build/deploy touches `agent/` shared modules, autonomous runs could regress. | Medium | No — autonomous is a separate Modal entrypoint. Keep it untouched in PR 1. |
| 12 | **`generate_priority_list` / `analyze_portfolio` memory-writes break the dashboard.** If the dashboard reads `AgentMemory` content="PRIORITY_LIST:..." rows and chat stops writing them, dashboards go stale. (Autonomous still writes them, but only when it runs.) | Low | No — autonomous run still writes these. Chat users were never the primary writer. |

---

## 6. Recommended order

### Before PR 1 ships
1. **Confirm `AgentDraft` inbox reads survive the new approval flow.** One-hour audit. If the inbox is empty post-cutover, it's a UX regression nobody asked for. (Risk #2)
2. **Verify the streaming shape.** Run one chat turn through the TS SDK runtime, confirm the existing chat UI renders tokens + tool calls correctly. (Risk #3)
3. **Drop the obsolete bits of the Python prompt and add the three missing sentences to TS prompt** (peer voice, no-false-claims, memory-recall-before-drafting — the last conditional on memory tools landing).

### Land alongside PR 1
1. **`add_property`** — 50 LOC zod tool. (Risk #5)
2. **Extract attachment text at upload time** in `/api/ai/attachments`. No tool needed; chat reads `extractedText` from the message context. (Risk #4)
3. **Per-space token budget enforcement** in `lib/ai-tools/loop.ts`. (Risk #7)

### Land before PR 2 (the "feels smart" PR)
1. **`recall_memory` + `store_memory` (TS, pgvector).** This is the big one. Without it, chat regresses on its single most realtor-facing capability. Estimate: medium — `pgvector` is already in the schema, OpenAI embeddings client is already in the codebase, the ILIKE-based `recall_history` is a hint for the SQL shape but **not** a substitute. (Risk #1)
2. Update the system prompt to mention memory.
3. Decide: `send_property_packet` — port or kill the feature.

### After cutover, when bandwidth allows
1. `update_deal_probability` (or accept the loss).
2. `request_deal_review` (brokerage-only).
3. Outcome summary verb (`outcome(action='summary')`) if anyone actually uses it.

### Never (kill list)
- `get_contact_activity` (folded into `find_person`)
- `manage_goal` from chat (UI handles CRUD)
- `process_inbound_message` from chat (it's a webhook handler, not a chat tool)
- `ask_realtor` from chat (the agent IS talking to the realtor)
- `log_activity_run` from chat (chat persists transcripts already)
- `generate_priority_list` from chat (`/api/agent/today` exists)
- The `[Search:]` / `[Draft:]` / `[Think:]` mode-hint block in the prompt — appears unused.

---

## Closing call

The Python chat agent is over-tooled for what it actually does in chat. Half the tools exist for autonomous runs and don't belong in a chat tool catalogue. The TS side is in better shape than the surface-area diff suggests — 7 of 21 tools port directly, 7 should be dropped from chat entirely, and the meaningful work is one big build (`AgentMemory` on TS) plus three small ones.

PR 1 (chat cutover) can start now if and only if (a) the streaming shape is verified compatible, (b) `AgentDraft` inbox reads survive, and (c) we explicitly accept that memory recall is broken in chat until PR 2 lands. If those three are fine, ship PR 1. Otherwise, close memory first.
