import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { findSmsConnection } from '@/lib/sms/connect';
import { SmsThreadView } from './sms-thread-view';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: `SMS thread — ${slug}` };
}

/**
 * /s/[slug]/sms/[id] — one SMS conversation, addressed by phone-prefixed id.
 *
 * Server pass: workspace gate + presence check. Thread fetching happens
 * client-side via `/api/sms/[id]` so the server render stays cheap.
 */
export default async function SmsThreadPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const conn = await findSmsConnection(space.id);
  // If SMS isn't configured, sending a deep link here is dishonest; bounce
  // to the list page where the realtor sees the "not set up" prompt.
  if (!conn) {
    notFound();
  }

  return <SmsThreadView slug={slug} threadId={id} />;
}
