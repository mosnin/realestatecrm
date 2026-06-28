/**
 * In-process autonomous agent runner — the Modal-free path for background work.
 *
 * Every autonomous path (routines, triggers, the sweep) historically dispatched
 * to Modal's run_now_webhook and failed silently when Modal wasn't configured.
 * This module drives the SAME TS agent runtime the chat SSE route uses, but
 * HEADLESS: no Clerk request context, no SSE controller, no event pushing. It
 * exists so Chippi's background work runs even without the external Modal
 * deployment.
 *
 * It mirrors the canonical completion-driving loop in
 * `lib/ai-tools/sdk-chat-stream.ts` (buildSseStream's start handler): consume
 * `result.toStream()` to `done`, await `result.completed` behind an idle
 * watchdog, then persist the assistant message via `saveAssistantMessage`. The
 * agent's draft tools (lib/ai-tools/tools/draft-*.ts) write AgentDraft rows as
 * side effects DURING the run — those drafts are the output.
 *
 * Autonomy posture — CRITICAL: this is UNATTENDED. There is no human to tap
 * "Send". If the run pauses for approval (a gated send), we DO NOT auto-approve.
 * The draft-producing tools have already run; the gated send stays pending and
 * unexecuted. This matches the product's "Chippi never sends without a tap"
 * rule: background runs DRAFT ONLY.
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type { ToolContext } from '@/lib/ai-tools/types';
import type { MessageBlock } from '@/lib/ai-tools/blocks';
import { runChatTurn } from '@/lib/ai-tools/sdk-chat';
import { saveAssistantMessage } from '@/lib/ai-tools/persistence';
import { mapSdkEvent, type SdkStreamEventLike } from '@/lib/ai-tools/sdk-event-mapper';
import { ALL_TOOLS } from '@/lib/ai-tools/tools';

/** Default wall-clock budget for one headless run when the caller passes no
 *  signal. Generous enough for a multi-step drafting run; the SDK's own
 *  per-request LLM timeout (120s) sits underneath. */
const DEFAULT_RUN_TIMEOUT_MS = 120_000;

/**
 * Idle watchdog for the headless pump. If the SDK stream yields no event and the
 * run never completes for this long, treat it as wedged and abort. Mirrors the
 * stream path's PUMP_IDLE_TIMEOUT_MS — the same guard against a stalled run
 * parking `reader.read()` / `result.completed` forever.
 */
const PUMP_IDLE_TIMEOUT_MS = 90_000;

/** Loose shape of the SDK streamed result — same surface the stream pump reads.
 *  Kept local and minimal so we don't lock to a specific SDK type. */
interface SdkResultLike {
  toStream(): { getReader(): ReadableStreamDefaultReader<unknown> };
  completed: Promise<void>;
  interruptions?: ReadonlyArray<unknown>;
}

/**
 * Build a ToolContext WITHOUT requireAuth — the headless counterpart of
 * `resolveToolContext` (lib/ai-tools/context.ts). Background runs have no
 * request, so we resolve the space directly by id and derive the acting user
 * from its owner.
 *
 * Queries Space by id, then User by id = ownerId to get the owner's Clerk id
 * (the identity whose integrations the run uses, matching the Clerk userId the
 * request-bound context carries). Returns null when either row is missing.
 */
export async function buildHeadlessToolContext(
  spaceId: string,
  signal: AbortSignal,
): Promise<ToolContext | null> {
  const { data: space } = await supabase
    .from('Space')
    .select('id, slug, name, ownerId')
    .eq('id', spaceId)
    .maybeSingle();
  if (!space) {
    logger.warn('[agent/run-instruction] space not found', { spaceId });
    return null;
  }

  const { data: owner } = await supabase
    .from('User')
    .select('clerkId')
    .eq('id', space.ownerId)
    .maybeSingle();
  if (!owner?.clerkId) {
    logger.warn('[agent/run-instruction] space owner has no clerkId', { spaceId, ownerId: space.ownerId });
    return null;
  }

  return {
    userId: owner.clerkId,
    space: {
      id: space.id,
      slug: space.slug,
      name: space.name,
      ownerId: space.ownerId,
    },
    signal,
  };
}

export interface RunAutonomousInstructionInput {
  spaceId: string;
  instruction: string;
  /** Caller-owned cancellation. When omitted we create one with a default
   *  timeout so a wedged run can't run forever. */
  signal?: AbortSignal;
  /** Workspace chat model slug. Resolved to the active provider downstream. */
  model?: string;
}

export interface RunAutonomousInstructionResult {
  /** The run completed without throwing (it may have left drafts and/or
   *  pending approvals). */
  ok: boolean;
  /** The agent run actually started (a ctx was resolved and runChatTurn fired). */
  ran: boolean;
  /** Present when ok is false. */
  error?: string;
  /** Short human-readable note about how the run ended. */
  summary?: string;
}

/**
 * Run one instruction through the headless TS agent and drive it to completion.
 *
 * Drives the SDK result exactly like `buildSseStream`'s start handler, minus
 * the SSE controller and event pushing: read `result.toStream()` to `done`
 * (each read raced against the idle watchdog), then await `result.completed`.
 * The draft tools write AgentDraft rows during the run; that's the output. The
 * assistant message is persisted with `saveAssistantMessage` so the run leaves
 * a transcript, the same as the chat path.
 *
 * Approvals are NOT auto-approved: if the run pauses with interruptions, we
 * stop cleanly and report that the run completed with pending approvals (the
 * gated send stays unexecuted; the drafts already exist).
 */
export async function runAutonomousInstruction(
  input: RunAutonomousInstructionInput,
): Promise<RunAutonomousInstructionResult> {
  // Use the caller's signal when given; otherwise own an AbortController with a
  // sensible wall-clock budget so a stalled run can't park forever.
  const ownController = input.signal ? null : new AbortController();
  const signal = input.signal ?? ownController!.signal;
  const timeoutTimer = ownController
    ? setTimeout(() => ownController.abort(), DEFAULT_RUN_TIMEOUT_MS)
    : null;

  try {
    const ctx = await buildHeadlessToolContext(input.spaceId, signal);
    if (!ctx) {
      return {
        ok: false,
        ran: false,
        error: 'space or owner not found',
        summary: 'Could not resolve a context for this space.',
      };
    }

    // Headless: no resultSink (we don't surface rich cards to a UI), no history
    // (a background instruction is self-contained).
    const { result } = await runChatTurn({
      ctx,
      userMessage: input.instruction,
      history: [],
      model: input.model,
    });

    const sdkResult = result as unknown as SdkResultLike;

    // Accumulate the assistant's text so the run leaves a transcript, mirroring
    // the stream path. We only need text here — no rich tool-card persistence,
    // since there's no UI to re-render them for a background run.
    let textBuffer = '';

    // Pump the stream to completion. Each read is raced against the idle
    // watchdog so a wedged run aborts instead of parking forever.
    const stream = sdkResult.toStream();
    const reader = stream.getReader();
    while (true) {
      const { done, value } = await withIdleTimeout(reader.read(), signal);
      if (done) break;
      const mapped = mapSdkEvent(value as SdkStreamEventLike, ALL_TOOLS);
      if (mapped && mapped.type === 'text_delta') {
        textBuffer += mapped.delta;
      }
    }
    // Block until the SDK declares the run complete so result.interruptions is
    // stable before we read it. Same watchdog — the SDK can finish the stream
    // yet never resolve `completed`.
    await withIdleTimeout(sdkResult.completed, signal);

    // Pause path: an unattended run NEVER auto-approves. The draft tools have
    // already run (drafts persisted as side effects); the gated send stays
    // pending and unexecuted. Record that the run completed with approvals
    // outstanding and stop cleanly.
    const paused = !!(sdkResult.interruptions && sdkResult.interruptions.length > 0);

    // Persist the assistant text so the background run leaves a transcript, the
    // same as the chat path. Empty text is normal on a paused/tool-only turn —
    // saveAssistantMessage substitutes a placeholder. conversationId is null:
    // background runs aren't attached to a chat thread.
    if (textBuffer.trim()) {
      const blocks: MessageBlock[] = [{ type: 'text', content: textBuffer }];
      try {
        await saveAssistantMessage({
          spaceId: ctx.space.id,
          conversationId: null,
          blocks,
        });
      } catch (err) {
        // Persistence is best-effort for a background run — the drafts are the
        // real output and they already landed. Log and continue.
        logger.warn('[agent/run-instruction] saveAssistantMessage failed', { spaceId: ctx.space.id }, err);
      }
    }

    return {
      ok: true,
      ran: true,
      summary: paused
        ? 'Run completed with pending approvals (drafts created; gated sends left unexecuted).'
        : 'Run completed.',
    };
  } catch (err) {
    const aborted = (err as { name?: string })?.name === 'AbortError';
    if (aborted) {
      logger.warn('[agent/run-instruction] run aborted (timeout or cancel)', { spaceId: input.spaceId });
      return { ok: false, ran: true, error: 'aborted', summary: 'Run aborted before completion.' };
    }
    logger.error('[agent/run-instruction] run failed', { spaceId: input.spaceId }, err);
    return {
      ok: false,
      ran: true,
      error: err instanceof Error ? err.message : String(err),
      summary: 'Run failed.',
    };
  } finally {
    if (timeoutTimer) clearTimeout(timeoutTimer);
  }
}

// ── Internals ──────────────────────────────────────────────────────────────

/** Distinct from AbortError on purpose — see the stream pump's StreamStalledError.
 *  A stall must surface as an error, not be mistaken for a clean client abort. */
class RunStalledError extends Error {
  constructor() {
    super('Agent run stalled — no activity within the idle timeout.');
    this.name = 'RunStalledError';
  }
}

/**
 * Race a pump await against the idle watchdog. On timeout we reject with
 * RunStalledError so the pump stops waiting; the run shares the AbortSignal we
 * passed into runChatTurn, so the outer timeout/cancel is what actually winds
 * the SDK down. We also reject if that signal aborts mid-await. A settled `p`
 * clears the timer so a healthy run pays nothing. Mirrors the stream path's
 * withIdleTimeout.
 */
function withIdleTimeout<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new RunStalledError());
    }, PUMP_IDLE_TIMEOUT_MS);
    // If the signal aborts (caller cancel or our own timeout), stop waiting.
    const onAbort = () => {
      clearTimeout(timer);
      const e = new Error('The operation was aborted');
      e.name = 'AbortError';
      reject(e);
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
    p.then(
      (v) => {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        reject(e);
      },
    );
  });
}
