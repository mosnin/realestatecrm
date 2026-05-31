import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { findAnyCommunicationConnections } from '@/lib/communication/connect';
import { CommunicationView } from './communication-view';
import { PAGE_RHYTHM } from '@/lib/typography';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Communication — ${slug}` };
}

/**
 * /s/[slug]/communication — the realtor's email + WhatsApp, in here.
 *
 * Same architecture as the calendar surface: Chippi doesn't own the inbox.
 * The realtor lives in Gmail (or Outlook) and WhatsApp Business; this
 * surface mirrors what's there and lets them compose + send through
 * whichever channel they pick.
 *
 * Server pass: figure out which channels are connected so the page can
 * render the right shape with no flash. Feed fetching happens client-side
 * via /api/communication to keep this server render cheap.
 */
export default async function CommunicationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const conns = await findAnyCommunicationConnections(space.id);

  return (
    <div className={PAGE_RHYTHM}>
      <CommunicationView
        slug={slug}
        initialEmailConnected={Boolean(conns.email)}
        initialWhatsAppConnected={Boolean(conns.whatsapp)}
        initialEmailProvider={conns.email?.toolkit ?? null}
      />
    </div>
  );
}
