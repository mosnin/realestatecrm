/**
 * `/teams/members` — Team members.
 *
 * The one idea: a team layer the realtors keep using. Three tiers, no
 * permissions matrix, private surfaces stay private. Hero → three tick-tock
 * sections (invites / roles / privacy) → quiet promise → CTA.
 */

import { MarketingHero } from '@/components/marketing/marketing-hero';
import { MarketingSection } from '@/components/marketing/marketing-section';
import { MarketingMediaSlot } from '@/components/marketing/marketing-media-slot';
import { MarketingCTA } from '@/components/marketing/marketing-cta';
import { TeamMembersDiagram } from '@/components/marketing/diagrams';

export const metadata = { title: 'Members — Chippi for teams' };

export default function TeamsMembersPage() {
  return (
    <>
      <MarketingHero
        eyebrow="FOR BROKERAGES · MEMBERS"
        title="Manage who belongs."
        sub="Invite realtors, set roles, see what they're working on. Members keep their own workspace; admins see the whole floor."
        primaryCta={{ label: 'Talk to sales', href: '/about' }}
        secondaryCta={{ label: 'See all team features', href: '/teams' }}
      >
        <TeamMembersDiagram aspect="video" />
      </MarketingHero>

      <MarketingSection
        eyebrow="INVITES"
        title="One link. One role."
        sub="Send an invite link with the role pre-set. The realtor signs in, and they're on the floor."
        bullets={[
          'Owner / Admin / Member roles.',
          'Invite by email or shared link.',
          'Pending invites stay tracked until accepted.',
        ]}
        side="right"
      >
        <MarketingMediaSlot
          aspect="square"
          description="Invite panel — role dropdown, email field, copy-link button."
        />
      </MarketingSection>

      <MarketingSection
        eyebrow="ROLES"
        title="Three tiers. No more."
        sub="Owner runs the show. Admin manages the floor. Member is the realtor doing the work. We refuse to ship a permissions matrix."
        bullets={[
          'Owner — sees and edits everything.',
          "Admin — sees the floor; can't change billing.",
          'Member — owns their workspace, contributes to the team.',
        ]}
        side="left"
      >
        <TeamMembersDiagram aspect="wide" />
      </MarketingSection>

      <MarketingSection
        eyebrow="PRIVACY"
        title="Realtors keep their workspace."
        sub="Admins see the rollup — pipeline value, response time, deals closed. Admins do NOT read private DMs, drafts, or contact notes. The lines are drawn in the product, not the policy."
        bullets={[
          'Private surfaces stay private.',
          'Aggregate metrics are team-visible.',
          'Audit log for any admin-side change.',
        ]}
        side="right"
      >
        <MarketingMediaSlot
          aspect="square"
          description="Diagram — realtor's private workspace + the aggregate view a broker sees. Two surfaces, hairline between them."
        />
      </MarketingSection>

      <MarketingSection
        eyebrow="THE PROMISE"
        title="A team layer that the realtors keep using."
        sub="Brokerages don't fail because of features. They fail when the realtors stop logging in. We picked the lines so that doesn't happen."
        stacked
      />

      <MarketingCTA
        title="Set up your team."
        sub="Talk to us. We'll handle the migration; you bring the floor."
        primaryCta={{ label: 'Talk to sales', href: '/about' }}
        secondaryCta={{ label: 'See pricing', href: '/pricing' }}
      />
    </>
  );
}
