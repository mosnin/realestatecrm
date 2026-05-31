/**
 * `/about` — About Chippi (foundation stub).
 *
 * The polished version lands in PR `claude/marketing-about` — that PR
 * replaces this stub. Don't refactor here; replace.
 */

import { MarketingHero } from '@/components/marketing/marketing-hero';
import { MarketingMediaSlot } from '@/components/marketing/marketing-media-slot';
import { MarketingCTA } from '@/components/marketing/marketing-cta';

export const metadata = { title: 'About — Chippi' };

export default function AboutPage() {
  return (
    <>
      <MarketingHero
        eyebrow={'About Chippi'}
        title={"Built for the realtor who's tired of tabs."}
        sub={"Chippi is the agentic OS for real-estate agents and brokerages. We built it because the work shouldn't be the chrome — the work should be the deals."}
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'See all features', href: '/features' }}
      >
        <MarketingMediaSlot
          aspect="video"
          description={'Founders photo or product team — placeholder.'}
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
