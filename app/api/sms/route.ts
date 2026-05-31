/**
 * GET /api/sms?slug=xxx
 *
 * Outbound SMS history for the workspace, grouped by phone number into
 * conversation rows. The realtor's send-as-them SMS isn't backed by an
 * inbox today — Telnyx hasn't been wired for inbound — so this surface
 * reads exclusively from the local `ContactActivity` audit trail that
 * every SMS send already writes (see `app/api/agent/send/route.ts`,
 * `lib/ai-tools/tools/send-sms.ts`, `lib/ai-tools/tools/log-sms-sent.ts`).
 *
 * Detection: `ContactActivity` rows are tagged via metadata. The CHECK
 * constraint on `type` doesn't include 'sms', so historical SMS rows
 * land as `type='note'` with one of:
 *   - `metadata.channel = 'sms'`   (`tools/send-sms.ts`, `agent/send`)
 *   - `metadata.via = 'sms'`        (`agent/send` adds this too)
 *   - `metadata.kind = 'sms'`       (`tools/log-sms-sent.ts`)
 *
 * We accept any of those tags. The body lives in `content` (and sometimes
 * also `metadata.body` for the explicit log tool).
 *
 * Payload shape mirrors the WhatsApp/email feed for parity:
 *   - Not configured → `{ connected: false }`
 *   - Configured     → `{ connected: true, items: SmsConversation[] }`
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSpaceOwner } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { findSmsConnection } from '@/lib/sms/connect';

export const runtime = 'nodejs';
export const maxDuration = 30;

/** Look-back window for the list view. SMS is high-frequency; 30 days
 *  keeps the list useful without scanning the whole audit trail. */
const LOOKBACK_DAYS = 30;
const MAX_ROWS = 500;

interface SmsConversation {
  /** Phone-number-derived id; URL-safe. `sms:<phone>`. */
  id: string;
  /** Display name (Contact name when linked, else phone). */
  fromName: string;
  /** Phone in whatever shape it was stored — usually E.164. */
  fromAddress: string;
  /** Most recent body (truncated). */
  snippet: string;
  /** ISO timestamp of most recent outbound. */
  lastAt: string;
  /** Outbound count to this number in the window. */
  outboundCount: number;
}

interface NotConfiguredPayload {
  connected: false;
}

interface ConfiguredPayload {
  connected: true;
  items: SmsConversation[];
  /** Honest one-liner the UI surfaces under the title — inbound isn't
   *  wired yet, and we'd rather say so than imply replies will appear. */
  noteInboundPending: true;
}

type Payload = NotConfiguredPayload | ConfiguredPayload;

/* ── Row shape from ContactActivity ──────────────────────────────────── */

interface ActivityRow {
  id: string;
  contactId: string | null;
  content: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface ContactRow {
  id: string;
  name: string | null;
  phone: string | null;
}

function isSmsRow(meta: Record<string, unknown> | null): boolean {
  if (!meta) return false;
  return (
    meta.channel === 'sms' ||
    meta.via === 'sms' ||
    meta.kind === 'sms'
  );
}

function bodyFromRow(row: ActivityRow): string {
  const meta = row.metadata;
  if (meta && typeof meta.body === 'string') return meta.body;
  // Tools prefix the audit content with "SMS:" or "Sent SMS:" — strip so
  // the snippet reads cleanly.
  const raw = (row.content ?? '').replace(/^\s*(?:\[Agent\]\s*)?(?:SMS sent|Sent SMS|SMS):\s*/i, '');
  return raw;
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

  const conn = await findSmsConnection(space.id);
  if (!conn) {
    const payload: NotConfiguredPayload = { connected: false };
    return NextResponse.json(payload);
  }

  const sinceIso = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();

  const { data: rawRows, error } = await supabase
    .from('ContactActivity')
    .select('id, "contactId", content, metadata, "createdAt"')
    .eq('spaceId', space.id)
    .gte('createdAt', sinceIso)
    .order('createdAt', { ascending: false })
    .limit(MAX_ROWS);

  if (error) {
    logger.warn('[api/sms] activity fetch failed', {
      spaceId: space.id,
      err: error.message,
    });
    return NextResponse.json(
      { error: 'Could not load SMS history.' },
      { status: 500 },
    );
  }

  const rows = ((rawRows ?? []) as ActivityRow[]).filter((r) => isSmsRow(r.metadata));

  // Resolve linked contacts in one shot (de-duped). ContactActivity.contactId
  // is NOT NULL, so every row has one; the metadata fallback below catches
  // legacy rows where the linked contact has since lost its phone.
  const contactIds = Array.from(
    new Set(rows.map((r) => r.contactId).filter((v): v is string => Boolean(v))),
  );
  const contactById = new Map<string, ContactRow>();
  if (contactIds.length > 0) {
    const { data: contactRows, error: contactErr } = await supabase
      .from('Contact')
      .select('id, name, phone')
      .in('id', contactIds);
    if (contactErr) {
      logger.warn('[api/sms] contact lookup failed', { err: contactErr.message });
    }
    for (const c of (contactRows ?? []) as ContactRow[]) {
      contactById.set(c.id, c);
    }
  }

  // Bucket rows by phone number. We prefer the linked contact's phone;
  // when the contact has no phone on file we fall back to whatever the
  // sender stashed in metadata (`to` for the surface, `toPhone` for the
  // agent tool path).
  const buckets = new Map<
    string,
    { phone: string; name: string; rows: ActivityRow[] }
  >();

  for (const row of rows) {
    const linkedContact = row.contactId ? contactById.get(row.contactId) : undefined;
    const metaPhone =
      typeof row.metadata?.to === 'string'
        ? (row.metadata.to as string)
        : typeof row.metadata?.toPhone === 'string'
          ? (row.metadata.toPhone as string)
          : null;
    const phone = linkedContact?.phone ?? metaPhone;
    if (!phone) continue;
    const key = phone.trim();
    if (!key) continue;
    const cur = buckets.get(key);
    if (cur) {
      cur.rows.push(row);
      // Prefer the named contact even if a later row was unlinked.
      if (!cur.name && linkedContact?.name) cur.name = linkedContact.name;
    } else {
      buckets.set(key, {
        phone: key,
        name: linkedContact?.name ?? '',
        rows: [row],
      });
    }
  }

  const items: SmsConversation[] = [];
  for (const bucket of buckets.values()) {
    // Rows are already DESC from the query, so the first is the latest.
    const latest = bucket.rows[0];
    const snippet = bodyFromRow(latest).trim().slice(0, 160);
    items.push({
      id: `sms:${encodeURIComponent(bucket.phone)}`,
      fromName: bucket.name || bucket.phone,
      fromAddress: bucket.phone,
      snippet,
      lastAt: latest.createdAt,
      outboundCount: bucket.rows.length,
    });
  }
  items.sort((a, b) => Date.parse(b.lastAt) - Date.parse(a.lastAt));

  const payload: ConfiguredPayload = {
    connected: true,
    items,
    noteInboundPending: true,
  };
  return NextResponse.json(payload);
}
