/**
 * `/teams/analytics` — Team analytics.
 *
 * The numbers a broker would ask for on Monday morning, on a single page.
 * Hero → 3 tick-tock sections → quiet anchor → CTA. Each surface is its own
 * decision; no card chrome, hairline borders, the serif Times title carries
 * the focal weight. No brand orange — the agent's signature lives on the
 * realtor surfaces; on marketing we let typography do the work.
 */

import { MarketingHero } from '@/components/marketing/marketing-hero';
import { MarketingSection } from '@/components/marketing/marketing-section';
import { MarketingCTA } from '@/components/marketing/marketing-cta';
import { TeamLeaderboardDiagram } from '@/components/marketing/diagrams';

export const metadata = { title: 'Team analytics — Chippi for teams' };

export default function TeamsAnalyticsPage() {
  return (
    <>
      <MarketingHero
        eyebrow="FOR BROKERAGES · ANALYTICS"
        title="See what the floor is closing."
        sub="Pipeline value, conversion rate, response time. The numbers a broker would ask for on Monday morning, on a single page."
        primaryCta={{ label: 'Talk to sales', href: '/about' }}
        secondaryCta={{ label: 'See all team features', href: '/teams' }}
      >
        <TeamLeaderboardDiagram aspect="video" />
      </MarketingHero>

      <MarketingSection
        side="right"
        eyebrow="THE NUMBERS"
        title="Pipeline, response, and conversion."
        sub="Pipeline by stage and by realtor. Response time per channel. Conversion by source. The metrics a broker actually cares about."
        bullets={[
          'Pipeline value live.',
          'First-touch latency tracked.',
          'Conversion by source + stage.',
        ]}
      >
        <TeamLeaderboardDiagram aspect="square" />
      </MarketingSection>

      <MarketingSection
        side="left"
        eyebrow="BY REALTOR"
        title="Performance, on one page."
        sub="Sort by closed-this-month, deals-in-flight, response time. Spotlight is on the floor, not on the chart."
        bullets={[
          'Realtor leaderboard — sortable, transparent.',
          'Drill into individual workload.',
          'Coaching insights surfaced quietly.',
        ]}
      >
        <TeamLeaderboardDiagram aspect="wide" />
      </MarketingSection>

      <MarketingSection
        stacked
        eyebrow="BY DEAL"
        title="Where the dollars are."
        sub="Pipeline by stage. Aging deals flagged. Won/lost reasons captured in plain language so the next deal benefits."
        bullets={[
          'Stage-by-stage value totals.',
          'Aging-deal alerts.',
          'Win/loss reasons in plain English.',
        ]}
      />

      <MarketingSection
        stacked
        eyebrow="THE PROMISE"
        title="Numbers that aren't lying to you."
        sub="Every figure comes from the work the realtors are actually doing — not from a spreadsheet they updated last week. That's the difference."
      />

      <MarketingCTA
        title="Bring your team to Chippi."
        sub="Talk to us about migration and a 30-day pilot."
        primaryCta={{ label: 'Talk to sales', href: '/about' }}
        secondaryCta={{ label: 'See pricing', href: '/pricing' }}
      />
    </>
  );
}
