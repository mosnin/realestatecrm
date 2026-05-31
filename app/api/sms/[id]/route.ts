/**
 * GET /api/sms/[id]?slug=xxx
 *
 * One SMS thread, addressed by the phone-prefixed id from the list payload:
 *   - `sms:<urlencoded-phone>` → all outbound rows to/from that number
 *
 * Outbound-only for v1 — Telnyx inbound webhook isn't wired. Each
 * `ThreadMessage` is `fromMe: true` so the thread view right-aligns the
 * realtor's bubbles and stays honest about the channel being one-way.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSpaceOwner } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { findSmsConnection } from '@/lib/sms/connect';

export const runtime = 'nodejs';
export const maxDuration = 30;

const LOOKBACK_DAYS = 90;

export interface SmsThreadMessage {
  id: string;
  fromName: string;
  fromAddress: string;
  body: string;
  sentAt: string;
  /** Always true for v1 — outbound only. Kept on the shape so the future
   *  inbound path can flip the value per row. */
  fromMe: boolean;
}

interface OkPayload {
  channel: 'sms';
  /** Display name for the conversation peer. */
  contactName: string;
  /** Phone of the conversation peer (E.164 ideally). */
  contactPhone: string;
  messages: SmsThreadMessage[];
}

interface ErrPayload {
  error: string;
}

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
  return meta.channel === 'sms' || meta.via === 'sms' || meta.kind === 'sms';
}

function bodyFromRow(row: ActivityRow): string {
  const meta = row.metadata;
  if (meta && typeof meta.body === 'string') return meta.body;
  return (row.content ?? '').replace(
    /^\s*(?:\[Agent\]\s*)?(?:SMS sent|Sent SMS|SMS):\s*/i,
    '',
  );
}

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

  const conn = await findSmsConnection(space.id);
  if (!conn) {
    return NextResponse.json(
      { error: 'SMS isn’t set up yet.' },
      { status: 400 },
    );
  }

  const { id: rawId } = await params;
  const decoded = decodeURIComponent(rawId);
  if (!decoded.startsWith('sms:')) {
    return NextResponse.json({ error: 'Unknown id shape.' }, { status: 400 });
  }
  const phone = decodeURIComponent(decoded.slice('sms:'.length)).trim();
  if (!phone) {
    return NextResponse.json({ error: 'Missing phone.' }, { status: 400 });
  }

  const sinceIso = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();

  // Match by Contact.phone — every audit row carries a contactId (NOT NULL
  // in schema), so the thread reduces to "all SMS-flagged rows belonging to
  // contacts that have this phone." A contact can in theory share a phone
  // with another contact (rare but legal in the schema); we union those.
  const { data: contacts, error: cErr } = await supabase
    .from('Contact')
    .select('id, name, phone')
    .eq('spaceId', space.id)
    .eq('phone', phone);
  if (cErr) {
    logger.warn('[api/sms/:id] contact lookup failed', { err: cErr.message });
    return NextResponse.json(
      { error: 'Could not load this conversation.' },
      { status: 500 },
    );
  }
  const contactList = (contacts ?? []) as ContactRow[];

  let collected: ActivityRow[] = [];
  if (contactList.length > 0) {
    const { data: rawActivity, error: aErr } = await supabase
      .from('ContactActivity')
      .select('id, "contactId", content, metadata, "createdAt"')
      .eq('spaceId', space.id)
      .in(
        'contactId',
        contactList.map((c) => c.id),
      )
      .gte('createdAt', sinceIso)
      .order('createdAt', { ascending: true });
    if (aErr) {
      logger.warn('[api/sms/:id] activity fetch failed', { err: aErr.message });
      return NextResponse.json(
        { error: 'Could not load this conversation.' },
        { status: 500 },
      );
    }
    collected = ((rawActivity ?? []) as ActivityRow[]).filter((r) =>
      isSmsRow(r.metadata),
    );
  }

  const contact = contactList[0] ?? null;

  const messages: SmsThreadMessage[] = collected.map((r) => ({
    id: r.id,
    fromName: 'You',
    fromAddress: '',
    body: bodyFromRow(r),
    sentAt: r.createdAt,
    fromMe: true,
  }));

  const payload: OkPayload = {
    channel: 'sms',
    contactName: contact?.name ?? phone,
    contactPhone: phone,
    messages,
  };
  return NextResponse.json(payload);
}
