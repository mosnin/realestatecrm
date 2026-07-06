import { NextResponse } from 'next/server';
import { getBrokerMemberContext } from '@/lib/permissions';
import { readJsonWithLimit, BODY_LIMITS } from '@/lib/validation';
import {
  getMembership,
  listMessages,
  postMessage,
  channelReadState,
  serializeMessage,
} from '@/lib/messaging';
import type { ChannelMessageKind, MessageAttachment } from '@/lib/types';

type Params = { params: Promise<{ id: string }> };

const SENDABLE_KINDS: ChannelMessageKind[] = ['text', 'file', 'file_request', 'deal_status_request'];

/**
 * GET /api/messages/channels/[id]/messages — history for a channel the caller
 * belongs to, oldest→newest, paged via ?before=<ISO>. Also returns the per-
 * member read cursors so the client can render "seen by".
 */
export async function GET(req: Request, { params }: Params) {
  const ctx = await getBrokerMemberContext();
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;

  const membership = await getMembership(ctx.brokerage.id, id, ctx.dbUserId);
  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const url = new URL(req.url);
  const before = url.searchParams.get('before') ?? undefined;
  const [messages, reads] = await Promise.all([
    listMessages(id, { before }),
    channelReadState(id),
  ]);

  return NextResponse.json({
    messages: messages.map(serializeMessage),
    reads,
  });
}

/**
 * POST /api/messages/channels/[id]/messages — send a message. Body:
 *   { body?, kind?, attachments?, metadata? }
 * Membership is the gate. Text or attachments are required.
 */
export async function POST(req: Request, { params }: Params) {
  const ctx = await getBrokerMemberContext();
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;

  const membership = await getMembership(ctx.brokerage.id, id, ctx.dbUserId);
  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const read = await readJsonWithLimit(req, BODY_LIMITS.aiText);
  if (!read.ok) return read.response;
  const { body, kind, attachments, metadata } = (read.data ?? {}) as {
    body?: string;
    kind?: string;
    attachments?: MessageAttachment[];
    metadata?: Record<string, unknown>;
  };

  const msgKind: ChannelMessageKind = SENDABLE_KINDS.includes(kind as ChannelMessageKind)
    ? (kind as ChannelMessageKind)
    : 'text';
  const cleanBody = typeof body === 'string' ? body.trim() : '';
  const cleanAttachments = Array.isArray(attachments) ? attachments.slice(0, 10) : [];

  if (!cleanBody && cleanAttachments.length === 0 && msgKind === 'text') {
    return NextResponse.json({ error: 'Message is empty' }, { status: 400 });
  }

  const message = await postMessage(membership.channel, ctx.dbUserId, {
    body: cleanBody || null,
    kind: msgKind,
    attachments: cleanAttachments,
    metadata: metadata && typeof metadata === 'object' ? metadata : {},
  });

  return NextResponse.json({ message: serializeMessage(message) }, { status: 201 });
}
