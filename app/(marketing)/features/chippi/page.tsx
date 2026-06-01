/**
 * `/features/chippi` — Meet Chippi. The agent.
 *
 * This is the page where we introduce the soul of the product. Apple
 * discipline: calm, capable, a little awe-inspiring. Confidence without
 * celebration.
 *
 * Brand orange scarcity: the marketing hero/section props are typed as
 * plain strings (foundation contract — out of scope to modify), so the
 * serif-orange wordmark can't be inlined in the title or sub. The page
 * stays disciplined: zero orange surfaces on this page beats forcing a
 * sixth context. The product itself wears the orange when the realtor
 * walks in — that's the moment that earns it.
 *
 * Structure (tick-tock alternation):
 *   1. Hero — one focal sentence, one CTA, one media slot.
 *   2. Reading — Chippi reads the inbox.
 *   3. Drafting — Chippi composes the reply, in your voice.
 *   4. Booking — Chippi schedules the tour, inline.
 *   5. Keeping up — Chippi keeps the pipeline current.
 *   6. Asking — Chippi never sends without your tap.
 *   7. Quiet anchor — you stay in the driver's seat.
 *   8. CTA — meet Chippi.
 */

import { MarketingHero } from '@/components/marketing/marketing-hero';
import { MarketingSection } from '@/components/marketing/marketing-section';
import { MarketingMediaSlot } from '@/components/marketing/marketing-media-slot';
import { MarketingCTA } from '@/components/marketing/marketing-cta';
import {
  ComposerDraftDiagram,
  LeadScoreDiagram,
} from '@/components/marketing/diagrams';

export const metadata = { title: 'Chippi — the agent' };

export default function FeaturesChippiPage() {
  return (
    <>
      <MarketingHero
        eyebrow="MEET CHIPPI"
        title="An agent that runs the room."
        sub="Chippi reads your inbox, drafts replies, schedules tours, and updates your pipeline — and never sends without your tap."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'See all features', href: '/features' }}
      >
        <ComposerDraftDiagram aspect="video" />
      </MarketingHero>

      <MarketingSection
        side="right"
        eyebrow="READING"
        title="Reads your inbox."
        sub="Gmail and Outlook connect. Chippi sees every inbound, scores it, and surfaces what to look at first."
        bullets={[
          'Multi-signal lead scoring.',
          'Thread context, not just last message.',
          "Quiet when nothing's worth surfacing.",
        ]}
      >
        <LeadScoreDiagram aspect="square" />
      </MarketingSection>

      <MarketingSection
        side="left"
        eyebrow="DRAFTING"
        title="Drafts replies in your voice."
        sub="Trained on how you actually write. Chippi composes the reply you would have typed — then waits for your tap before sending."
        bullets={[
          'Per-realtor voice training.',
          'Per-template adaptation.',
          'Always asks before sending.',
        ]}
      >
        <ComposerDraftDiagram aspect="video" />
      </MarketingSection>

      <MarketingSection
        side="right"
        eyebrow="BOOKING"
        title="Schedules the tour, inline."
        sub="Reply with a time; Chippi books it on the calendar, sends confirmations, and writes it back to the deal record."
        bullets={[
          'One-tap tour booking.',
          'Two-way calendar sync.',
          'Confirmation back in the thread.',
        ]}
      >
        <MarketingMediaSlot
          aspect="wide"
          description="Inline tour booking — pick time, calendar, confirmation."
        />
      </MarketingSection>

      <MarketingSection
        side="left"
        eyebrow="KEEPING UP"
        title="Keeps the pipeline current."
        sub="Drag a card. Update a deal. Chippi keeps the value, dates, and counterparty in sync across people, deals, and the timeline."
        bullets={[
          'Auto-updates deal records.',
          'Activity timeline per contact.',
          'Won/lost reasons captured in plain language.',
        ]}
      >
        <MarketingMediaSlot
          aspect="video"
          description="Kanban — side panel auto-fills as the realtor moves a card."
        />
      </MarketingSection>

      <MarketingSection
        side="right"
        eyebrow="ASKING"
        title="Asks before any send."
        sub="By default, Chippi never acts autonomously. Every outbound message, every booking, every record change is yours to approve. You can grant per-tool autonomy later."
        bullets={[
          'Approval-first by default.',
          'Per-tool autonomy toggles.',
          'Full audit trail in the activity log.',
        ]}
      >
        <MarketingMediaSlot
          aspect="square"
          description="Approval panel — pending action card with Approve and Decline buttons."
        />
      </MarketingSection>

      <MarketingSection
        stacked
        eyebrow="ONE VOICE"
        title="You stay in the driver's seat."
        sub="Chippi makes the work tractable. You make the call. Every time."
      />

      <MarketingCTA
        title="Meet Chippi."
        sub="Seven-day free trial. No credit card. Bring your inbox."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'See pricing', href: '/pricing' }}
      />
    </>
  );
}
