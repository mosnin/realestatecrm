/**
 * GET /api/leads/first-touch
 *
 * Feed source for the Instant First Touch card on the /chippi home
 * (components/leads/first-touch-card.tsx). Returns the space's PENDING
 * first-touch drafts (AgentDraft rows stamped
 * triggerSource->>kind = 'first_touch' by lib/leads/first-touch.ts),
 * newest first, joined with the lead facts the card renders: name, source,
 * arrival time, a one-line "want" derived from intake answers, and a short
 * draft preview.
 *
 * Same auth + sourcing pattern as /api/agent/drafts (the focus card's
 * feed): Clerk auth → resolve the caller's space → spaceId-scoped query.
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import {
  FIRST_TOUCH_TRIGGER_KIND,
  firstTouchSourceLabel,
  firstTouchWant,
} from '@/lib/leads/first-touch';

interface JoinedContact {
  id: string;
  name: string | null;
  createdAt: string | null;
  leadType: string | null;
  budget: number | null;
  preferences: string | null;
  source: string | null;
  sourceLabel: string | null;
}

interface DraftRow {
  id: string;
  channel: 'email' | 'sms' | 'note';
  subject: string | null;
  content: string;
  createdAt: string;
  Contact: JoinedContact | null;
}

export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data, error } = await supabase
    .from('AgentDraft')
    .select(
      `
      id, channel, subject, content, createdAt,
      Contact:contactId ( id, name, createdAt, leadType, budget, preferences, source, sourceLabel )
    `,
    )
    .eq('spaceId', space.id)
    .eq('status', 'pending')
    .eq('triggerSource->>kind', FIRST_TOUCH_TRIGGER_KIND)
    .order('createdAt', { ascending: false })
    .limit(5);

  if (error) throw error;

  const items = ((data ?? []) as unknown as DraftRow[]).map((row) => ({
    id: row.id,
    channel: row.channel,
    subject: row.subject,
    preview: row.content,
    createdAt: row.createdAt,
    contactId: row.Contact?.id ?? null,
    leadName: (row.Contact?.name ?? '').trim() || 'New lead',
    source: row.Contact ? firstTouchSourceLabel(row.Contact) : 'Unknown source',
    // The lead "arrived" when the contact was created; the draft follows
    // within seconds, so the draft timestamp is the honest fallback.
    arrivedAt: row.Contact?.createdAt ?? row.createdAt,
    want: row.Contact ? firstTouchWant(row.Contact) : null,
  }));

  return NextResponse.json(items);
}
