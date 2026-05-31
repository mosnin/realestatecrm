/**
 * GET /api/mail?slug=xxx — list the 30 most recent inbox messages from
 * the realtor's connected mail provider (Gmail or Outlook), via Composio.
 *
 * Same architecture as /api/calendar/events GET:
 *   - On-demand fetch (no webhook receiver, no background sync, no DB cache)
 *   - 60s in-process memo per spaceId to absorb a realtor flipping between
 *     the inbox and other tabs in the UI
 *   - When nothing's connected we return `{ connected: false }` so the UI
 *     renders the connect prompt without a separate roundtrip
 *
 * Provider notes:
 *   - Gmail's GMAIL_FETCH_EMAILS supports a `query` arg using Gmail's `q:`
 *     DSL. `in:inbox -in:spam -in:trash` is the right surface for "what's
 *     in my inbox right now."
 *   - Outlook's OUTLOOK_LIST_MESSAGES (read-only path enabled for v1) takes
 *     a folder filter. We pass "inbox" — the messages list comes back in
 *     a different shape, which the normalizer below handles.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSpaceOwner } from '@/lib/api-auth';
import { logger } from '@/lib/logger';
import { executeToolForEntity } from '@/lib/integrations/composio';
import {
  PROVIDER_MAIL_SLUGS,
  findEmailConnection,
  type MailProvider,
} from '@/lib/mail/mirror';

export const runtime = 'nodejs';
export const maxDuration = 30;

const INBOX_LIMIT = 30;

interface CacheEntry {
  expiresAt: number;
  payload: ConnectedPayload;
}
const memo = new Map<string, CacheEntry>();
const MEMO_TTL_MS = 60_000;

export interface MailListItem {
  id: string;
  threadId: string | null;
  /** Sender display name, when the provider exposes one. */
  fromName: string | null;
  /** Sender email address, lowercased. */
  fromEmail: string;
  subject: string;
  snippet: string;
  /** ISO 8601. */
  receivedAt: string;
  unread: boolean;
  /** Provider URL when available (Gmail thread link, Outlook web link). */
  webLink: string | null;
}

interface NotConnectedPayload {
  connected: false;
}
interface ConnectedPayload {
  connected: true;
  provider: MailProvider;
  messages: MailListItem[];
}
type Payload = NotConnectedPayload | ConnectedPayload;

/* ── Normalizers ──────────────────────────────────────────────────────── */

/**
 * Parse "Name <addr@host>" into {name, email}. Tolerates bare addresses.
 * Mirrors lib/briefing/signal-sources/gmail.ts:parseEmailAddress but
 * preserves the display name (the brief code only needs the address).
 */
function parseHeaderAddress(
  raw: string | null | undefined,
): { name: string | null; email: string } | null {
  if (!raw) return null;
  const value = String(raw).trim();
  if (!value) return null;
  const angled = value.match(/^([^<]*)<([^>]+)>\s*$/);
  if (angled) {
    const name = angled[1].trim().replace(/^"|"$/g, '') || null;
    return { name, email: angled[2].trim().toLowerCase() };
  }
  if (value.includes('@')) {
    return { name: null, email: value.toLowerCase() };
  }
  return null;
}

interface GmailRawMessage {
  messageId?: string;
  threadId?: string;
  sender?: string;
  subject?: string;
  messageText?: string;
  preview?: { body?: string } | string;
  snippet?: string;
  messageTimestamp?: string | number;
  labelIds?: string[];
}

function normalizeGmailMessage(raw: GmailRawMessage): MailListItem | null {
  const id = raw.messageId;
  if (!id) return null;
  const from = parseHeaderAddress(raw.sender) ?? {
    name: null,
    email: 'unknown@unknown',
  };
  const rawSnippet =
    raw.snippet ??
    (typeof raw.preview === 'string'
      ? raw.preview
      : raw.preview?.body) ??
    raw.messageText ??
    '';
  const snippet = String(rawSnippet).trim().slice(0, 240);
  const labels = Array.isArray(raw.labelIds) ? raw.labelIds : [];
  const receivedAt = (() => {
    const v = raw.messageTimestamp;
    if (!v) return new Date(0).toISOString();
    if (typeof v === 'string') {
      const parsed = Date.parse(v);
      return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date(0).toISOString();
    }
    return new Date(Number(v)).toISOString();
  })();
  return {
    id,
    threadId: raw.threadId ?? null,
    fromName: from.name,
    fromEmail: from.email,
    subject: (raw.subject ?? '').trim() || '(No subject)',
    snippet,
    receivedAt,
    unread: labels.includes('UNREAD'),
    webLink: raw.threadId
      ? `https://mail.google.com/mail/u/0/#inbox/${raw.threadId}`
      : null,
  };
}

interface OutlookRawMessage {
  id?: string;
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  receivedDateTime?: string;
  isRead?: boolean;
  webLink?: string;
  from?: {
    emailAddress?: { name?: string; address?: string };
  };
}

function normalizeOutlookMessage(raw: OutlookRawMessage): MailListItem | null {
  const id = raw.id;
  if (!id) return null;
  const addr = raw.from?.emailAddress;
  const email = (addr?.address ?? '').toLowerCase() || 'unknown@unknown';
  return {
    id,
    threadId: raw.conversationId ?? null,
    fromName: addr?.name ?? null,
    fromEmail: email,
    subject: (raw.subject ?? '').trim() || '(No subject)',
    snippet: (raw.bodyPreview ?? '').trim().slice(0, 240),
    receivedAt: raw.receivedDateTime ?? new Date(0).toISOString(),
    unread: raw.isRead === false,
    webLink: raw.webLink ?? null,
  };
}

/**
 * Fish the messages array out of Composio's response shape. The wrapper
 * lands the provider response under `data`, with the list at
 * `data.messages` for Gmail, `data.value` for Outlook (Microsoft Graph),
 * and occasionally `data.items` depending on the composio action version.
 */
function extractMessages(resp: unknown, provider: MailProvider): unknown[] {
  const data = (resp as { data?: unknown })?.data as
    | { messages?: unknown; value?: unknown; items?: unknown; response_data?: unknown }
    | undefined;
  if (!data) return [];
  const candidates: unknown[] = [];
  if (Array.isArray(data.messages)) candidates.push(...data.messages);
  if (Array.isArray(data.value)) candidates.push(...data.value);
  if (Array.isArray(data.items)) candidates.push(...data.items);
  const wrapped = (data.response_data as { messages?: unknown; value?: unknown }) ?? null;
  if (wrapped) {
    if (Array.isArray(wrapped.messages)) candidates.push(...wrapped.messages);
    if (Array.isArray(wrapped.value)) candidates.push(...wrapped.value);
  }
  void provider; // future: provider-specific paths if shapes diverge further
  return candidates;
}

/* ── Handler ──────────────────────────────────────────────────────────── */

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) {
    return NextResponse.json({ error: 'slug required' }, { status: 400 });
  }

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  const connection = await findEmailConnection(space.id);
  if (!connection) {
    const payload: Payload = { connected: false };
    return NextResponse.json(payload);
  }

  const cached = memo.get(space.id);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.payload);
  }

  const slugs = PROVIDER_MAIL_SLUGS[connection.toolkit];
  let messages: MailListItem[] = [];

  try {
    const args =
      connection.toolkit === 'gmail'
        ? {
            // Gmail q DSL — server-side filtered, cheaper than client paging.
            query: 'in:inbox -in:spam -in:trash',
            max_results: INBOX_LIMIT,
            include_payload: false,
          }
        : {
            // Outlook / Microsoft Graph — folder + top.
            folder: 'inbox',
            top: INBOX_LIMIT,
          };

    const resp = await executeToolForEntity({
      entityId: connection.userId,
      slug: slugs.list,
      arguments: args,
    });

    if (resp.successful) {
      const raws = extractMessages(resp, connection.toolkit);
      for (const r of raws) {
        const normalized =
          connection.toolkit === 'gmail'
            ? normalizeGmailMessage(r as GmailRawMessage)
            : normalizeOutlookMessage(r as OutlookRawMessage);
        if (normalized) messages.push(normalized);
      }
      // Recent first; sometimes Composio honors order, sometimes it doesn't.
      messages.sort(
        (a, b) =>
          new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime(),
      );
      messages = messages.slice(0, INBOX_LIMIT);
    } else {
      logger.warn(
        '[api/mail] composio returned !successful',
        {
          spaceId: space.id,
          provider: connection.toolkit,
          err: (resp as { error?: string | null }).error ?? null,
        },
      );
    }
  } catch (err) {
    logger.error(
      '[api/mail] composio call threw',
      { spaceId: space.id, provider: connection.toolkit },
      err,
    );
    messages = [];
  }

  const payload: ConnectedPayload = {
    connected: true,
    provider: connection.toolkit,
    messages,
  };
  memo.set(space.id, { expiresAt: Date.now() + MEMO_TTL_MS, payload });
  return NextResponse.json(payload);
}
