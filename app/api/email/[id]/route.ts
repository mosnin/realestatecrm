/**
 * GET /api/email/[id]?slug=xxx
 *
 * One email message, fully loaded. Backs the full-page read at
 * /s/[slug]/email/[id] — subject, sender, recipients, body, time, star
 * state, plus the Gmail webLink so the realtor can punch out to Gmail
 * itself.
 *
 * Uses GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID with full payload — the per-
 * message slug returns the body without query-DSL gymnastics that
 * GMAIL_FETCH_EMAILS demands.
 *
 * Returns both a plain-text body (for reply quoting) and a sanitized HTML
 * body (for rich, Gmail-like rendering in a sandboxed iframe on the client).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSpaceOwner } from '@/lib/api-auth';
import { logger } from '@/lib/logger';
import { executeToolForEntity } from '@/lib/integrations/composio';
import {
  findEmailConnection,
  PROVIDER_MAIL_SLUGS,
} from '@/lib/communication/connect';
import DOMPurify from 'isomorphic-dompurify';

export const runtime = 'nodejs';
export const maxDuration = 30;

export interface EmailMessageOut {
  id: string;
  threadId: string;
  fromName: string;
  fromAddress: string;
  /** Display-friendly To list — first recipient name + address if available. */
  to: { name: string; address: string }[];
  cc: { name: string; address: string }[];
  subject: string | null;
  body: string;
  /** Sanitized HTML body for rich rendering; null when only plain text exists. */
  bodyHtml: string | null;
  sentAt: string;
  starred: boolean;
  /** Open-in-Gmail web link when the provider returned one. */
  webLink: string | null;
}

interface OkPayload {
  ok: true;
  message: EmailMessageOut;
}

interface ErrPayload {
  ok: false;
  error: string;
}

interface GmailRawMessage {
  messageId?: string;
  threadId?: string;
  sender?: string;
  from?: string;
  to?: string | string[];
  cc?: string | string[];
  subject?: string;
  messageText?: string;
  preview?: { body?: string } | string;
  payload?: {
    body?: { data?: string };
    parts?: Array<{
      mimeType?: string;
      body?: { data?: string };
    }>;
  };
  messageTimestamp?: string;
  labelIds?: string[];
  webLink?: string;
  web_link?: string;
}

function parseAddress(headerValue: string | undefined | null): {
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

function parseAddresses(
  headerValue: string | string[] | undefined,
): { name: string; address: string }[] {
  if (!headerValue) return [];
  const raw: string[] = Array.isArray(headerValue) ? headerValue : [headerValue];
  const items: { name: string; address: string }[] = [];
  for (const entry of raw) {
    for (const piece of entry.split(',')) {
      const trimmed = piece.trim();
      if (!trimmed) continue;
      items.push(parseAddress(trimmed));
    }
  }
  return items;
}

function gmailInstantMs(m: GmailRawMessage): number {
  const v = m.messageTimestamp;
  if (!v) return 0;
  const n = typeof v === 'string' ? Date.parse(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function stripHtml(html: string): string {
  // Tiny, conservative — same approach the existing communication route
  // takes. Strip tags, decode the common entities, collapse whitespace.
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeBase64Url(value: string): string {
  try {
    const normal = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded =
      normal + (normal.length % 4 ? '='.repeat(4 - (normal.length % 4)) : '');
    return Buffer.from(padded, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

function looksLikeHtml(s: string): boolean {
  return /<(?:html|body|div|table|p|br|span|a|img|head|meta|style|ul|ol|h[1-6])\b/i.test(s);
}

/**
 * Pull BOTH a plain-text body (for reply quoting) and an HTML body (for rich
 * rendering) out of the Gmail payload. Gmail stores the body in any of several
 * places depending on the message; check them in order and keep the first
 * plain and first HTML found.
 */
function extractBodies(m: GmailRawMessage): { text: string; html: string } {
  let plain = '';
  let html = '';

  // 1. Multipart: dedicated text/plain and text/html parts.
  for (const part of m.payload?.parts ?? []) {
    const data = part?.body?.data;
    if (!data) continue;
    if (part.mimeType === 'text/plain' && !plain) plain = decodeBase64Url(data);
    else if (part.mimeType === 'text/html' && !html) html = decodeBase64Url(data);
  }

  // 2. Composio's convenience field — may carry either flavour.
  if (typeof m.messageText === 'string' && m.messageText.trim()) {
    if (looksLikeHtml(m.messageText)) {
      if (!html) html = m.messageText;
    } else if (!plain) {
      plain = m.messageText;
    }
  }

  // 3. Single-part messages carry the body directly on payload.body.
  const directBody = m.payload?.body?.data;
  if (directBody) {
    const decoded = decodeBase64Url(directBody);
    if (looksLikeHtml(decoded)) {
      if (!html) html = decoded;
    } else if (!plain) {
      plain = decoded;
    }
  }

  // 4. Last resort: the preview snippet (always plain).
  if (!plain && !html) {
    const p = m.preview;
    if (typeof p === 'string') plain = p;
    else if (p && typeof p.body === 'string') plain = p.body;
  }

  // Text is what replies quote; derive it from the HTML when that's all we have.
  const text = plain || (html ? stripHtml(html) : '');
  return { text, html };
}

/**
 * Sanitize an email's HTML before it leaves the server. Strips scripts, event
 * handlers, frames and forms while keeping the presentational markup + inline
 * styles that make the email render like it does in Gmail. The client also
 * renders this inside a sandboxed iframe (no allow-scripts), so this is defense
 * in depth, not the only line.
 */
function sanitizeEmailHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    WHOLE_DOCUMENT: true,
    ADD_ATTR: ['target'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'noscript', 'base'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) {
    return NextResponse.json<ErrPayload>(
      { ok: false, error: 'slug required' },
      { status: 400 },
    );
  }

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  const conn = await findEmailConnection(space.id);
  if (!conn) {
    return NextResponse.json<ErrPayload>(
      { ok: false, error: 'Connect email first.' },
      { status: 400 },
    );
  }
  if (conn.toolkit !== 'gmail') {
    return NextResponse.json<ErrPayload>(
      { ok: false, error: 'Outlook read is on the way.' },
      { status: 400 },
    );
  }

  const { id: rawId } = await params;
  const messageId = decodeURIComponent(rawId);

  try {
    const resp = await executeToolForEntity({
      entityId: conn.userId,
      slug: PROVIDER_MAIL_SLUGS.gmail.get,
      arguments: {
        message_id: messageId,
        messageId,
        format: 'full',
      },
    });

    if (resp.successful === false) {
      const err = (resp as { error?: string }).error ?? 'fetch_failed';
      logger.warn('[api/email/:id] gmail get !successful', { err });
      return NextResponse.json<ErrPayload>(
        { ok: false, error: 'Could not load this email.' },
        { status: 502 },
      );
    }

    const raw = (resp.data as GmailRawMessage) ?? {};
    const sender = parseAddress(raw.sender ?? raw.from);
    const tos = parseAddresses(raw.to);
    const ccs = parseAddresses(raw.cc);
    const labels = Array.isArray(raw.labelIds) ? raw.labelIds : [];
    const bodies = extractBodies(raw);
    const message: EmailMessageOut = {
      id: raw.messageId ?? messageId,
      threadId: raw.threadId ?? raw.messageId ?? messageId,
      fromName: sender.name,
      fromAddress: sender.address,
      to: tos,
      cc: ccs,
      subject: (raw.subject ?? '').trim() || null,
      body: bodies.text,
      bodyHtml: bodies.html ? sanitizeEmailHtml(bodies.html) : null,
      sentAt: raw.messageTimestamp
        ? new Date(gmailInstantMs(raw)).toISOString()
        : new Date().toISOString(),
      starred: labels.includes('STARRED'),
      webLink: raw.webLink ?? raw.web_link ?? null,
    };

    return NextResponse.json<OkPayload>({ ok: true, message });
  } catch (err) {
    logger.error('[api/email/:id] gmail fetch threw', {}, err);
    return NextResponse.json<ErrPayload>(
      { ok: false, error: 'Could not load this email.' },
      { status: 502 },
    );
  }
}
