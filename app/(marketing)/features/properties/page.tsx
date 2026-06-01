/**
 * `/features/properties` — Properties.
 *
 * The grid is one room: each listing is a record (photos, specs, offers,
 * commission), not a link to MLS. Hero → grid → record → commission →
 * promise → CTA. Voice is lowercase verbs and periods, no exclamation.
 */

import { MarketingHero } from '@/components/marketing/marketing-hero';
import { MarketingSection } from '@/components/marketing/marketing-section';
import { MarketingMediaSlot } from '@/components/marketing/marketing-media-slot';
import { MarketingCTA } from '@/components/marketing/marketing-cta';
import { PropertyGridDiagram } from '@/components/marketing/diagrams';

export const metadata = { title: 'Properties — Chippi' };

export default function FeaturesPropertiesPage() {
  return (
    <>
      <MarketingHero
        eyebrow="PROPERTIES"
        title="Listings as records, not links."
        sub="Track active listings, attach offers, see what Chippi has already sent to whom."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'See all features', href: '/features' }}
      >
        <PropertyGridDiagram aspect="video" />
      </MarketingHero>

      <MarketingSection
        side="right"
        eyebrow="THE GRID"
        title="Your listings, in one place."
        sub="Cards with photo, address, price, and status. Sort by latest activity. Filter by stage."
        bullets={[
          'Status pills (Active, In Contract, Closed).',
          'Sort by activity.',
          'Filter by price band, neighborhood, type.',
        ]}
      >
        <PropertyGridDiagram aspect="square" />
      </MarketingSection>

      <MarketingSection
        side="left"
        eyebrow="THE LISTING"
        title="Full record per property."
        sub="Photos, specs, offers, activity. Linked to every contact and every deal it's tied to."
        bullets={[
          'Photo carousel + specs.',
          'Offer log with status.',
          'Linked deals + contacts.',
        ]}
      >
        <MarketingMediaSlot
          aspect="wide"
          description="Property detail page — gallery left, specs and offers right."
        />
      </MarketingSection>

      <MarketingSection
        side="right"
        eyebrow="COMMISSION"
        title="Track what you'll earn."
        sub="Commission per property. Per deal. Per quarter. So you know what's coming and what closed."
        bullets={[
          'Commission tracking per listing.',
          'Per-deal split visibility.',
          'Quarterly rollups.',
        ]}
      >
        <MarketingMediaSlot
          aspect="square"
          description="Commission summary — total + breakdown by deal."
        />
      </MarketingSection>

      <MarketingSection
        stacked
        eyebrow="THE PROMISE"
        title="Your listings know what's happening."
        sub="Tied to the people, tied to the deals. Not just an MLS link in a notes field."
      />

      <MarketingCTA
        title="Bring your listings into Chippi."
        sub="Add them in a minute. Chippi keeps them current."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'See pricing', href: '/pricing' }}
      />
    </>
  );
}
