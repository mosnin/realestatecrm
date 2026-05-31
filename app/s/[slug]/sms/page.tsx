import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { findSmsConnection } from '@/lib/sms/connect';
import { SmsListView } from './sms-list-view';
import { PAGE_RHYTHM } from '@/lib/typography';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: `SMS — ${slug}` };
}

/**
 * /s/[slug]/sms — the realtor's outbound SMS, in here.
 *
 * Sibling of `/communication`: same paper-flat vocabulary, same Chippi
 * voice, scoped to one channel so each surface stays calm and one-thing.
 * SMS is workspace-level (Telnyx env config), not a per-user OAuth, so
 * the "connected" check is just whether the env is wired.
 *
 * Outbound-only v1: inbound replies aren't stored yet (no Telnyx webhook).
 * The list reads the workspace's `ContactActivity` audit trail; new sends
 * audit straight back into the same table so the next list read picks them
 * up. The page surfaces an honest one-liner about inbound being pending.
 */
export default async function SmsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const conn = await findSmsConnection(space.id);

  return (
    <div className={PAGE_RHYTHM}>
      <SmsListView slug={slug} initialConnected={Boolean(conn)} />
    </div>
  );
}
