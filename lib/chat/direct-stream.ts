/**
 * Direct-path SSE stream wrapper — Phase 4.
 *
 * Bridges `runDirectChat()` (non-streaming chat completion) to the same
 * Server-Sent Events protocol the Modal proxy speaks in `app/api/ai/task`.
 * That way the browser doesn't have to know which path served the turn —
 * the event shapes (`text_delta`, `turn_complete`, `error`, `route_picked`)
 * are identical.
 *
 * The completion streams token-by-token behind a small escalation
 * hold-back window (ESCALATION_HOLDBACK_CHARS): the opening of the reply is
 * buffered just long enough to check for escalation language, then
 * everything flows live. See the gate in streamDirectTurn.
 *
 * The endpoint persists the assistant message and writes ChatUsage here
 * — the direct path has no Modal hop to delegate to.
 */

import { logger } from '@/lib/logger';
import {
  saveAssistantMessage,
  saveConversationTurnAssistantMessage,
} from '@/lib/ai-tools/persistence';
import { chippiErrorMessage } from '@/lib/ai-tools/chippi-voice';
import { recordChatUsage, type ChatRoute } from '@/lib/usage/record-chat-usage';
import type { MessageBlock } from '@/lib/ai-tools/blocks';
import { after } from 'next/server';
import {
  runDirectChatStream,
  CHIPPI_INSTRUCTIONS_LITE,
  type DirectHistoryRow,
} from './direct-llm';
import { retrieveContext } from './vector-context';
import { decideReasoningEffort } from './auto-think';
import { markTurnEnded } from './turn-presence';
import { shouldEscalate } from './router';
import { createStopPoller } from './stop-signal';
import type { MultimodalAttachment } from './multimodal';
import {
  settledConversationTurnOutcome,
  startConversationTurnLeaseGuardian,
  type ConversationTurnSettler,
  type TurnTerminalOutcome,
} from './turn-control';
import { supabase } from '@/lib/supabase';

export interface DirectStreamInput {
  spaceId: string;
  userId: string | null;
  conversationId: string;
  model: string;
  userMessage: string;
  history: DirectHistoryRow[];
  attachments: MultimodalAttachment[];
  /** AbortController shared with the rest of the request. */
  abortController: AbortController;
  /** Stable identity for exact-turn Stop and durable settlement. */
  turnId?: string;
  /** Exact v2 attempt authority. Required for atomic transcript finalization. */
  attemptToken?: string;
  onSettled?: ConversationTurnSettler;
  /**
   * Called when the direct response signals it needs the agent path. The
   * handler builds the AGENT path's SSE Response for the same message (e.g.
   * streamTsChatTurn) and returns it; this stream then pipes the agent
   * response's bytes through verbatim — same SSE protocol, so the browser
   * just sees the turn continue on the agent route. Return `null` (or throw)
   * to skip escalation and commit the direct answer as-is.
   */
  onEscalate?: () => Promise<Response | null>;
}

interface SseEvent {
  type:
    | 'text_delta'
    | 'reasoning_delta'
    | 'turn_complete'
    | 'error'
    | 'route_picked'
    | 'fallback_note'
    | 'status';
  [k: string]: unknown;
}

/**
 * How much reply text we hold back before letting tokens stream to the user.
 * Escalation phrases are opening admissions ("I can't do that", "I don't have
 * access to your CRM", "I'll need to actually send…") — the lite prompt makes
 * the model LEAD with them — and every one resolves within the first ~50
 * chars, so a small window catches them before anything is shown while every
 * normal answer starts streaming almost immediately.
 *
 * This was 240, which meant any reply SHORTER than 240 chars (i.e. most Q&A
 * answers) was buffered whole and flushed at once — no streaming, the exact
 * "doesn't feel alive" symptom. 64 keeps the escalation net (all known
 * phrases are shorter) while letting short answers stream after a brief hold.
 */
const ESCALATION_HOLDBACK_CHARS = 64;

/**
 * Build a Response streaming the direct-path turn.
 *
 * Stream sequence (happy path):
 *   1. route_picked  { route: 'direct' }
 *   2. status        { label: 'Reading your workspace…' | 'Thinking…' }
 *   3. text_delta    { delta: '...' }               — token-by-token, after
 *      the escalation hold-back window clears
 *   4. (optional) fallback_note { message: '...' }  — if multimodal builder
 *      dropped attachments for the active provider
 *   5. turn_complete { reason: 'complete' }
 *
 * On escalation we emit a second route_picked ({route:'agent',
 * escalated:true}) and pipe the agent path's SSE bytes through this same
 * Response — the browser sees one continuous stream.
 */
export function streamDirectTurn(input: DirectStreamInput): Response {
  const encoder = new TextEncoder();
  let seq = 0;

  function frameEvent(event: SseEvent): string {
    return `data: ${JSON.stringify({ seq: seq++, ts: new Date().toISOString(), ...event })}\n\n`;
  }

  // Set when the browser disconnects (tab closed, navigated away). We do NOT
  // abort the turn — it keeps running server-side to completion and persists,
  // so the finished answer is in history when the user returns (same contract
  // as the Modal proxy path in app/api/ai/task). This only stops us writing
  // into a torn-down controller.
  let clientGone = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Hold the serverless function open until the turn (including
      // persistence) finishes, even after the client disconnects — without
      // this, Vercel may suspend the function the moment the response stream
      // is cancelled and the drain above never completes.
      let turnDone!: () => void;
      const turnDonePromise = new Promise<void>((resolve) => {
        turnDone = resolve;
      });
      try {
        after(() => turnDonePromise);
      } catch {
        /* outside a request context (tests, workers) */
      }

      const push = (event: SseEvent) => {
        if (clientGone) return;
        try {
          controller.enqueue(encoder.encode(frameEvent(event)));
        } catch {
          clientGone = true;
        }
      };
      let terminalOutcome: TurnTerminalOutcome = {
        status: 'failed',
        reason: 'stream_closed_without_terminal_event',
        error: 'The direct stream closed without a terminal event.',
      };
      let atomicallySettled = false;
      let settlementDelegated = false;
      let separatelySettled = false;
      const leaseGuardian = input.turnId && input.attemptToken
        ? startConversationTurnLeaseGuardian(supabase, {
            turnId: input.turnId,
            spaceId: input.spaceId,
            conversationId: input.conversationId,
            attemptToken: input.attemptToken,
            abortController: input.abortController,
          })
        : null;
      const settleBeforeTerminal = async (): Promise<boolean> => {
        if (!input.onSettled || atomicallySettled || settlementDelegated) return true;
        try {
          const settled = await input.onSettled(terminalOutcome);
          terminalOutcome = settledConversationTurnOutcome(settled, terminalOutcome);
          separatelySettled = true;
          return terminalOutcome.status !== 'failed';
        } catch (error) {
          terminalOutcome = {
            status: 'failed',
            reason: 'durable_settlement_failed',
            error: error instanceof Error ? error.message : 'Durable turn settlement failed.',
          };
          logger.error('[direct-stream] pre-terminal durable settlement failed', {
            conversationId: input.conversationId,
            turnId: input.turnId,
          }, error);
          push({
            type: 'error',
            message: chippiErrorMessage('persistence'),
            code: 'persistence',
          });
          return false;
        }
      };

      // Tell the browser which path served this turn — useful for the
      // existing chat telemetry rail and for any future "this was a
      // fast Q&A turn" indicator.
      push({ type: 'route_picked', route: 'direct' });

      try {
        await leaseGuardian?.renewNow();
        // Retrieve workspace context FIRST so the system message carries
        // it on the first wire — quality lift independent of which path
        // serves the turn.
        push({ type: 'status', label: 'Reading your workspace…' });
        const ctx = await retrieveContext({
          spaceId: input.spaceId,
          userMessage: input.userMessage,
        });

        // Auto-think: analytical / planning turns get real reasoning; a
        // phone-number lookup gets none and keeps its sub-second first
        // token. The reasoning deltas below keep the wire alive through
        // the thinking phase.
        const reasoningEffort = decideReasoningEffort(input.userMessage, {
          surface: 'direct',
        });
        push({
          type: 'status',
          label: reasoningEffort === 'none' ? 'Thinking…' : 'Thinking it through…',
        });

        const systemMessage = [
          CHIPPI_INSTRUCTIONS_LITE,
          ctx.block, // empty string when no context — splice is harmless
        ]
          .filter((s) => s && s.trim().length > 0)
          .join('\n\n');

        // Stream the completion. Tokens flow to the browser as they arrive,
        // behind a small hold-back window: nothing is shown until we've seen
        // enough text to know the turn isn't an escalation ("I'll need to
        // actually send that…"). Once the window clears, every subsequent
        // delta goes straight through — the reply types itself out live
        // instead of appearing all at once seconds later.
        //
        // No escalation handler → no reason to hold anything back.
        let gateOpen = !input.onEscalate;
        let escalationLatched = false;
        let held = '';
        // Explicit Stop (POST /api/ai/stop) — polled at a bounded cadence.
        // Distinct from disconnect: disconnect keeps the turn alive; Stop
        // aborts generation and commits whatever the user already saw.
        const shouldStop = createStopPoller(input.turnId ?? `legacy:${input.conversationId}`);
        let stopped = false;
        const turnStartedAt = Date.now();
        const result = await runDirectChatStream(
          {
            model: input.model,
            systemMessage,
            history: input.history,
            userMessage: input.userMessage,
            attachments: input.attachments,
            signal: input.abortController.signal,
            reasoningEffort,
          },
          (delta) => {
            if (leaseGuardian?.hasLostAuthority()) return false;
            // Bounded-cadence stop poll (async; flips `stopped` within one
            // interval). Returning false aborts the provider stream.
            void shouldStop().then((s) => {
              if (s) stopped = true;
            });
            if (stopped) return false;
            if (escalationLatched) {
              // Latched: drain silently to completion. The full reply is
              // needed if the agent handoff fails (we commit it instead of
              // a mid-sentence fragment), and the provider's final stream
              // chunk carries the exact usage/cost for the ChatUsage row.
              return;
            }
            if (gateOpen) {
              push({ type: 'text_delta', delta });
              return;
            }
            held += delta;
            if (shouldEscalate(held)) {
              // The reply opens with escalation language. Nothing was shown.
              escalationLatched = true;
              return;
            }
            if (held.length >= ESCALATION_HOLDBACK_CHARS) {
              gateOpen = true;
              push({ type: 'text_delta', delta: held });
            }
            return;
          },
          // Thinking deltas — streamed live ahead of the answer. NOT subject
          // to the escalation hold-back (that gates visible *answer* text);
          // the client renders these as the collapsible trace, so the
          // thinking phase reads as activity, never a silent gap. Muted once
          // a stop or escalation is latched — the trace belongs to a turn
          // the user won't see finish here.
          (delta) => {
            if (!leaseGuardian?.hasLostAuthority() && !stopped && !escalationLatched) {
              push({ type: 'reasoning_delta', delta });
            }
          },
        );

        // Settle the stop state once, awaited, now that generation is over.
        // `stopped` is flipped from inside the delta callback, so on a turn
        // that produced few or no deltas it can still be false here even
        // though the realtor hit Stop. Everything downstream — whether to
        // escalate, whether to fabricate a "came up empty" line, which reason
        // the turn closes with — keys off this, so it has to be accurate.
        // The poller returns its latched value immediately once tripped.
        const stoppedTurn = stopped || (await shouldStop());

        // Escalation check — if the model said something that smells like
        // "I'd need to actually...", hand off to the agent path with the
        // same user message. Streamed replies were vetted by the hold-back
        // window; short replies (never opened the gate) get the full-text
        // check the pre-streaming implementation ran. A stopped turn never
        // escalates — the user asked it to end.
        if (!stoppedTurn && input.onEscalate && (escalationLatched || (!gateOpen && shouldEscalate(result.text)))) {
          // Tag this attempt with the escalation route. The agent path
          // will write its OWN ChatUsage row tagged 'agent' so the
          // breakdown shows both: a 'direct→agent' direct attempt that
          // led to an 'agent' fulfilment.
          await recordChatUsage({
            spaceId: input.spaceId,
            userId: input.userId,
            conversationId: input.conversationId,
            model: input.model,
            promptTokens: result.usage.promptTokens,
            completionTokens: result.usage.completionTokens,
            cachedTokens: result.usage.cachedTokens,
            costUsd: result.usage.costUsd,
            route: 'direct→agent' as ChatRoute,
            runtime: 'ts',
          });
          const agentResponse = await input.onEscalate().catch((err) => {
            logger.warn('[direct-stream] escalation handler threw', { spaceId: input.spaceId }, err);
            return null;
          });
          if (agentResponse?.body) {
            // Tell the browser the turn moved to the agent route, then pipe
            // the agent stream's bytes through verbatim. The agent path
            // persists its own assistant message and ChatUsage row, so
            // nothing below this block should run.
            push({ type: 'route_picked', route: 'agent', escalated: true });
            settlementDelegated = true;
            leaseGuardian?.stop();
            const reader = agentResponse.body.getReader();
            try {
              for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                // Keep draining even after the client leaves — the agent
                // path persists its message as its stream is consumed.
                if (!clientGone) {
                  try {
                    controller.enqueue(value);
                  } catch {
                    clientGone = true;
                  }
                }
              }
            } finally {
              reader.releaseLock();
            }
            return;
          }
          // Couldn't hand off — fall through and commit the direct answer
          // so the realtor at least sees the model's reasoning.
        }

        if (result.fallbackNote) {
          push({ type: 'fallback_note', message: result.fallbackNote });
        }

        // What the realtor should end up with. Normally the model's reply;
        // when the provider returned NO visible text (thinking consumed the
        // whole completion budget, a content filter fired, an empty choice
        // came back) we say so instead of completing the turn silently —
        // that silence is indistinguishable from "Chippi ignored me", and
        // because nothing gets persisted the turn also vanishes on reload.
        let finalText = result.text;
        if (!stoppedTurn && !finalText.trim()) {
          finalText = chippiErrorMessage('empty_reply');
          logger.warn('[direct-stream] provider returned no visible text', {
            spaceId: input.spaceId,
            conversationId: input.conversationId,
          });
          push({ type: 'text_delta', delta: finalText });
        } else if (!gateOpen && finalText) {
          // A reply short enough that the hold-back window never cleared was
          // fully buffered — flush it now. Anything longer already streamed.
          push({ type: 'text_delta', delta: finalText });
        }
        terminalOutcome = stoppedTurn
          ? { status: 'cancelled', reason: 'interrupted' }
          : { status: 'completed', reason: 'complete' };
        // Persist the assistant message + telemetry. The reasoning trace
        // goes first (Claude / o1 pattern — same ordering the client uses
        // live) so the "Thought for Xs" disclosure survives reload.
        if (finalText.trim()) {
          const blocks: MessageBlock[] = [
            ...(result.reasoningText.trim()
              ? [
                  {
                    type: 'reasoning',
                    content: result.reasoningText.trim(),
                    durationMs: Date.now() - turnStartedAt,
                  } as MessageBlock,
                ]
              : []),
            { type: 'text', content: finalText },
          ];
          try {
            leaseGuardian?.assertActive();
            if (input.turnId && input.attemptToken) {
              await leaseGuardian?.prepareToCommit();
              const receipt = await saveConversationTurnAssistantMessage({
                spaceId: input.spaceId,
                conversationId: input.conversationId,
                turnId: input.turnId,
                attemptToken: input.attemptToken,
                outcome: terminalOutcome,
                blocks,
              });
              terminalOutcome = {
                status: receipt.terminalStatus,
                reason: receipt.terminalReason,
              };
              atomicallySettled = true;
              leaseGuardian?.commitSucceeded();
              leaseGuardian?.stop();
            } else {
              await saveAssistantMessage({
                spaceId: input.spaceId,
                conversationId: input.conversationId,
                blocks,
              });
            }
          } catch (err) {
            const authorityFailure = leaseGuardian?.hasLostAuthority()
              || /lease|attempt token|terminal result/i.test(
                err instanceof Error ? err.message : String(err),
              );
            terminalOutcome = {
              status: 'failed',
              reason: authorityFailure ? 'lease_authority_lost' : 'persistence',
              error: err instanceof Error ? err.message : 'Assistant message persistence failed.',
            };
            logger.warn(
              '[direct-stream] save assistant message failed',
              { spaceId: input.spaceId, conversationId: input.conversationId },
              err,
            );
            // The browser may have seen streamed text, but it must not see a
            // successful terminal receipt when the authoritative transcript
            // could not be committed. Keeping the ledger failed prevents a
            // later queued turn from proceeding with missing context.
            push({
              type: 'error',
              message: authorityFailure
                ? 'This turn no longer had authority to publish its reply.'
                : chippiErrorMessage('persistence'),
              code: authorityFailure ? 'lease_authority_lost' : 'persistence',
            });
          }
        }
        if (terminalOutcome.status !== 'failed' && await settleBeforeTerminal()) {
          push({
            type: 'turn_complete',
            reason: terminalOutcome.status === 'cancelled' ? 'aborted' : 'complete',
          });
        }
        await recordChatUsage({
          spaceId: input.spaceId,
          userId: input.userId,
          conversationId: input.conversationId,
          model: input.model,
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
          cachedTokens: result.usage.cachedTokens,
          costUsd: result.usage.costUsd,
          route: 'direct',
          runtime: 'ts',
        });
      } catch (err) {
        const leaseLost = leaseGuardian?.hasLostAuthority() ?? false;
        const aborted = (err as { name?: string })?.name === 'AbortError';
        if (leaseLost) {
          terminalOutcome = {
            status: 'failed',
            reason: 'lease_authority_lost',
            error: 'Conversation turn attempt authority could not be renewed.',
          };
          push({
            type: 'error',
            message: 'This turn lost execution authority and was stopped safely.',
            code: 'lease_authority_lost',
          });
        } else if (!aborted) {
          terminalOutcome = {
            status: 'failed',
            reason: 'stream_error',
            error: err instanceof Error ? err.message : 'Direct stream failed.',
          };
          logger.error('[direct-stream] crashed', { spaceId: input.spaceId }, err);
          push({ type: 'error', message: chippiErrorMessage('internal') });
        } else {
          terminalOutcome = { status: 'cancelled', reason: 'interrupted' };
          if (await settleBeforeTerminal()) {
            push({ type: 'turn_complete', reason: 'aborted' });
          }
        }
      } finally {
        leaseGuardian?.stop();
        if (
          input.onSettled
          && !atomicallySettled
          && !settlementDelegated
          && !separatelySettled
        ) {
          try {
            await input.onSettled(terminalOutcome);
          } catch (error) {
            logger.error('[direct-stream] durable turn settlement failed', {
              conversationId: input.conversationId,
              turnId: input.turnId,
            }, error);
          }
        }
        // Presence clears only after transcript persistence and durable
        // settlement have both completed or failed visibly.
        await markTurnEnded(input.conversationId);
        turnDone();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    // Client disconnected (tab/app closed, navigation). Do NOT abort — the
    // turn keeps running and persists, so the answer is waiting when the
    // user comes back. Bounded by the LLM client's own 120s timeout.
    cancel() {
      clientGone = true;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
