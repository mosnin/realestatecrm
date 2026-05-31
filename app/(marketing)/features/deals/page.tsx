/**
 * `/features/deals` — Deals (foundation stub).
 *
 * The polished version lands in PR `claude/marketing-features-deals` — that PR
 * replaces this stub. Don't refactor here; replace.
 */

import { MarketingHero } from '@/components/marketing/marketing-hero';
import { MarketingMediaSlot } from '@/components/marketing/marketing-media-slot';
import { MarketingCTA } from '@/components/marketing/marketing-cta';

export const metadata = { title: 'Deals — Chippi' };

export default function FeaturesDealsPage() {
  return (
    <>
      <MarketingHero
        eyebrow={'Deals'}
        title={'Pipeline that updates itself.'}
        sub={'Drag a card to move a stage; Chippi keeps the deal value, dates, and counterparty in sync. The pipeline reflects reality, not yesterday.'}
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'See all features', href: '/features' }}
      >
        <MarketingMediaSlot
          aspect="video"
          description={'Deals kanban — four columns with cards being moved.'}
        />
      </MarketingHero>

      <MarketingCTA
        title="Start your free trial."
        sub="Seven days, no credit card. Bring your inbox and let Chippi do the rest."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'Talk to sales', href: '/about' }}
      />
    </>
  );
}
