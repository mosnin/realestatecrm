/**
 * DEPRECATED — the in-process approval-resume flow no longer applies; chat
 * tools now use AgentDraft for non-autonomous mode. This route stays for the
 * (currently disabled) legacy in-process loop and may be removed in a
 * follow-up. The Modal-backed /api/ai/task path runs each turn in an
 * ephemeral sandbox that is gone before any approval could land, so the
 * cowork agent drafts to the inbox via create_draft_message instead of
 * pausing. Do not wire new callers to this endpoint.
 */

/**
 * POST /api/ai/task/approve/[requestId]
 *
 * Resumes a paused on-demand agent turn. The original POST /api/ai/task
 * call hit a mutating tool, emitted `permission_required`, and persisted
 * its `PendingApprovalState` to Redis keyed by `requestId`. This endpoint
 * picks that state up, applies the user's decision (approve / deny,
 * optionally with edited args — Phase 3d), and streams the continuation
 * as a fresh SSE response.
 *
 * Rate limits intentionally diverge from the base /api/ai/task route:
 * approvals are cheap (one tool call + one model reply, vs. a whole turn)
 * so we allow more of them per hour.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type OpenAI from 'openai';
import { requireAuth } from '@/lib/api-auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { continueTurn } from '@/lib/ai-tools/continue-turn';
import type { AgentEvent, PushableEvent } from '@/lib/ai-tools/events';
import { createSeqCounter, encodeEvent } from '@/lib/ai-tools/events';
import { getOpenAIClient, MissingOpenAIKeyError } from '@/lib/ai-tools/openai-client';
import { consumePendingApproval, savePendingApproval } from '@/lib/ai-tools/pending-approvals';
import { saveAssistantMessage } from '@/lib/ai-tools/persistence';
import { resolveToolContext } from '@/lib/ai-tools/context';
import type { ToolContext } from '@/lib/ai-tools/types';

interface PostBody {
  decision: 'approved' | 'denied';
  /** Phase 3d — override the pending call's args before running. */
  editedArgs?: Record<string, unknown>;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const { requestId } = await params;
  if (!requestId || typeof requestId !== 'string') {
    return NextResponse.json({ error: 'requestId required' }, { status: 400 });
  }

  // Body parse + decision validation.
  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (body.decision !== 'approved' && body.decision !== 'denied') {
    return NextResponse.json(
      { error: 'decision must be "approved" or "denied"' },
      { status: 400 },
    );
  }
  const editedArgs =
    body.editedArgs && typeof body.editedArgs === 'object' && !Array.isArray(body.editedArgs)
      ? (body.editedArgs as Record<string, unknown>)
      : undefined;

  // Must be a logged-in user. We'll additionally verify they OWN this
  // pending approval after consuming it, so a leaked requestId doesn't let
  // another workspace resume someone else's turn.
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { allowed } = await checkRateLimit(`ai:task-approve:${userId}`, 60, 3600);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded for approvals' },
      { status: 429 },
    );
  }

  // Atomic consume — one shot, no replays.
  const record = await consumePendingApproval(requestId);
  if (!record) {
    return NextResponse.json(
      { error: 'Approval request not found or expired' },
      { status: 410 },
    );
  }
  if (record.userId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Rebuild a fresh ToolContext for this resume — the original turn's
  // AbortSignal is long gone, and we need a new one tied to this request.
  const abortController = new AbortController();
  const ctxOrResponse = await resolveToolContext(record.spaceSlug, abortController.signal);
  if (ctxOrResponse instanceof NextResponse) {
    // Space was deleted, user lost access, etc. Surface gracefully.
    return ctxOrResponse;
  }
  const ctx: ToolContext = ctxOrResponse;

  let openai: OpenAI;
  try {
    openai = getOpenAIClient().client;
  } catch (err) {
    if (err instanceof MissingOpenAIKeyError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    throw err;
  }

  // ── SSE stream ──────────────────────────────────────────────────────────
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const nextSeq = createSeqCounter();
      const pushEvent = async (event: PushableEvent) => {
        const full = { ...event, seq: nextSeq(), ts: new Date().toISOString() } as AgentEvent;
        try {
          controller.enqueue(encodeEvent(full));
        } catch {
          // Controller closed (client disconnected) — swallow.
        }
      };

      try {
        const result = await continueTurn({
          openai,
          ctx,
          pendingState: record.state,
          decision: body.decision,
          editedArgs,
          pushEvent,
        });

        try {
          if (result.blocks.length > 0) {
            await saveAssistantMessage({
              spaceId: ctx.space.id,
              conversationId: record.conversationId,
              blocks: result.blocks,
            });
          }
        } catch (err) {
          logger.error(
            '[ai/task/approve] save continuation message failed',
            { requestId, spaceSlug: record.spaceSlug },
            err,
          );
        }

        // If continueTurn itself paused again (another mutation in the
        // batch or in a subsequent round), persist the new state so the
        // next approve call can find it.
        if (result.reason === 'paused' && result.pendingApproval) {
          await savePendingApproval({
            state: result.pendingApproval,
            userId: ctx.userId,
            spaceSlug: record.spaceSlug,
            conversationId: record.conversationId,
            createdAt: new Date().toISOString(),
          });
        }

        await pushEvent({ type: 'turn_complete', reason: result.reason });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error('[ai/task/approve] continuation crashed', { requestId }, err);
        await pushEvent({ type: 'error', message, code: 'internal' });
      } finally {
        controller.close();
      }
    },
    cancel() {
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
