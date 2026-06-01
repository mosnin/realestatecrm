/**
 * `/teams/leads` — Lead distribution.
 *
 * The one idea: every lead, the right realtor — by territory, by load, by
 * deal-fit, with manual override always available. Hero → three tick-tock
 * sections (auto-assign / hand-pick / the handoff) → quiet promise → CTA.
 */

import { MarketingHero } from '@/components/marketing/marketing-hero';
import { MarketingSection } from '@/components/marketing/marketing-section';
import { MarketingMediaSlot } from '@/components/marketing/marketing-media-slot';
import { MarketingCTA } from '@/components/marketing/marketing-cta';
import {
  LeadRoutingDiagram,
  LeadScoreDiagram,
} from '@/components/marketing/diagrams';

export const metadata = { title: 'Lead distribution — Chippi for teams' };

export default function TeamsLeadsPage() {
  return (
    <>
      <MarketingHero
        eyebrow="FOR BROKERAGES · LEADS"
        title="Every lead, the right realtor."
        sub="Chippi routes new inquiries to the realtor most likely to close them — by territory, by load, by deal-fit. Manual override always available."
        primaryCta={{ label: 'Talk to sales', href: '/about' }}
        secondaryCta={{ label: 'See all team features', href: '/teams' }}
      >
        <LeadRoutingDiagram aspect="video" />
      </MarketingHero>

      <MarketingSection
        eyebrow="AUTO-ASSIGN"
        title="Rules a broker actually wants."
        sub="Round-robin with weighted load, by territory, by deal type, or by a custom rule. The routing engine does the work; the broker sets the policy."
        bullets={[
          'Round-robin or weighted-load.',
          'Territory and price-band carve-outs.',
          'Custom rules without a developer.',
        ]}
        side="right"
      >
        <LeadRoutingDiagram aspect="square" />
      </MarketingSection>

      <MarketingSection
        eyebrow="HAND-PICK"
        title="Or assign by hand."
        sub="Some leads need judgment. Open the lead, pick the realtor, write the brief. Chippi takes it from there."
        bullets={[
          'Manual assignment with a one-line brief.',
          'Reassign at any stage.',
          'Activity logged per realtor.',
        ]}
        side="left"
      >
        <MarketingMediaSlot
          aspect="wide"
          description="Lead detail with assign-to dropdown open and a brief textarea below."
        />
      </MarketingSection>

      <MarketingSection
        eyebrow="THE HANDOFF"
        title="What the realtor sees."
        sub="When a lead lands on a realtor's desk, Chippi attaches the brief, the score, and the next step. No rummaging through history."
        bullets={[
          'Score + reason visible on assignment.',
          'Suggested first reply pre-drafted.',
          'Calendar slots pulled from their availability.',
        ]}
        side="right"
      >
        <LeadScoreDiagram aspect="video" />
      </MarketingSection>

      <MarketingSection
        eyebrow="THE PROMISE"
        title="Speed of response, without the chase."
        sub="Median first-touch on a Chippi-routed lead is minutes, not hours. The broker sets the rules. The agent does the work."
        stacked
      />

      <MarketingCTA
        title="Distribute leads. Win more deals."
        sub="Talk to us about bringing your floor to Chippi."
        primaryCta={{ label: 'Talk to sales', href: '/about' }}
        secondaryCta={{ label: 'See all team features', href: '/teams' }}
      />
    </>
  );
}
