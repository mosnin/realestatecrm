/**
 * `/features/deals` — Deals.
 *
 * Hero → four tick-tock sections (board, fields, won/lost, broker view) →
 * quiet anchor → CTA. Apple discipline: serif Times headlines via the
 * primitives, hairline borders, one primary CTA per page, lowercase verbs,
 * no exclamation marks, no orange.
 */

import { MarketingHero } from '@/components/marketing/marketing-hero';
import { MarketingSection } from '@/components/marketing/marketing-section';
import { MarketingMediaSlot } from '@/components/marketing/marketing-media-slot';
import { MarketingCTA } from '@/components/marketing/marketing-cta';
import { KanbanDragDiagram } from '@/components/marketing/diagrams';

export const metadata = { title: 'Deals — Chippi' };

export default function FeaturesDealsPage() {
  return (
    <>
      <MarketingHero
        eyebrow="DEALS"
        title="A pipeline that updates itself."
        sub="Drag a card. Move a stage. Chippi keeps the deal value, dates, and counterparty in sync. The pipeline reflects reality, not yesterday."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'See all features', href: '/features' }}
      >
        <KanbanDragDiagram aspect="video" />
      </MarketingHero>

      <MarketingSection
        eyebrow="THE BOARD"
        title="Kanban, calm."
        sub="Stages you define. Cards that show what you need. No flashing, no clutter. Move them; Chippi updates the rest."
        bullets={[
          'Drag-and-drop between stages.',
          'Custom stage layouts.',
          'Activity timeline per deal.',
        ]}
        side="right"
      >
        <KanbanDragDiagram aspect="wide" />
      </MarketingSection>

      <MarketingSection
        eyebrow="THE FIELDS"
        title="Value, dates, parties — always current."
        sub="Update the deal in the side panel; Chippi propagates the changes through the timeline and the related contact records."
        bullets={[
          'Real-time field sync.',
          'Linked to people and properties.',
          'Custom fields without a developer.',
        ]}
        side="left"
      >
        <MarketingMediaSlot
          aspect="square"
          description="Deal side panel — fields editable inline, save state visible."
        />
      </MarketingSection>

      <MarketingSection
        eyebrow="WON / LOST"
        title="Capture the reason."
        sub="Plain-language reason at close. The next deal benefits from the last one."
        bullets={[
          'Won/lost reason at close.',
          'Reason patterns aggregated quietly.',
          'Surfaced as insight, not as nag.',
        ]}
        side="right"
      >
        <MarketingMediaSlot
          aspect="square"
          description="Close-deal modal — reason field with one-line examples."
        />
      </MarketingSection>

      <MarketingSection
        eyebrow="THE BROKER VIEW"
        title="Roll it up to the floor."
        sub="Brokers see pipeline value, deal aging, and conversion across the whole floor. Realtors keep their own boards."
        bullets={[
          'Per-realtor pipelines stay private.',
          'Aggregate view for admins.',
          'Drill-down without crossing lines.',
        ]}
        side="left"
      >
        <MarketingMediaSlot
          aspect="wide"
          description="Broker rollup — total pipeline value, top deals, aging alerts."
        />
      </MarketingSection>

      <MarketingSection
        eyebrow="THE PROMISE"
        title="A pipeline that doesn't lie."
        sub="Drag the card. Chippi handles the bookkeeping."
        stacked
      />

      <MarketingCTA
        title="Move your pipeline to Chippi."
        sub="Migration is one CSV away. Talk to us if you want help."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'Talk to sales', href: '/about' }}
      />
    </>
  );
}
