/**
 * `/teams/chat` — Team chat (foundation stub).
 *
 * The polished version lands in PR `claude/marketing-teams-chat` — that PR
 * replaces this stub. Don't refactor here; replace.
 */

import { MarketingHero } from '@/components/marketing/marketing-hero';
import { MarketingMediaSlot } from '@/components/marketing/marketing-media-slot';
import { MarketingCTA } from '@/components/marketing/marketing-cta';

export const metadata = { title: 'Team chat — Chippi' };

export default function TeamsChatPage() {
  return (
    <>
      <MarketingHero
        eyebrow={'Team chat'}
        title={'Talk shop, on the same page.'}
        sub={"Channels for the deals, channels for the team, channels for the agents. Chippi listens to the ones it's invited to."}
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'See all features', href: '/features' }}
      >
        <MarketingMediaSlot
          aspect="video"
          description={'Team chat surface — channel list left, conversation right.'}
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
