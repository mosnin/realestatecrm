import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { findEmailConnection } from '@/lib/communication/connect';
import { EmailInboxView } from './email-inbox-view';
import { PAGE_RHYTHM } from '@/lib/typography';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Email — ${slug}` };
}

/**
 * /s/[slug]/email — Gmail-shaped inbox surface.
 *
 * The unified /communication page is gone (redirects here). Email lives
 * here as a focused surface: list → tap a row → full-page read. Star,
 * filter, paginate. Compose is still a modal because composing is a
 * focal task; reading is the page itself.
 *
 * Server pass: get connection presence so the page paints the right
 * shape with no flash. Feed fetching happens client-side.
 */
export default async function EmailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const conn = await findEmailConnection(space.id);

  return (
    <div className={PAGE_RHYTHM}>
      <EmailInboxView
        slug={slug}
        initialConnected={Boolean(conn)}
        initialProvider={conn?.toolkit ?? null}
      />
    </div>
  );
}
