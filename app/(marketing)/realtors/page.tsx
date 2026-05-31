/**
 * `/realtors` — For solo realtors (foundation stub).
 *
 * The polished version lands in PR `claude/marketing-realtors` — that PR
 * replaces this stub. Don't refactor here; replace.
 */

import { MarketingHero } from '@/components/marketing/marketing-hero';
import { MarketingMediaSlot } from '@/components/marketing/marketing-media-slot';
import { MarketingCTA } from '@/components/marketing/marketing-cta';

export const metadata = { title: 'Realtors — Chippi' };

export default function RealtorsPage() {
  return (
    <>
      <MarketingHero
        eyebrow={'For solo realtors'}
        title={'Chippi for the realtor flying solo.'}
        sub={'Run your whole business from one inbox — no team, no overhead, just you and the agent that backs you up.'}
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'See all features', href: '/features' }}
      >
        <MarketingMediaSlot
          aspect="video"
          description={'Chippi for realtors hero — a single realtor on their phone, Chippi drafting a reply in the background.'}
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
