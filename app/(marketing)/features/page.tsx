/**
 * `/features` — All features (foundation stub).
 *
 * The polished version lands in PR `claude/marketing-features` — that PR
 * replaces this stub. Don't refactor here; replace.
 */

import { MarketingHero } from '@/components/marketing/marketing-hero';
import { MarketingMediaSlot } from '@/components/marketing/marketing-media-slot';
import { MarketingCTA } from '@/components/marketing/marketing-cta';

export const metadata = { title: 'Features — Chippi' };

export default function FeaturesPage() {
  return (
    <>
      <MarketingHero
        eyebrow={'All features'}
        title={'Every surface in Chippi.'}
        sub={'From the agent itself to the inbox, the pipeline, the calendar, and the file room — each is built so the realtor can work in it or hand it off to Chippi.'}
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'See all features', href: '/features' }}
      >
        <MarketingMediaSlot
          aspect="video"
          description={'Features index — paper-flat grid of every surface (rendered by MarketingFeatureGrid in the polished PR).'}
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
