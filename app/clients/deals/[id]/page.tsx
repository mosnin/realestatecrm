import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { ArrowLeft, MapPin, CalendarCheck } from 'lucide-react';
import { getClientUser } from '@/lib/client-auth';
import { getClientDeal } from '@/lib/client-deals';
import { TITLE_FONT } from '@/lib/typography';
import { DealProgressPill, formatDealDate } from '../../portal-ui';
import { PortalFadeIn } from '../../portal-motion';
import { DealTimeline, DealMilestones } from './deal-timeline';

export const dynamic = 'force-dynamic';

/**
 * Client-facing deal page — read-only "where are we?" view. Auth + scoping are
 * enforced in getClientDeal (verified email → Contact → DealContact); a deal the
 * client is not a party to 404s, identical to a non-existent id. Nothing
 * internal (value, commission, agent notes, other parties) reaches this page —
 * the helper only ever returns client-safe fields.
 */
export default async function ClientDealPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getClientUser();
  if (!user) redirect('/clients/login');
  if (!user.emailVerifiedAt) redirect('/clients/verify');

  const { id } = await params;
  const deal = await getClientDeal(user.email, id);
  if (!deal) notFound();

  const closeDate = formatDealDate(deal.closeDate);
  const roleLabel =
    deal.role === 'buyer' ? 'Buyer' : deal.role === 'seller' ? 'Seller' : null;

  return (
    <main className="mx-auto max-w-3xl space-y-12 px-4 py-10 pb-16 sm:px-6">
      <PortalFadeIn>
        <header className="space-y-3">
          <Link
            href="/clients/dashboard"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft size={13} />
            Back to your portal
          </Link>
          <div className="space-y-1.5">
            <p className="text-sm text-muted-foreground">
              {roleLabel ? `Your deal · ${roleLabel}` : 'Your deal.'}
            </p>
            <h1 className="text-3xl tracking-tight text-foreground" style={TITLE_FONT}>
              {deal.title}
            </h1>
            <div className="flex flex-wrap items-center gap-2.5">
              <DealProgressPill progress={deal.progress} />
              {deal.stageName && (
                <span className="text-[11px] text-muted-foreground">{deal.stageName}</span>
              )}
            </div>
          </div>

          {/* At-a-glance facts the client cares about. */}
          {(deal.address || closeDate) && (
            <div className="flex flex-wrap gap-2 pt-1">
              {deal.address && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 py-1 text-xs text-muted-foreground">
                  <MapPin size={12} />
                  {deal.address}
                </span>
              )}
              {closeDate && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 py-1 text-xs text-muted-foreground tabular-nums">
                  <CalendarCheck size={12} />
                  Target close · {closeDate}
                </span>
              )}
            </div>
          )}
        </header>
      </PortalFadeIn>

      <DealTimeline steps={deal.timeline} />
      <DealMilestones milestones={deal.milestones} />
    </main>
  );
}
