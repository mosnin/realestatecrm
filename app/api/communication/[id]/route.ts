/**
 * GET /api/communication/[id]?slug=xxx
 *
 * One thread (email) or one conversation (WhatsApp), addressed by a
 * channel-prefixed id from the feed payload:
 *   - `email:<gmail-thread-id>` → fetches the Gmail thread's messages
 *   - `wa:<conversation-id>` → fetches the WhatsApp conversation's messages
 *
 * The prefix means callers don't need a separate `?channel=` query
 * param; the source of truth for what channel a row belongs to is the
 * row's id, set when the feed is constructed.
 *
 * Returns `{ channel, messages: Message[] }`. `Message` is the same
 * shape across both channels — fromName, fromAddress, body, sentAt —
 * with `subject` only set for email messages. WhatsApp messages are
 * sequenced as they come back from the provider; email messages are
 * sequenced by timestamp ascending so the realtor reads top-down.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSpaceOwner } from '@/lib/api-auth';
import { logger } from '@/lib/logger';
import { executeToolForEntity } from '@/lib/integrations/composio';
import {
  findAnyCommunicationConnections,
  PROVIDER_MAIL_SLUGS,
  WHATSAPP_SLUGS,
  type MailConnection,
  type WhatsAppConnection,
} from '@/lib/communication/connect';

export const runtime = 'nodejs';
export const maxDuration = 30;

export interface ThreadMessage {
  id: string;
  /** Sender display name or "" if unknown. */
  fromName: string;
  /** Sender email or phone — the addressable identifier. */
  fromAddress: string;
  /** Email subject; null for WhatsApp. */
  subject: string | null;
  body: string;
  sentAt: string;
  /** Did the realtor send this one? UI right-aligns the realtor's own messages. */
  fromMe: boolean;
}

interface OkPayload {
  channel: 'email' | 'whatsapp';
  messages: ThreadMessage[];
}

interface ErrPayload {
  error: string;
}

type Payload = OkPayload | ErrPayload;

function decodeId(rawId: string): {
  channel: 'email' | 'whatsapp';
  externalId: string;
} | null {
  const decoded = decodeURIComponent(rawId);
  if (decoded.startsWith('email:')) {
    return { channel: 'email', externalId: decoded.slice('email:'.length) };
  }
  if (decoded.startsWith('wa:')) {
    return { channel: 'whatsapp', externalId: decoded.slice('wa:'.length) };
  }
  return null;
}

/* ── Email thread fetch ─────────────────────────────────────────────── */

interface GmailRawMessage {
  messageId?: string;
  threadId?: string;
  sender?: string;
  to?: string | string[];
  subject?: string;
  messageText?: string;
  preview?: { body?: string } | string;
  messageTimestamp?: string;
  labelIds?: string[];
}

function parseSender(headerValue: string | undefined | null): {
  name: string;
  address: string;
} {
  if (!headerValue) return { name: '', address: '' };
  const value = String(headerValue).trim();
  const angled = value.match(/^(.*?)<([^>]+)>\s*$/);
  if (angled) {
    return {
      name: angled[1].trim().replace(/^"|"$/g, '').trim(),
      address: angled[2].trim().toLowerCase(),
    };
  }
  if (value.includes('@')) return { name: '', address: value.toLowerCase() };
  return { name: value, address: '' };
}

function gmailInstantMs(m: GmailRawMessage): number {
  const v = m.messageTimestamp;
  if (!v) return 0;
  const n = typeof v === 'string' ? Date.parse(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function gmailBody(m: GmailRawMessage): string {
  if (typeof m.messageText === 'string' && m.messageText.length > 0) {
    return m.messageText;
  }
  const p = m.preview;
  if (typeof p === 'string') return p;
  if (p && typeof p.body === 'string') return p.body;
  return '';
}

async function fetchEmailThread(args: {
  conn: MailConnection;
  threadId: string;
}): Promise<{ messages: ThreadMessage[] } | { error: string }> {
  if (args.conn.toolkit !== 'gmail') {
    return { error: 'Outlook thread read isn’t wired yet.' };
  }
  try {
    // GMAIL_FETCH_EMAILS with a thread_id constraint returns the thread's
    // messages — that's the documented thread-fetch path. Compose's
    // SDK accepts `thread_id` directly as an arg.
    const resp = await executeToolForEntity({
      entityId: args.conn.userId,
      slug: PROVIDER_MAIL_SLUGS.gmail.list,
      arguments: {
        thread_id: args.threadId,
        max_results: 50,
        include_payload: true,
      },
    });
    if (resp.successful === false) {
      const err = (resp as { error?: string }).error ?? 'fetch_failed';
      logger.warn('[api/communication/:id] gmail thread fetch !successful', { err });
      return { error: 'Could not load this thread.' };
    }
    const data = resp.data as { messages?: unknown } | undefined;
    const raw = Array.isArray(data?.messages)
      ? (data!.messages as GmailRawMessage[])
      : [];
    const messages: ThreadMessage[] = raw
      .map((m): ThreadMessage => {
        const sender = parseSender(m.sender);
        return {
          id: m.messageId ?? `${args.threadId}-${gmailInstantMs(m)}`,
          fromName: sender.name,
          fromAddress: sender.address,
          subject: (m.subject ?? '').trim() || null,
          body: gmailBody(m),
          sentAt: m.messageTimestamp
            ? new Date(gmailInstantMs(m)).toISOString()
            : new Date().toISOString(),
          fromMe: Array.isArray(m.labelIds) && m.labelIds.includes('SENT'),
        };
      })
      .sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt));
    return { messages };
  } catch (err) {
    logger.error('[api/communication/:id] gmail fetch threw', {}, err);
    return { error: 'Could not load this thread.' };
  }
}

/* ── WhatsApp conversation fetch ────────────────────────────────────── */

interface WhatsAppRawMessage {
  id?: string;
  message_id?: string;
  from?: string;
  to?: string;
  sender?: { name?: string; phone?: string };
  fromName?: string;
  text?: string;
  body?: string;
  message?: string;
  timestamp?: string | number;
  sent_at?: string;
  direction?: 'inbound' | 'outbound' | string;
  fromMe?: boolean;
}

function whatsappInstantMs(m: WhatsAppRawMessage): number {
  const candidates: Array<string | number | undefined> = [m.timestamp, m.sent_at];
  for (const v of candidates) {
    if (v === undefined) continue;
    const n = typeof v === 'string' ? Date.parse(v) : Number(v);
    if (Number.isFinite(n) && n > 0) {
      return n < 1_000_000_000_000 ? n * 1000 : n;
    }
  }
  return 0;
}

async function fetchWhatsAppConversation(args: {
  conn: WhatsAppConnection;
  conversationId: string;
}): Promise<{ messages: ThreadMessage[] } | { error: string }> {
  for (const slug of WHATSAPP_SLUGS.getCandidates) {
    try {
      const resp = await executeToolForEntity({
        entityId: args.conn.userId,
        slug,
        // Pass several common shapes — Composio's WhatsApp tool args
        // aren't always documented and we want the first that resolves.
        arguments: {
          conversation_id: args.conversationId,
          conversationId: args.conversationId,
          chat_id: args.conversationId,
          to: args.conversationId,
          phone_number: args.conversationId,
          limit: 50,
        },
      });
      if (resp.successful === false) {
        logger.debug(
          '[api/communication/:id] whatsapp slug declined',
          { slug },
        );
        continue;
      }
      const data = resp.data as
        | { messages?: unknown; items?: unknown }
        | undefined;
      const raw =
        (Array.isArray(data?.messages) ? data!.messages : null) ??
        (Array.isArray(data?.items) ? data!.items : null) ??
        [];
      const rows = raw as WhatsAppRawMessage[];
      const messages: ThreadMessage[] = rows
        .map((m): ThreadMessage => {
          const fromAddress = m.from ?? m.sender?.phone ?? '';
          const fromName = m.sender?.name ?? m.fromName ?? '';
          const body = m.text ?? m.body ?? m.message ?? '';
          const inst = whatsappInstantMs(m);
          const fromMe =
            typeof m.fromMe === 'boolean'
              ? m.fromMe
              : m.direction === 'outbound';
          return {
            id: m.id ?? m.message_id ?? `${args.conversationId}-${inst}`,
            fromName,
            fromAddress,
            subject: null,
            body,
            sentAt: inst > 0 ? new Date(inst).toISOString() : new Date().toISOString(),
            fromMe,
          };
        })
        .sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt));
      return { messages };
    } catch (err) {
      logger.debug(
        '[api/communication/:id] whatsapp slug threw',
        { slug, err: err instanceof Error ? err.message : String(err) },
      );
    }
  }
  return { error: 'Could not load this conversation.' };
}

/* ── GET ─────────────────────────────────────────────────────────────── */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) {
    return NextResponse.json({ error: 'slug required' }, { status: 400 });
  }
  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  const { id: rawId } = await params;
  const decoded = decodeId(rawId);
  if (!decoded) {
    return NextResponse.json(
      { error: 'Unknown id shape.' },
      { status: 400 },
    );
  }

  const conns = await findAnyCommunicationConnections(space.id);
  if (decoded.channel === 'email') {
    if (!conns.email) {
      return NextResponse.json(
        { error: 'Email is not connected.' },
        { status: 400 },
      );
    }
    const result = await fetchEmailThread({
      conn: conns.email,
      threadId: decoded.externalId,
    });
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }
    const payload: OkPayload = { channel: 'email', messages: result.messages };
    return NextResponse.json(payload);
  }

  // whatsapp
  if (!conns.whatsapp) {
    return NextResponse.json(
      { error: 'WhatsApp is not connected.' },
      { status: 400 },
    );
  }
  const result = await fetchWhatsAppConversation({
    conn: conns.whatsapp,
    conversationId: decoded.externalId,
  });
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  const payload: OkPayload = { channel: 'whatsapp', messages: result.messages };
  return NextResponse.json(payload);
}
