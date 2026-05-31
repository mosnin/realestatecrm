/**
 * `/features` — every surface in Chippi, as a paper-flat survey.
 *
 * Apple-discipline:
 * - ONE focal element: the hero headline. No media in the hero — the grid IS
 *   the visual. The eye lands on the words, then on the grid.
 * - Two grids: eight realtor surfaces, then five team-layer surfaces. Both
 *   render through `<MarketingFeatureGrid>` so the hairline vocabulary stays
 *   consistent — no card chrome, just hairlines between cells.
 * - A quiet "one agent" anchor section between the team grid and the CTA
 *   names what holds it all together. No media there either — words only.
 * - Single primary CTA per surface: hero has one, footer CTA has one.
 *   Nothing in the middle competes for the click.
 */

import {
  MessageCircle,
  Users,
  Briefcase,
  Calendar,
  MessageSquare,
  Building2,
  Aperture,
  FolderOpen,
  PhoneIncoming,
  BarChart3,
  FileText,
} from 'lucide-react';

import { MarketingHero } from '@/components/marketing/marketing-hero';
import { MarketingSection } from '@/components/marketing/marketing-section';
import { MarketingFeatureGrid } from '@/components/marketing/marketing-feature-grid';
import { MarketingCTA } from '@/components/marketing/marketing-cta';

export const metadata = { title: 'Features — Chippi' };

const SURFACE_ITEMS = [
  {
    title: 'Chippi',
    description: 'The agent that runs the room.',
    href: '/features/chippi',
    icon: MessageCircle,
  },
  {
    title: 'People',
    description: 'Every contact, every detail, in one place.',
    href: '/features/people',
    icon: Users,
  },
  {
    title: 'Deals',
    description: 'Pipeline that updates itself.',
    href: '/features/deals',
    icon: Briefcase,
  },
  {
    title: 'Calendar',
    description: 'Tours, showings, and follow-ups in one view.',
    href: '/features/calendar',
    icon: Calendar,
  },
  {
    title: 'Communication',
    description: 'Your inbox, in here.',
    href: '/features/communication',
    icon: MessageSquare,
  },
  {
    title: 'Properties',
    description: 'Listings as records, not links.',
    href: '/features/properties',
    icon: Building2,
  },
  {
    title: 'Studio',
    description: 'Make the content. Schedule the post.',
    href: '/features/studio',
    icon: Aperture,
  },
  {
    title: 'Files',
    description: 'A file room for the deal.',
    href: '/features/files',
    icon: FolderOpen,
  },
];

const TEAM_ITEMS = [
  {
    title: 'Lead distribution',
    description: 'Every lead, the right realtor.',
    href: '/teams/leads',
    icon: PhoneIncoming,
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
];

export default function FeaturesPage() {
  return (
    <>
      <MarketingHero
        eyebrow="EVERY SURFACE IN CHIPPI"
        title="All the things Chippi can run."
        sub="From the agent itself to the inbox, the pipeline, the calendar, and the file room. Each surface is built so the realtor can work in it — or hand it off."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'See pricing', href: '/pricing' }}
      />

      <MarketingSection
        stacked
        eyebrow="BY SURFACE"
        title="What's in the workspace."
        sub="Eight surfaces. One agent."
      >
        <MarketingFeatureGrid columns={3} items={SURFACE_ITEMS} />
      </MarketingSection>

      <MarketingSection
        stacked
        eyebrow="FOR TEAMS"
        title="What floors get."
        sub="The team layer the realtors stay in. Five surfaces, one floor."
      >
        <MarketingFeatureGrid columns={3} items={TEAM_ITEMS} />
      </MarketingSection>

      <MarketingSection
        stacked
        eyebrow="ONE AGENT"
        title="Built around Chippi."
        sub="Every surface above runs on the same agent. The work shifts between you and Chippi naturally — and you keep the wheel."
      />

      <MarketingCTA
        title="Start your free trial."
        sub="Seven days, no credit card. Bring your inbox and let Chippi do the rest."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'Talk to sales', href: '/about' }}
      />
    </>
  );
}
