import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug, getSpaceForUser } from '@/lib/space';
import { listOffers } from '@/lib/offers';
import { OffersClient } from './offers-client';
import { H1, TITLE_FONT, BODY_MUTED } from '@/lib/typography';
import { SplitReveal } from '@/components/motion';

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Server component: SSR the caller's own offers so the board never flashes
 * an empty state before the first client fetch resolves (same rationale as
 * app/s/[slug]/deals/page.tsx's loadInitialDealsData). Ownership of the
 * space is enforced here — the outer /s/[slug] layout only checks login.
 */
export default async function OffersPage({ params }: PageProps) {
  const { slug } = await params;

  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const userSpace = await getSpaceForUser(userId);
  if (!userSpace || userSpace.id !== space.id) notFound();

  let initialOffers: Awaited<ReturnType<typeof listOffers>> = [];
  try {
    initialOffers = await listOffers(space.id);
  } catch (err) {
    // Non-fatal: fall back to an empty board, the client re-fetches on
    // mount. Never hard-block the page on a transient DB hiccup.
    console.error('[offers] initial SSR fetch failed', err);
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      <header className="space-y-1.5">
        <p className="text-sm text-muted-foreground">Offers.</p>
        <h1 className={H1} style={TITLE_FONT}>
          <SplitReveal as="span" text="Offer tracker" />
        </h1>
        <p className={BODY_MUTED}>
          Every offer in flight on your listings, grouped by where it stands.
        </p>
      </header>

      <OffersClient slug={slug} initialOffers={initialOffers} />
    </div>
  );
}
