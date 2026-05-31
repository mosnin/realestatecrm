import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { findEmailConnection } from '@/lib/mail/mirror';
import { MailView } from './mail-view';
import { PAGE_RHYTHM } from '@/lib/typography';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Mail — ${slug}` };
}

/**
 * /s/[slug]/mail — thin mirror of the realtor's connected email provider.
 *
 * Sibling of /s/[slug]/calendar — same shape, different domain. Chippi
 * doesn't own the inbox; the realtor lives in Gmail (or Outlook). This
 * surface reads the recent inbox on demand and lets them compose +
 * send directly through their provider via Composio.
 *
 * NOTE: this is NOT /s/[slug]/chippi/inbox, which is the
 * drafts + approvals queue (a completely separate feature shipped in
 * PR #137). The "Mail" sidebar label and the /mail route are deliberately
 * distinct from "Inbox" / /chippi/inbox to keep the two surfaces
 * recognizable.
 *
 * Server pass: resolve connection presence so the page paints the right
 * shape with no flash. Message fetching happens client-side via
 * /api/mail to keep this render cheap even when Composio is slow.
 */
export default async function MailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const connection = await findEmailConnection(space.id);

  return (
    <div className={PAGE_RHYTHM}>
      <MailView
        slug={slug}
        initialConnected={Boolean(connection)}
        initialProvider={connection?.toolkit ?? null}
      />
    </div>
  );
}
