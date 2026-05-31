/**
 * `/features/chippi` — Chippi, the agent (foundation stub).
 *
 * The polished version lands in PR `claude/marketing-features-chippi` — that PR
 * replaces this stub. Don't refactor here; replace.
 */

import { MarketingHero } from '@/components/marketing/marketing-hero';
import { MarketingMediaSlot } from '@/components/marketing/marketing-media-slot';
import { MarketingCTA } from '@/components/marketing/marketing-cta';

export const metadata = { title: 'Chippi — Chippi' };

export default function FeaturesChippiPage() {
  return (
    <>
      <MarketingHero
        eyebrow={'Chippi, the agent'}
        title={'The agent that runs the room.'}
        sub={'Reads your inbox, drafts replies, schedules tours, updates the pipeline, and tells you what to look at next. Always asks before sending.'}
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'See all features', href: '/features' }}
      >
        <MarketingMediaSlot
          aspect="video"
          description={'Chippi page hero — animated conversation between realtor and Chippi covering an inbound lead.'}
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
