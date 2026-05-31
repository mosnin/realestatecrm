import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { findWhatsAppConnection } from '@/lib/communication/connect';
import { WhatsAppConversationListView } from './whatsapp-list-view';
import { PAGE_RHYTHM } from '@/lib/typography';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: `WhatsApp — ${slug}` };
}

/**
 * /s/[slug]/whatsapp — WhatsApp Business conversations.
 *
 * One list, contacts. Tap a row → full conversation page. No tabs, no
 * filters in v1; what the realtor wants is to find a thread and reply.
 *
 * Server pass renders connection presence so the page paints the right
 * shape with no flash. Conversation fetch happens client-side.
 */
export default async function WhatsAppPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const conn = await findWhatsAppConnection(space.id);

  return (
    <div className={PAGE_RHYTHM}>
      <WhatsAppConversationListView
        slug={slug}
        initialConnected={Boolean(conn)}
      />
    </div>
  );
}
