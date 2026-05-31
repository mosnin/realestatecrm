/**
 * `/pricing` — Pricing (foundation stub).
 *
 * The polished version lands in PR `claude/marketing-pricing` — that PR
 * replaces this stub. Don't refactor here; replace.
 */

import { MarketingHero } from '@/components/marketing/marketing-hero';
import { MarketingMediaSlot } from '@/components/marketing/marketing-media-slot';
import { MarketingCTA } from '@/components/marketing/marketing-cta';

export const metadata = { title: 'Pricing — Chippi' };

export default function PricingPage() {
  return (
    <>
      <MarketingHero
        eyebrow={'Pricing'}
        title={'One plan. Honest pricing.'}
        sub={'Start with a seven-day free trial. After that, a single monthly price that covers the agent, the integrations, and the surface. No seats math.'}
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'See all features', href: '/features' }}
      >
        <MarketingMediaSlot
          aspect="video"
          description={'Pricing card — single plan, single price.'}
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
