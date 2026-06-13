import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { AfterCloseView, type RelationshipRow } from '@/components/after-close/after-close-view';
import type { Metadata } from 'next';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Relationships — ${slug}` };
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const ANNIVERSARY_WINDOW_DAYS = 14;

/** Days until the next month/day anniversary of a close date (UTC, wraps the
 *  year). Null if there's no close date. Calendar-date math, not a day count. */
function daysUntilAnniversary(closedAt: string | null, now: Date): number | null {
  if (!closedAt) return null;
  const closed = new Date(closedAt);
  if (isNaN(closed.getTime())) return null;
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let next = Date.UTC(now.getUTCFullYear(), closed.getUTCMonth(), closed.getUTCDate());
  if (next < todayUTC) {
    next = Date.UTC(now.getUTCFullYear() + 1, closed.getUTCMonth(), closed.getUTCDate());
  }
  return Math.round((next - todayUTC) / MS_PER_DAY);
}

type RawContact = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  relationshipStage: string | null;
  lastClosedAt: string | null;
  lastContactedAt: string | null;
  nextTouchAt: string | null;
  referralAskedAt: string | null;
};

export default async function AfterClosePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const { data } = await supabase
    .from('Contact')
    .select(
      'id, name, email, phone, relationshipStage, lastClosedAt, lastContactedAt, nextTouchAt, referralAskedAt',
    )
    .eq('spaceId', space.id)
    .is('brokerageId', null)
    .in('relationshipStage', ['past_client', 'referral_target', 'dormant'])
    .order('lastClosedAt', { ascending: false, nullsFirst: false })
    .limit(1000);

  const now = new Date();
  const rows: RelationshipRow[] = (data ?? []).map((c) => {
    const contact = c as RawContact;
    const anniversaryDays = daysUntilAnniversary(contact.lastClosedAt, now);
    return {
      id: contact.id,
      name: contact.name,
      stage: (contact.relationshipStage ?? 'past_client') as RelationshipRow['stage'],
      lastClosedAt: contact.lastClosedAt,
      lastContactedAt: contact.lastContactedAt,
      nextTouchAt: contact.nextTouchAt,
      referralAskedAt: contact.referralAskedAt,
      anniversaryDays,
      anniversaryDue:
        anniversaryDays !== null &&
        anniversaryDays >= 0 &&
        anniversaryDays <= ANNIVERSARY_WINDOW_DAYS,
    };
  });

  return <AfterCloseView slug={slug} rows={rows} />;
}
