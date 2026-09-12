import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug, getSpaceForUser } from '@/lib/space';
import { listOffers } from '@/lib/offers';
import { OffersClient } from './offers-client';
import { TITLE_FONT, BODY_MUTED, SECTION_LABEL } from '@/lib/typography';
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

  const initialOffers = await listOffers(space.id);

  const liveOffers = initialOffers.filter((offer) =>
    ['draft', 'submitted', 'countered'].includes(offer.status),
  ).length;
  const acceptedOffers = initialOffers.filter((offer) => offer.status === 'accepted').length;
  const totalVolume = initialOffers.reduce((sum, offer) => sum + (offer.amount ?? 0), 0);
  const totalVolumeLabel = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(totalVolume);

  return (
    <div className="chippi-dashboard-canvas mx-auto max-w-6xl space-y-9 pb-12 pt-3 sm:pt-5" data-page-family="offer-negotiation">
      <header className="grid gap-8 border-b border-border/60 pb-9 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end lg:gap-16">
        <div className="max-w-3xl space-y-3">
          <p className={SECTION_LABEL}>Negotiation room</p>
          <h1 className="text-2xl font-medium tracking-tight text-foreground" style={TITLE_FONT}>
            <SplitReveal as="span" text="Offers" />
          </h1>
          <p className={BODY_MUTED}>
            Compare the terms that matter, protect every deadline, and move the strongest offer forward.
          </p>
        </div>
        <div className="grid grid-cols-2 border-y border-border/60 lg:grid-cols-1 lg:border-y-0">
          <div className="py-4 lg:border-b lg:border-border/60">
            <p className={SECTION_LABEL}>In play</p>
            <p className="mt-2 text-[2.75rem] leading-none tracking-[-0.04em] tabular-nums" style={TITLE_FONT}>{liveOffers}</p>
          </div>
          <div className="border-l border-border/60 py-4 pl-5 lg:border-l-0 lg:pl-0">
            <p className={SECTION_LABEL}>Accepted</p>
            <p className="mt-2 text-[2.75rem] leading-none tracking-[-0.04em] tabular-nums" style={TITLE_FONT}>{acceptedOffers}</p>
          </div>
          <div className="col-span-2 border-t border-border/60 py-4 lg:col-span-1">
            <p className={SECTION_LABEL}>Offer volume</p>
            <p className="mt-2 text-[2.75rem] leading-none tracking-[-0.04em] tabular-nums" style={TITLE_FONT}>{totalVolumeLabel}</p>
          </div>
        </div>
      </header>

      <OffersClient slug={slug} initialOffers={initialOffers} />
    </div>
  );
}
