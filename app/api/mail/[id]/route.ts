/**
 * GET /api/mail/[id]?slug=xxx — fetch one message's full body from the
 * realtor's connected mail provider via Composio.
 *
 * The list endpoint returns a snippet; this endpoint is for the read pane
 * (tap a row → open in a dialog with the full body). Plain text only for
 * v1 — we strip any HTML the provider sends back rather than rendering
 * arbitrary HTML in our chrome.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSpaceOwner } from '@/lib/api-auth';
import { logger } from '@/lib/logger';
import { executeToolForEntity } from '@/lib/integrations/composio';
import { PROVIDER_MAIL_SLUGS, findEmailConnection } from '@/lib/mail/mirror';

export const runtime = 'nodejs';
export const maxDuration = 30;

export interface MailMessageDetail {
  id: string;
  threadId: string | null;
  fromName: string | null;
  fromEmail: string;
  to: string[];
  cc: string[];
  subject: string;
  /** Plain text — HTML stripped if the provider returned HTML. */
  body: string;
  receivedAt: string;
  webLink: string | null;
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

/** Strip HTML tags into plain text — minimal pass. We don't render the
 *  provider's HTML in our chrome (XSS surface is not worth opening for v1). */
function htmlToPlain(html: string): string {
  return html
    // Remove script/style blocks wholesale
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    // Newlines for block-level tags
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    // Drop remaining tags
    .replace(/<[^>]+>/g, '')
    // HTML entities — the common ones
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Squeeze excess whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseHeaderAddress(
  raw: string | null | undefined,
): { name: string | null; email: string } | null {
  if (!raw) return null;
  const value = String(raw).trim();
  if (!value) return null;
  const angled = value.match(/^([^<]*)<([^>]+)>\s*$/);
  if (angled) {
    return {
      name: angled[1].trim().replace(/^"|"$/g, '') || null,
      email: angled[2].trim().toLowerCase(),
    };
  }
  if (value.includes('@')) return { name: null, email: value.toLowerCase() };
  return null;
}

function parseAddressList(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((v) => (typeof v === 'string' ? parseHeaderAddress(v)?.email : null))
      .filter((e): e is string => Boolean(e));
  }
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((s) => parseHeaderAddress(s)?.email)
      .filter((e): e is string => Boolean(e));
  }
  return [];
}

/* ── Handler ──────────────────────────────────────────────────────────── */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  const connection = await findEmailConnection(space.id);
  if (!connection) {
    return NextResponse.json({ error: 'Connect a mailbox first.' }, { status: 400 });
  }

  const slugs = PROVIDER_MAIL_SLUGS[connection.toolkit];

  try {
    const args =
      connection.toolkit === 'gmail'
        ? { message_id: id, format: 'full' }
        : { message_id: id };
    const resp = await executeToolForEntity({
      entityId: connection.userId,
      slug: slugs.get,
      arguments: args,
    });

    if (!resp.successful) {
      logger.warn(
        '[api/mail/[id]] composio returned !successful',
        { spaceId: space.id, provider: connection.toolkit, id },
      );
      return NextResponse.json(
        { error: 'Could not reach your mailbox.' },
        { status: 502 },
      );
    }

    const data = (resp.data as Record<string, unknown> | undefined) ?? {};
    const out =
      connection.toolkit === 'gmail'
        ? normalizeGmailDetail(id, data)
        : normalizeOutlookDetail(id, data);
    return NextResponse.json({ message: out });
  } catch (err) {
    logger.error(
      '[api/mail/[id]] composio call threw',
      { spaceId: space.id, provider: connection.toolkit, id },
      err,
    );
    return NextResponse.json(
      { error: 'Could not reach your mailbox.' },
      { status: 502 },
    );
  }
}

/* ── Provider normalizers ─────────────────────────────────────────────── */

function normalizeGmailDetail(
  id: string,
  data: Record<string, unknown>,
): MailMessageDetail {
  const from = parseHeaderAddress(
    typeof data.sender === 'string' ? data.sender : (data.from as string | undefined),
  );
  // Gmail can return plain body via `messageText` or HTML via `payload.body`.
  // We prefer plain text; fall back to stripping HTML.
  let body = '';
  if (typeof data.messageText === 'string' && data.messageText.trim()) {
    body = data.messageText;
  } else if (typeof data.body === 'string' && data.body.trim()) {
    body = htmlToPlain(data.body);
  } else if (typeof data.snippet === 'string') {
    body = data.snippet;
  }

  const receivedAt = (() => {
    const v = data.messageTimestamp ?? data.internalDate;
    if (!v) return new Date(0).toISOString();
    if (typeof v === 'string') {
      const parsed = Date.parse(v);
      return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date(0).toISOString();
    }
    return new Date(Number(v)).toISOString();
  })();

  return {
    id,
    threadId: typeof data.threadId === 'string' ? data.threadId : null,
    fromName: from?.name ?? null,
    fromEmail: from?.email ?? 'unknown@unknown',
    to: parseAddressList(data.to),
    cc: parseAddressList(data.cc),
    subject: (typeof data.subject === 'string' ? data.subject : '').trim() || '(No subject)',
    body: body.trim(),
    receivedAt,
    webLink:
      typeof data.threadId === 'string'
        ? `https://mail.google.com/mail/u/0/#inbox/${data.threadId}`
        : null,
  };
}

function normalizeOutlookDetail(
  id: string,
  data: Record<string, unknown>,
): MailMessageDetail {
  const fromObj = (data.from as { emailAddress?: { name?: string; address?: string } } | undefined)
    ?.emailAddress;
  const body = (() => {
    const b = data.body as { content?: string; contentType?: string } | undefined;
    if (!b?.content) return '';
    return b.contentType?.toLowerCase() === 'html' ? htmlToPlain(b.content) : b.content;
  })();
  return {
    id,
    threadId: typeof data.conversationId === 'string' ? data.conversationId : null,
    fromName: fromObj?.name ?? null,
    fromEmail: (fromObj?.address ?? '').toLowerCase() || 'unknown@unknown',
    to: parseAddressList(
      (data.toRecipients as Array<{ emailAddress?: { address?: string } }> | undefined)?.map(
        (r) => r.emailAddress?.address ?? '',
      ),
    ),
    cc: parseAddressList(
      (data.ccRecipients as Array<{ emailAddress?: { address?: string } }> | undefined)?.map(
        (r) => r.emailAddress?.address ?? '',
      ),
    ),
    subject: (typeof data.subject === 'string' ? data.subject : '').trim() || '(No subject)',
    body: body.trim(),
    receivedAt:
      typeof data.receivedDateTime === 'string'
        ? data.receivedDateTime
        : new Date(0).toISOString(),
    webLink: typeof data.webLink === 'string' ? data.webLink : null,
  };
}
