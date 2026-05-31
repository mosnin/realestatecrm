/**
 * `/features/people` — People (foundation stub).
 *
 * The polished version lands in PR `claude/marketing-features-people` — that PR
 * replaces this stub. Don't refactor here; replace.
 */

import { MarketingHero } from '@/components/marketing/marketing-hero';
import { MarketingMediaSlot } from '@/components/marketing/marketing-media-slot';
import { MarketingCTA } from '@/components/marketing/marketing-cta';

export const metadata = { title: 'People — Chippi' };

export default function FeaturesPeoplePage() {
  return (
    <>
      <MarketingHero
        eyebrow={'People'}
        title={'Every contact, every detail, in one place.'}
        sub={'Renters, buyers, sellers, vendors — Chippi keeps the record current and surfaces what matters next.'}
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'See all features', href: '/features' }}
      >
        <MarketingMediaSlot
          aspect="video"
          description={'People hero — contact card with timeline of touches.'}
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
