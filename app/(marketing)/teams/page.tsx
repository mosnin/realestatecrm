/**
 * `/teams` — the brokerage landing.
 *
 * The pitch is deliberately not "team management" or "for brokerages."
 * Those phrases read as SaaS. The pitch is: the agent every realtor
 * already loves, with the team gear bolted on top. Lead routing,
 * performance, templates, chat — surfaced for the broker, never taken
 * away from the floor.
 *
 * One primary CTA per section. Hero opens with "Talk to sales"; CTA
 * lands with the same verb. The middle sections are quiet — they
 * teach, not sell.
 */

import { Briefcase, Users, BarChart3, FileText, MessageCircle } from 'lucide-react';

import { MarketingHero } from '@/components/marketing/marketing-hero';
import { MarketingSection } from '@/components/marketing/marketing-section';
import { MarketingMediaSlot } from '@/components/marketing/marketing-media-slot';
import { MarketingFeatureGrid } from '@/components/marketing/marketing-feature-grid';
import { MarketingCTA } from '@/components/marketing/marketing-cta';
import {
  LeadRoutingDiagram,
  TeamLeaderboardDiagram,
} from '@/components/marketing/diagrams';

export const metadata = { title: 'For brokerages and teams — Chippi' };

export default function TeamsPage() {
  return (
    <>
      <MarketingHero
        eyebrow="FOR BROKERAGES & TEAMS"
        title="One team. One agent. One pipeline."
        sub="Chippi runs every realtor's workspace. You see the room — leads routed, deals progressing, response times measured. The agent does the work; the floor still owns the relationships."
        primaryCta={{ label: 'Talk to sales', href: '/about' }}
        secondaryCta={{ label: 'See features', href: '/features' }}
      >
        <MarketingMediaSlot
          aspect="video"
          description="Teams hero — split screen: broker's leaderboard panel on the left, realtor's daily brief on the right; the same lead appears on both — distributed and being worked."
        />
      </MarketingHero>

      <MarketingSection
        side="right"
        eyebrow="LEAD ROUTING"
        title="Every lead, the right realtor."
        sub="Auto-assign, round-robin, or hand-pick. Chippi routes new leads to the realtor most likely to close them — by territory, by load, by deal-fit."
        bullets={[
          'Auto-assignment rules.',
          'Round-robin with weighted load.',
          'Manual override always available.',
        ]}
        learnMore={{ label: 'See lead distribution', href: '/teams/leads' }}
      >
        <LeadRoutingDiagram aspect="wide" />
      </MarketingSection>

      <MarketingSection
        side="left"
        eyebrow="PERFORMANCE"
        title="See what the floor is closing."
        sub="Pipeline value, conversion rate, response time. The numbers a broker would ask for on Monday morning — on a single page."
        bullets={[
          'Real-time pipeline value.',
          'Response-time tracking per realtor.',
          'Conversion by source and stage.',
        ]}
        learnMore={{ label: 'See analytics', href: '/teams/analytics' }}
      >
        <TeamLeaderboardDiagram aspect="video" />
      </MarketingSection>

      <MarketingSection
        side="right"
        eyebrow="SHARED TEMPLATES"
        title="Write the reply once."
        sub="Approved templates the whole team reaches for. Chippi adapts them per-lead so every send feels written, not stamped."
        bullets={[
          'Brokerage-wide template library.',
          'Per-realtor personalization.',
          'Locked-in compliance for high-risk replies.',
        ]}
        learnMore={{ label: 'See templates', href: '/teams/templates' }}
      >
        <MarketingMediaSlot
          aspect="square"
          description="Template library list — template names + previews on the left, edit panel on the right."
        />
      </MarketingSection>

      <MarketingSection
        side="left"
        eyebrow="TEAM CHAT"
        title="Talk shop, on the same page."
        sub="Channels for deals, channels for the team, channels for the agents. Chippi listens to the ones it's invited to."
        bullets={[
          'Per-deal channels.',
          'Mentions and reactions.',
          'Chippi participation per channel.',
        ]}
        learnMore={{ label: 'See team chat', href: '/teams/chat' }}
      >
        <MarketingMediaSlot
          aspect="wide"
          description="Team chat surface — channel list left, conversation right with Chippi avatar mid-thread."
        />
      </MarketingSection>

      <MarketingSection
        stacked
        eyebrow="THE PROMISE"
        title="Realtors keep their workspace. You see the room."
        sub="Every realtor still has their own dashboard. Brokers see the rollup — without ever taking the workspace away from the people doing the work."
      />

      <MarketingSection
        stacked
        eyebrow="EXPLORE TEAMS"
        title="What's in here."
        sub="Five surfaces, one floor."
      >
        <MarketingFeatureGrid
          columns={3}
          items={[
            {
              title: 'Lead distribution',
              description: 'Every lead, the right realtor.',
              href: '/teams/leads',
              icon: Briefcase,
            },
            {
              title: 'Members',
              description: 'Manage who belongs.',
              href: '/teams/members',
              icon: Users,
            },
            {
              title: 'Analytics',
              description: 'See what the floor is closing.',
              href: '/teams/analytics',
              icon: BarChart3,
            },
            {
              title: 'Templates',
              description: 'Write the reply once.',
              href: '/teams/templates',
              icon: FileText,
            },
            {
              title: 'Team chat',
              description: 'Talk shop, on the same page.',
              href: '/teams/chat',
              icon: MessageCircle,
            },
          ]}
        />
      </MarketingSection>

      <MarketingCTA
        title="Bring your team to Chippi."
        sub="We'll help you migrate. The realtors will keep what they already do; the team will see what they never could."
        primaryCta={{ label: 'Talk to sales', href: '/about' }}
        secondaryCta={{ label: 'See pricing', href: '/pricing' }}
      />
    </>
  );
}
