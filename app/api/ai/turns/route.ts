import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';
import { readJsonWithLimit, BODY_LIMITS } from '@/lib/validation';
import { sanitizeUserInput } from '@/lib/agent/prompt-sanitizer';
import { isReservedConversationTitle } from '@/lib/chat/conversation-access';
import { claimConversationMode } from '@/lib/chat/conversation-mode';
import { checkRateLimit } from '@/lib/rate-limit';
import {
  enqueueConversationTurn,
  recoverExpiredConversationTurns,
  type ConversationTurnAttachment,
  type ConversationTurnRecord,
} from '@/lib/chat/turn-control';

export const runtime = 'nodejs';

const PUBLIC_TURN_COLUMNS = [
  'id', 'spaceId', 'conversationId', 'mode', 'source', 'clientRequestId',
  'message', 'attachmentIds', 'attachments', 'priority', 'enqueueSeq',
  'status', 'cancelRequestedAt', 'startedAt', 'finishedAt', 'terminalReason',
  'createdAt', 'updatedAt',
].join(',');

const attachmentSchema = z.object({
  id: z.string().min(1).max(200),
  filename: z.string().min(1).max(500),
  mimeType: z.string().min(1).max(200),
  isImage: z.boolean().optional(),
  sizeBytes: z.number().int().nonnegative().max(25 * 1024 * 1024).optional(),
}).strict();

const enqueueSchema = z.object({
  conversationId: z.string().min(1).max(200),
  turnId: z.string().min(1).max(200).optional(),
  clientRequestId: z.string().min(1).max(200),
  mode: z.enum(['chat', 'work']),
  source: z.enum(['typed', 'voice', 'steer']).default('typed'),
  message: z.string().max(8000),
  attachmentIds: z.array(z.string().min(1).max(200)).max(20).optional(),
  attachments: z.array(attachmentSchema).max(20).optional(),
  activeTurnId: z.string().min(1).max(200).optional(),
}).strict();

async function callerConversation(userId: string, conversationId: string) {
  const space = await getSpaceForUser(userId);
  if (!space) return null;
  const { data: conversation } = await tenantTable(supabase, 'Conversation', { spaceId: space.id })
    .select('id, spaceId, title, mode')
    .eq('id', conversationId)
    .maybeSingle();
  if (!conversation || isReservedConversationTitle(conversation.title)) return null;
  return { space, conversation };
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const conversationId = req.nextUrl.searchParams.get('conversationId')?.trim() ?? '';
  if (!conversationId || conversationId.length > 200) {
    return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });
  }
  const bound = await callerConversation(auth.userId, conversationId);
  if (!bound) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Reconcile an already-expired running/approval lease before reporting the
  // queue. This uses the existing token-fenced database authority; without it,
  // a closed tab could leave an invisible active id that made every new send
  // queue forever even though no work was running.
  await recoverExpiredConversationTurns(supabase, 20).catch(() => {});

  // Load blockers separately so a long pending queue can never hide the one
  // running/paused/failed row that makes a client-side dispatch unsafe.
  const [blockers, pending] = await Promise.all([
    tenantTable(supabase, 'ConversationTurn', { spaceId: bound.space.id })
      .select(PUBLIC_TURN_COLUMNS)
      .eq('conversationId', conversationId)
      .in('status', ['running', 'paused', 'failed'])
      .order('updatedAt', { ascending: false })
      .limit(50),
    tenantTable(supabase, 'ConversationTurn', { spaceId: bound.space.id })
      .select(PUBLIC_TURN_COLUMNS)
      .eq('conversationId', conversationId)
      .eq('status', 'pending')
      .order('priority', { ascending: false })
      .order('enqueueSeq', { ascending: true })
      .limit(50),
  ]);
  if (blockers.error || pending.error) {
    return NextResponse.json({ error: 'Could not load queued turns' }, { status: 500 });
  }
  const turns = [...(blockers.data ?? []), ...(pending.data ?? [])]
    .map((turn) => ({ ...(turn as unknown as Record<string, unknown>), lastError: null })) as unknown as ConversationTurnRecord[];
  return NextResponse.json({ turns });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const read = await readJsonWithLimit(req, BODY_LIMITS.aiText);
  if (!read.ok) return read.response;
  const parsed = enqueueSchema.safeParse(read.data);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid queued turn' }, { status: 400 });
  const body = parsed.data;
  const limit = await checkRateLimit(`ai:turn-enqueue:${auth.userId}`, 120, 3600);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many queued messages. Try again later.' },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }
  const bound = await callerConversation(auth.userId, body.conversationId);
  if (!bound) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  let conversationMode = bound.conversation.mode;
  if (conversationMode !== null && conversationMode !== body.mode) {
    return NextResponse.json({ error: 'Conversation mode mismatch' }, { status: 409 });
  }
  if ((body.source === 'steer') !== Boolean(body.activeTurnId)) {
    return NextResponse.json({ error: 'Steering requires the exact active turn' }, { status: 400 });
  }

  const submittedMessage = body.message.trim();
  if (!submittedMessage && (body.attachmentIds?.length ?? 0) === 0) {
    return NextResponse.json({ error: 'Message or attachment is required' }, { status: 400 });
  }
  const normalizedMessage = submittedMessage || 'Review the attached files.';
  const sanitized = sanitizeUserInput(normalizedMessage);
  if (!sanitized.safe) {
    return NextResponse.json({ error: 'Message blocked by safety filter' }, { status: 400 });
  }

  const manifest = (body.attachments ?? []) as ConversationTurnAttachment[];
  const ids = body.attachmentIds ?? [];
  if (manifest.length > 0) {
    const manifestIds = manifest.map((attachment) => attachment.id);
    if (manifestIds.length !== ids.length || manifestIds.some((id, index) => id !== ids[index])) {
      return NextResponse.json({ error: 'Attachment manifest mismatch' }, { status: 400 });
    }
    const { data: attachments } = await tenantTable(supabase, 'Attachment', { spaceId: bound.space.id })
      .select('id, filename, mimeType')
      .in('id', ids);
    const storedAttachments = (attachments ?? []) as Array<{
      id: string;
      filename: string;
      mimeType: string;
    }>;
    const byId = new Map(storedAttachments.map((attachment) => [attachment.id, attachment]));
    if (manifest.some((item) => {
      const stored = byId.get(item.id);
      return !stored || stored.filename !== item.filename || stored.mimeType !== item.mimeType;
    })) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 400 });
    }
  } else if (ids.length > 0) {
    // Queue durability requires enough metadata to render/recover the files;
    // do not accept ids that the client would then forget on navigation.
    return NextResponse.json({ error: 'Attachment manifest is required for queued files' }, { status: 400 });
  }

  if (conversationMode === null) {
    try {
      conversationMode = await claimConversationMode(supabase, {
        conversationId: body.conversationId,
        spaceId: bound.space.id,
        requestedMode: body.mode,
      });
    } catch {
      return NextResponse.json({ error: 'Could not claim conversation mode' }, { status: 500 });
    }
  }
  if (conversationMode !== body.mode) {
    return NextResponse.json({ error: 'Conversation mode mismatch' }, { status: 409 });
  }

  try {
    const turn = await enqueueConversationTurn(supabase, {
      turnId: body.turnId ?? crypto.randomUUID(),
      spaceId: bound.space.id,
      conversationId: body.conversationId,
      mode: conversationMode,
      source: body.source,
      clientRequestId: body.clientRequestId,
      message: sanitized.sanitized,
      attachmentIds: ids,
      attachments: manifest,
      ...(body.activeTurnId ? { activeTurnId: body.activeTurnId } : {}),
    });
    return NextResponse.json({ turn }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const conflict = /mismatch|conflict|not running|held/i.test(message);
    return NextResponse.json(
      { error: conflict ? message : 'Could not queue turn' },
      { status: conflict ? 409 : 500 },
    );
  }
}
