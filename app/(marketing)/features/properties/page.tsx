/**
 * `/features/properties` — Properties (foundation stub).
 *
 * The polished version lands in PR `claude/marketing-features-properties` — that PR
 * replaces this stub. Don't refactor here; replace.
 */

import { MarketingHero } from '@/components/marketing/marketing-hero';
import { MarketingMediaSlot } from '@/components/marketing/marketing-media-slot';
import { MarketingCTA } from '@/components/marketing/marketing-cta';

export const metadata = { title: 'Properties — Chippi' };

export default function FeaturesPropertiesPage() {
  return (
    <>
      <MarketingHero
        eyebrow={'Properties'}
        title={'Listings as records, not links.'}
        sub={'Track your active listings, attach offers, see what Chippi has already sent to whom.'}
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'See all features', href: '/features' }}
      >
        <MarketingMediaSlot
          aspect="video"
          description={'Properties grid — listing cards with status pills.'}
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
