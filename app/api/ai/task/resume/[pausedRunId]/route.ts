/**
 * POST /api/ai/task/resume/[pausedRunId]
 *
 * Resume a chat turn that paused on a tool approval. The new SDK-based
 * runtime persists every paused run as one row in `AgentPausedRun`. This
 * endpoint loads that row, applies the realtor's approve/deny decision,
 * and streams the continuation as SSE — same wire format as the fresh
 * turn at /api/ai/task.
 *
 * Contract is intentionally narrow:
 *   - One POST, opaque pausedRunId in the path
 *   - Body: { approved: boolean, message?: string, callId?: string }
 *     - `callId` is optional. If omitted, we apply the decision to the
 *       first pending approval on the run — which covers the common
 *       single-pending case. With multiple pending approvals, the UI
 *       must pass the callId from the AgentPausedRun.approvals[i].
 *     - `message` is the rejection reason that flows back to the model.
 *   - Response: text/event-stream of AgentEvents (same as /api/ai/task)
 *
 * Why a separate endpoint instead of reusing /api/agent/drafts/[id]:
 * paused runs are different objects with a different lifecycle from
 * AgentDrafts. AgentDrafts are autonomous-run send-or-store; paused runs
 * are interactive checkpoints. Conflating the two endpoints would force
 * the UI to discriminate on every action — cleaner to give the chat
 * agent its own resume verb.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';
import { chippiErrorMessage } from '@/lib/ai-tools/chippi-voice';
import type { ToolContext } from '@/lib/ai-tools/types';
import { streamTsResumeTurn } from '@/lib/ai-tools/sdk-chat-stream';
import { clearChatStop } from '@/lib/chat/stop-signal';
import {
  finishConversationTurnV2,
  resumePausedConversationTurnV2,
  type ConversationTurnRecord,
  type TurnTerminalOutcome,
} from '@/lib/chat/turn-control';
import { BODY_LIMITS, parseOrBadRequest, readJsonWithLimit } from '@/lib/validation';
import { chatRuntime } from '@/lib/ai-tools/runtime-flag';
import { assertSpaceEnabled } from '@/lib/agent/kill-switch';
import { isWorkbenchEnabled } from '@/lib/chippi/workbench-flag';
import {
  DEFAULT_WORK_EXECUTION_MODE,
  parseWorkExecutionMode,
} from '@/lib/chat/work-execution-mode';
import { isReservedConversationTitle } from '@/lib/chat/conversation-access';

const resumeBodySchema = z.object({
  approved: z.boolean(),
  message: z.string().max(1000).optional(),
  callId: z.string().trim().min(1).max(200).optional(),
  editedArgs: z.record(z.string(), z.unknown()).optional(),
}).strict();
type PostBody = z.infer<typeof resumeBodySchema>;

interface PausedRunRow {
  id: string;
  spaceId: string;
  userId: string;
  conversationId: string | null;
  turnId: string | null;
  runState: string;
  approvals: Array<{ callId: string; toolName: string; arguments: unknown; summary: string }>;
  attachmentManifest: Array<{ id: string; filename?: string }>;
  activeWorkbookContext?: unknown;
  status: 'pending' | 'resumed' | 'cancelled' | 'expired';
  expiresAt: string | null;
}

interface PersistedActiveWorkbookContext {
  artifactId: string;
  versionNumber: number;
  title: string;
}

function parseActiveWorkbookContext(value: unknown): PersistedActiveWorkbookContext | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const context = value as Record<string, unknown>;
  if (Object.keys(context).some((key) => key !== 'artifactId' && key !== 'versionNumber' && key !== 'title')) return null;
  if (typeof context.artifactId !== 'string' || context.artifactId.length < 1 || context.artifactId.length > 200) return null;
  if (!Number.isInteger(context.versionNumber) || (context.versionNumber as number) < 1) return null;
  if (typeof context.title !== 'string' || context.title.length < 1 || context.title.length > 200) return null;
  return { artifactId: context.artifactId, versionNumber: context.versionNumber as number, title: context.title };
}

/** Rehydrates only an identity that was server-derived at pause time. The
 * approval arguments must agree but can never introduce workbook authority. */
async function restoreApprovedWorkbookContext(
  paused: PausedRunRow,
  approvedArguments: unknown,
  spaceId: string,
): Promise<PersistedActiveWorkbookContext | null> {
  const persisted = parseActiveWorkbookContext(paused.activeWorkbookContext);
  if (!persisted || !approvedArguments || typeof approvedArguments !== 'object' || Array.isArray(approvedArguments)) return null;
  const args = approvedArguments as Record<string, unknown>;
  if (args.artifactId !== persisted.artifactId || args.sourceVersionNumber !== persisted.versionNumber || args.workbookTitle !== persisted.title) return null;
  try {
    const { data: artifact } = await supabase
      .from('Artifact')
      .select('id, title, artifactType, currentVersionId')
      .eq('id', persisted.artifactId)
      .eq('spaceId', spaceId)
      .maybeSingle();
    if (!artifact || artifact.artifactType !== 'workbook' || artifact.title !== persisted.title) return null;
    const { data: version } = await supabase
      .from('ArtifactVersion')
      .select('id, versionNumber')
      .eq('artifactId', persisted.artifactId)
      .eq('spaceId', spaceId)
      .eq('versionNumber', persisted.versionNumber)
      .maybeSingle();
    if (!version || version.versionNumber !== persisted.versionNumber) return null;
    return persisted;
  } catch {
    return null;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ pausedRunId: string }> },
) {

  const { pausedRunId } = await params;
  if (!pausedRunId || typeof pausedRunId !== 'string' || pausedRunId.length > 200) {
    return NextResponse.json({ error: 'pausedRunId required' }, { status: 400 });
  }

  const read = await readJsonWithLimit(req, BODY_LIMITS.smallJson);
  if (!read.ok) return read.response;
  const parsed = parseOrBadRequest(resumeBodySchema, read.data);
  if (!parsed.ok) return parsed.response;
  const body: PostBody = parsed.data;

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  // Per-user rate limit. Approvals are cheap so we allow plenty of them.
  const { allowed } = await checkRateLimit(`ai:task:resume:${auth.userId}`, 60, 3600);
  if (!allowed) {
    return NextResponse.json({ error: chippiErrorMessage('rate_limited') }, { status: 429 });
  }

  // Load + scope check. The userId stored on the row is the Clerk userId.
  // Keep old, feature-off deployments compatible until the additive Slice C
  // migration is applied. Once Workbench is enabled, the field is mandatory
  // for an approved transform and validation below fails closed if absent.
  const pausedColumns = isWorkbenchEnabled()
    ? 'id, spaceId, userId, conversationId, turnId, runState, approvals, attachmentManifest, activeWorkbookContext, status, expiresAt'
    : 'id, spaceId, userId, conversationId, turnId, runState, approvals, attachmentManifest, status, expiresAt';
  const { data: row, error } = await supabase
    .from('AgentPausedRun')
    .select(pausedColumns)
    .eq('id', pausedRunId)
    .eq('userId', auth.userId)
    .maybeSingle();
  if (error) {
    logger.error('[ai/task resume] load failed', { pausedRunId }, error);
    return NextResponse.json({ error: chippiErrorMessage('internal') }, { status: 500 });
  }
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const paused = row as unknown as PausedRunRow;
  if (paused.status !== 'pending') {
    return NextResponse.json({ error: `Run is ${paused.status}` }, { status: 409 });
  }
  if (paused.expiresAt && new Date(paused.expiresAt).getTime() < Date.now()) {
    // Best-effort flip; ignore failures — the request is over either way.
    await supabase.from('AgentPausedRun').update({ status: 'expired' }).eq('id', paused.id);
    return NextResponse.json({ error: 'Run expired' }, { status: 410 });
  }

  // Resolve the space row from the stored spaceId. We don't reuse
  // resolveToolContext here because that helper takes a slug — the paused
  // run carries the spaceId directly, which is more precise (the slug
  // could have changed between pause and resume).
  const { data: space } = await supabase
    .from('Space')
    .select('id, slug, name, ownerId')
    .eq('id', paused.spaceId)
    .maybeSingle();
  if (!space) {
    return NextResponse.json({ error: 'Space not found' }, { status: 404 });
  }

  // Re-verify CURRENT ownership, not just that the caller is the user who
  // paused this run — mirrors resolveToolContext so resume can never act
  // outside the caller's own space (e.g. if space ownership changed between
  // pause and resume). paused.userId is the Clerk id; map it to the internal
  // User id the way resolveToolContext does.
  const { data: ownerRow } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', auth.userId)
    .maybeSingle();
  if (!ownerRow || space.ownerId !== ownerRow.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Resume must restore the persisted conversation mode server-side. A Work
  // run rebuilt as Chat would let a newly proposed connected-app write create
  // an approval interruption that the Work UI intentionally does not render.
  // If the binding cannot be proven, stop before rehydrating provider tools.
  let workMode = false;
  let workExecutionMode = DEFAULT_WORK_EXECUTION_MODE;
  if (paused.conversationId) {
    const { data: conversation, error: conversationError } = await supabase
      .from('Conversation')
      .select('title, mode, executionMode')
      .eq('id', paused.conversationId)
      .eq('spaceId', paused.spaceId)
      .maybeSingle();
    if (conversationError || !conversation || isReservedConversationTitle(conversation.title)) {
      return NextResponse.json(
        { error: 'Conversation mode could not be restored for this run.' },
        { status: 409 },
      );
    }
    workMode = conversation.mode === 'work';
    workExecutionMode = parseWorkExecutionMode(conversation.executionMode);
  }

  const abortController = new AbortController();
  const ctx: ToolContext = {
    userId: auth.userId,
    space: { id: space.id, slug: space.slug, name: space.name, ownerId: space.ownerId },
    signal: abortController.signal,
    workMode,
    workExecutionMode,
  };

  // Pick which approval the decision applies to. The body can name a
  // specific callId; otherwise we use the first pending approval — which
  // is correct in the common single-pending case.
  const callId = body.callId ?? paused.approvals[0]?.callId;
  if (!callId) {
    return NextResponse.json({ error: 'No pending approvals on this run' }, { status: 400 });
  }
  const approvedCall = paused.approvals.find((approval) => approval.callId === callId);
  if (!approvedCall) return NextResponse.json({ error: 'Approval not found' }, { status: 400 });
  const workbenchTool = approvedCall?.toolName === 'open_spreadsheet_in_workbench'
    || approvedCall?.toolName === 'apply_workbook_transformation';
  // A transform approval is an exact compare-and-swap over the inspected
  // source id/hash and named operations. It is never an editable template.
  if (approvedCall?.toolName === 'apply_workbook_transformation' && body.editedArgs !== undefined) {
    return NextResponse.json({ error: 'Exact workbook approvals cannot be edited.' }, { status: 400 });
  }
  if (chatRuntime() !== 'ts' && !workbenchTool) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (workbenchTool && !isWorkbenchEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (approvedCall?.toolName === 'open_spreadsheet_in_workbench') {
    const args = approvedCall.arguments as { attachmentId?: unknown; attachmentFilename?: unknown } | null;
    const attachmentId = args?.attachmentId;
    const attachment = typeof attachmentId === 'string'
      ? paused.attachmentManifest?.find((candidate) => candidate.id === attachmentId)
      : undefined;
    // Approval arguments select a member of the server-hydrated, persisted
    // manifest; they never create attachment authority themselves.
    if (body.approved) {
      if (!attachment || typeof args?.attachmentFilename !== 'string' || args.attachmentFilename !== attachment.filename) return NextResponse.json({ error: 'Invalid approved attachment' }, { status: 400 });
      ctx.attachmentIds = [attachment.id];
      ctx.attachmentManifest = [{ id: attachment.id, filename: attachment.filename ?? '' }];
    }
  }
  try { await assertSpaceEnabled(paused.spaceId); } catch { return NextResponse.json({ error: 'Space is disabled' }, { status: 403 }); }

  if (approvedCall?.toolName === 'apply_workbook_transformation' && body.approved) {
    const activeWorkbook = await restoreApprovedWorkbookContext(paused, approvedCall.arguments, paused.spaceId);
    if (!activeWorkbook) {
      return NextResponse.json({ error: 'That workbook is no longer available for this approval. Reopen and inspect it again.' }, { status: 409 });
    }
    ctx.activeWorkbook = activeWorkbook;
  }

  // New durable turns resume the approval row and exact ConversationTurn in
  // one database transaction. This prevents the continuation from running
  // while its parent remains `paused` and holding every later queued message.
  let resumedTurn: ConversationTurnRecord | null = null;
  if (paused.turnId) {
    try {
      resumedTurn = await resumePausedConversationTurnV2(supabase, {
        pausedRunId: paused.id,
        turnId: paused.turnId,
        spaceId: paused.spaceId,
        userId: auth.userId,
      });
    } catch (resumeError) {
      logger.warn('[ai/task resume] durable resume rejected', { pausedRunId }, resumeError);
      return NextResponse.json({ error: 'Run is already resumed or no longer active' }, { status: 409 });
    }
  } else {
    // Rolling-deploy compatibility for approval rows created before the turn
    // ledger migration. These cannot hold a ConversationTurn queue.
    const { data: marked, error: markErr } = await supabase
      .from('AgentPausedRun')
      .update({ status: 'resumed', updatedAt: new Date().toISOString() })
      .eq('id', paused.id)
      .eq('status', 'pending')
      .select('id');
    if (markErr) {
      logger.error('[ai/task resume] status update failed', { pausedRunId }, markErr);
      return NextResponse.json({ error: chippiErrorMessage('internal') }, { status: 500 });
    }
    if (!marked || marked.length === 0) {
      return NextResponse.json({ error: 'Run is already resumed' }, { status: 409 });
    }
  }

  // A resume is a new streaming turn on the same conversation, so it needs the
  // same stale-Stop clear the initial turn gets in app/api/ai/task — otherwise
  // an old flag aborts the continuation the moment the realtor approves.
  if (paused.turnId) await clearChatStop(paused.turnId);

  if (resumedTurn && !resumedTurn.attemptToken) {
    logger.error('[ai/task resume] resumed turn missing attempt authority', {
      pausedRunId,
      turnId: resumedTurn.id,
    });
    return NextResponse.json({ error: chippiErrorMessage('internal') }, { status: 500 });
  }
  const resumedAttemptToken = resumedTurn?.attemptToken ?? undefined;

  const settleTurn = resumedTurn
      ? async (outcome: TurnTerminalOutcome) => {
        if (!resumedAttemptToken) throw new Error('Missing resumed turn attempt authority.');
        return finishConversationTurnV2(supabase, {
          turnId: resumedTurn.id,
          spaceId: resumedTurn.spaceId,
          conversationId: resumedTurn.conversationId,
          attemptToken: resumedAttemptToken,
          outcome,
        });
      }
    : undefined;

  return streamTsResumeTurn({
    ctx,
    conversationId: paused.conversationId ?? '',
    serializedState: paused.runState,
    callId,
    decision: body.approved
      ? { approved: true }
      : { approved: false, message: body.message },
    abortController,
    ...(resumedTurn
      ? {
          turnId: resumedTurn.id,
          attemptToken: resumedAttemptToken,
          onSettled: settleTurn,
        }
      : {}),
  });
}
