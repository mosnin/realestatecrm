/**
 * `/teams/leads` — Lead distribution (foundation stub).
 *
 * The polished version lands in PR `claude/marketing-teams-leads` — that PR
 * replaces this stub. Don't refactor here; replace.
 */

import { MarketingHero } from '@/components/marketing/marketing-hero';
import { MarketingMediaSlot } from '@/components/marketing/marketing-media-slot';
import { MarketingCTA } from '@/components/marketing/marketing-cta';

export const metadata = { title: 'Lead distribution — Chippi' };

export default function TeamsLeadsPage() {
  return (
    <>
      <MarketingHero
        eyebrow={'Lead distribution'}
        title={'Every lead goes to the right realtor.'}
        sub={'Auto-assign, round-robin, or hand-pick — Chippi routes new leads to the realtor most likely to close them.'}
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'See all features', href: '/features' }}
      >
        <MarketingMediaSlot
          aspect="video"
          description={'Lead routing diagram — incoming intake → routing engine → assigned realtor.'}
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
