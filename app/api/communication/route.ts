/**
 * GET /api/communication?slug=xxx
 *
 * Unified feed across the realtor's connected communication channels —
 * Gmail (or Outlook) on the email side, WhatsApp Business on the
 * messaging side. One sorted list, channel-tagged.
 *
 * The shape mirrors `/api/calendar/events`: connection presence is part
 * of the payload so the page renders the right shape with no flash.
 *   - Nothing connected → `{ connected: false, email: false, whatsapp: false }`
 *   - One or both connected → `{ connected: true, email: bool, whatsapp:
 *     bool, items: FeedItem[] }`
 *
 * 60s in-process memo per spaceId absorbs the page's own re-renders.
 * On-demand fetch; no background sync.
 *
 * Outlook list path: not implemented in v1. If only Outlook is connected,
 * the feed returns an empty list with a `noteOutlookReadPending` flag the
 * UI surfaces as a calm one-liner — honest beats fictional rows.
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
import {
  getCommunicationMemo,
  setCommunicationMemo,
  type ConnectedPayload,
  type FeedItem,
} from '@/lib/communication/memo';

export const runtime = 'nodejs';
export const maxDuration = 30;

const LOOKBACK_DAYS = 14;
const MAX_PER_CHANNEL = 50;

interface NotConnectedPayload {
  connected: false;
  email: false;
  whatsapp: false;
}

type Payload = NotConnectedPayload | ConnectedPayload;

/* ── Gmail fetch ─────────────────────────────────────────────────────── */

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

function snippetFrom(m: GmailRawMessage): string {
  if (typeof m.messageText === 'string' && m.messageText.trim().length > 0) {
    return m.messageText.trim().slice(0, 160);
  }
  const p = m.preview;
  if (typeof p === 'string') return p.trim().slice(0, 160);
  if (p && typeof p.body === 'string') return p.body.trim().slice(0, 160);
  return '';
}

function msgInstantMs(m: GmailRawMessage): number {
  const v = m.messageTimestamp;
  if (!v) return 0;
  const n = typeof v === 'string' ? Date.parse(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function fetchEmailFeed(
  conn: MailConnection,
): Promise<FeedItem[]> {
  if (conn.toolkit !== 'gmail') {
    // Outlook read path not wired yet — see route docstring.
    return [];
  }
  const query = `newer_than:${LOOKBACK_DAYS}d in:anywhere -in:spam -in:trash`;
  try {
    const resp = await executeToolForEntity({
      entityId: conn.userId,
      slug: PROVIDER_MAIL_SLUGS.gmail.list,
      arguments: {
        query,
        max_results: MAX_PER_CHANNEL,
        include_payload: false,
      },
    });
    if (resp.successful === false) {
      logger.warn(
        '[api/communication] gmail list returned !successful',
        { err: (resp as { error?: string }).error ?? null },
      );
      return [];
    }
    const data = resp.data as { messages?: unknown } | undefined;
    const messages = Array.isArray(data?.messages)
      ? (data!.messages as GmailRawMessage[])
      : [];

    // Bucket by thread, keep the latest message per thread.
    const buckets = new Map<string, GmailRawMessage>();
    for (const m of messages) {
      const key = m.threadId ?? m.messageId;
      if (!key) continue;
      const cur = buckets.get(key);
      if (!cur || msgInstantMs(m) > msgInstantMs(cur)) buckets.set(key, m);
    }

    const items: FeedItem[] = [];
    for (const [threadId, m] of buckets) {
      const sender = parseSender(m.sender);
      // For threads the realtor sent (no inbound), use the To header.
      let fromName = sender.name;
      let fromAddress = sender.address;
      if (!fromAddress) {
        const tos = Array.isArray(m.to) ? m.to : m.to ? [m.to] : [];
        if (tos[0]) {
          const t = parseSender(tos[0]);
          fromName = t.name;
          fromAddress = t.address;
        }
      }
      const lastAt = m.messageTimestamp
        ? new Date(msgInstantMs(m)).toISOString()
        : new Date().toISOString();
      items.push({
        id: `email:${threadId}`,
        channel: 'email',
        fromName: fromName || fromAddress || '(Unknown sender)',
        fromAddress: fromAddress,
        subject: (m.subject ?? '').trim() || null,
        snippet: snippetFrom(m),
        lastAt,
        unread: Array.isArray(m.labelIds) && m.labelIds.includes('UNREAD'),
      });
    }
    return items;
  } catch (err) {
    logger.error('[api/communication] gmail fetch threw', {}, err);
    return [];
  }
}

/* ── WhatsApp fetch ─────────────────────────────────────────────────── */

interface WhatsAppRawConversation {
  id?: string;
  conversation_id?: string;
  chatId?: string;
  contact?: { name?: string; phone?: string; wa_id?: string };
  contactName?: string;
  contactPhone?: string;
  phone?: string;
  from?: string;
  lastMessage?: { text?: string; body?: string; timestamp?: string | number };
  last_message?: { text?: string; body?: string; timestamp?: string | number };
  message?: string;
  body?: string;
  timestamp?: string | number;
  updated_at?: string;
  unread?: boolean;
  unreadCount?: number;
}

function whatsappInstantMs(c: WhatsAppRawConversation): number {
  const candidates: Array<string | number | undefined> = [
    c.lastMessage?.timestamp,
    c.last_message?.timestamp,
    c.timestamp,
    c.updated_at,
  ];
  for (const v of candidates) {
    if (v === undefined) continue;
    const n = typeof v === 'string' ? Date.parse(v) : Number(v);
    if (Number.isFinite(n) && n > 0) {
      // Heuristic: pre-2000 epoch ms means we got seconds — multiply.
      return n < 1_000_000_000_000 ? n * 1000 : n;
    }
  }
  return 0;
}

async function fetchWhatsAppFeed(
  conn: WhatsAppConnection,
): Promise<FeedItem[]> {
  // Try the candidate list slugs in order; the first non-error wins.
  // Composio sometimes ships several near-equivalent shapes per toolkit;
  // we don't know which one resolves until the API tells us.
  for (const slug of WHATSAPP_SLUGS.listCandidates) {
    try {
      const resp = await executeToolForEntity({
        entityId: conn.userId,
        slug,
        arguments: { limit: MAX_PER_CHANNEL },
      });
      if (resp.successful === false) {
        // Unknown slug or upstream rejection — try the next candidate.
        logger.debug(
          '[api/communication] whatsapp slug declined; trying next',
          { slug },
        );
        continue;
      }
      const data = resp.data as
        | { conversations?: unknown; messages?: unknown; items?: unknown }
        | undefined;
      const list =
        (Array.isArray(data?.conversations) ? data!.conversations : null) ??
        (Array.isArray(data?.messages) ? data!.messages : null) ??
        (Array.isArray(data?.items) ? data!.items : null) ??
        [];
      const rows = (list as WhatsAppRawConversation[]) ?? [];
      const items: FeedItem[] = [];
      for (const c of rows) {
        const id =
          c.id ?? c.conversation_id ?? c.chatId ?? c.contactPhone ?? c.phone;
        if (!id) continue;
        const contactName =
          c.contact?.name ??
          c.contactName ??
          c.contact?.phone ??
          c.contactPhone ??
          c.phone ??
          c.from ??
          '';
        const contactPhone =
          c.contact?.phone ??
          c.contact?.wa_id ??
          c.contactPhone ??
          c.phone ??
          c.from ??
          '';
        const snippet =
          c.lastMessage?.text ??
          c.lastMessage?.body ??
          c.last_message?.text ??
          c.last_message?.body ??
          c.message ??
          c.body ??
          '';
        const lastAt = whatsappInstantMs(c);
        items.push({
          id: `wa:${id}`,
          channel: 'whatsapp',
          fromName: contactName || contactPhone || '(Unknown contact)',
          fromAddress: contactPhone,
          subject: null,
          snippet: snippet.trim().slice(0, 160),
          lastAt:
            lastAt > 0 ? new Date(lastAt).toISOString() : new Date().toISOString(),
          unread: Boolean(c.unread) || (typeof c.unreadCount === 'number' && c.unreadCount > 0),
        });
      }
      return items;
    } catch (err) {
      logger.debug(
        '[api/communication] whatsapp slug threw; trying next',
        { slug, err: err instanceof Error ? err.message : String(err) },
      );
    }
  }
  // No slug resolved — return empty rather than a 500. The UI surfaces a
  // quiet note so the realtor knows we haven't fabricated silence.
  logger.warn(
    '[api/communication] no whatsapp list slug resolved; returning empty feed',
    {},
  );
  return [];
}

/* ── GET ─────────────────────────────────────────────────────────────── */

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) {
    return NextResponse.json({ error: 'slug required' }, { status: 400 });
  }

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  const conns = await findAnyCommunicationConnections(space.id);
  if (!conns.email && !conns.whatsapp) {
    const payload: NotConnectedPayload = {
      connected: false,
      email: false,
      whatsapp: false,
    };
    return NextResponse.json(payload);
  }

  const cached = getCommunicationMemo(space.id);
  if (cached) return NextResponse.json(cached);

  const [emailItems, whatsappItems] = await Promise.all([
    conns.email ? fetchEmailFeed(conns.email) : Promise.resolve<FeedItem[]>([]),
    conns.whatsapp ? fetchWhatsAppFeed(conns.whatsapp) : Promise.resolve<FeedItem[]>([]),
  ]);

  const items = [...emailItems, ...whatsappItems].sort(
    (a, b) => Date.parse(b.lastAt) - Date.parse(a.lastAt),
  );

  const payload: ConnectedPayload = {
    connected: true,
    email: Boolean(conns.email),
    whatsapp: Boolean(conns.whatsapp),
    items,
    ...(conns.email?.toolkit === 'outlook' && !conns.whatsapp
      ? { noteOutlookReadPending: true }
      : {}),
  };
  setCommunicationMemo(space.id, payload);
  return NextResponse.json(payload);
}
