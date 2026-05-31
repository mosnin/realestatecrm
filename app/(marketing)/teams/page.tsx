/**
 * `/teams` — For brokerages (foundation stub).
 *
 * The polished version lands in PR `claude/marketing-teams` — that PR
 * replaces this stub. Don't refactor here; replace.
 */

import { MarketingHero } from '@/components/marketing/marketing-hero';
import { MarketingMediaSlot } from '@/components/marketing/marketing-media-slot';
import { MarketingCTA } from '@/components/marketing/marketing-cta';

export const metadata = { title: 'Teams — Chippi' };

export default function TeamsPage() {
  return (
    <>
      <MarketingHero
        eyebrow={'For brokerages'}
        title={'One team. One agent. One pipeline.'}
        sub={'Lead routing, shared templates, performance dashboards, and team chat — built on the same agent each realtor already uses.'}
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'See all features', href: '/features' }}
      >
        <MarketingMediaSlot
          aspect="video"
          description={"Teams overview — split-screen showing a broker's leaderboard and a realtor's daily brief."}
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
