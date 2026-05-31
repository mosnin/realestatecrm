/**
 * `/teams/analytics` — Team analytics (foundation stub).
 *
 * The polished version lands in PR `claude/marketing-teams-analytics` — that PR
 * replaces this stub. Don't refactor here; replace.
 */

import { MarketingHero } from '@/components/marketing/marketing-hero';
import { MarketingMediaSlot } from '@/components/marketing/marketing-media-slot';
import { MarketingCTA } from '@/components/marketing/marketing-cta';

export const metadata = { title: 'Analytics — Chippi' };

export default function TeamsAnalyticsPage() {
  return (
    <>
      <MarketingHero
        eyebrow={'Team analytics'}
        title={'See what the floor is closing.'}
        sub={'Pipeline value, conversion rate, response time. The same numbers a broker would ask for on Monday morning, on a single page.'}
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'See all features', href: '/features' }}
      >
        <MarketingMediaSlot
          aspect="video"
          description={'Analytics dashboard — a paper-flat chart with this-week vs last-week numbers.'}
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
