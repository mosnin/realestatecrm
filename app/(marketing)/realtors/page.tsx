/**
 * `/realtors` — the page that speaks to the solo realtor.
 *
 * The persona: a realtor flying solo. No team. No admin assistant. Spends
 * nights triaging which leads to call back. Has been told by every CRM
 * vendor "this saves you time" and stopped believing it.
 *
 * The page leads with the feeling — "a second brain with opposable thumbs"
 * — and earns trust by promising the realtor stays in the driver's seat
 * on every send. No agents jargon up top. No feature grid here (that lives
 * on /features). No pricing details (that lives on /pricing). One primary
 * CTA per surface — the hero and the closing CTA, and nowhere else.
 */

import { MarketingHero } from '@/components/marketing/marketing-hero';
import { MarketingSection } from '@/components/marketing/marketing-section';
import { MarketingCTA } from '@/components/marketing/marketing-cta';
import {
  ComposerDraftDiagram,
  LeadScoreDiagram,
  CalendarBookingDiagram,
  KanbanDragDiagram,
} from '@/components/marketing/diagrams';

export const metadata = { title: 'For solo realtors — Chippi' };

export default function RealtorsPage() {
  return (
    <>
      <MarketingHero
        eyebrow="FOR SOLO REALTORS"
        title="Your second brain. With opposable thumbs."
        sub="Chippi reads your inbox, drafts the reply, books the tour, updates the deal. Every send still goes through you."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'See all features', href: '/features' }}
      >
        <ComposerDraftDiagram aspect="video" />
      </MarketingHero>

      <MarketingSection
        side="right"
        eyebrow="FIRST CALL"
        title="Know who to call first."
        sub="Every new inquiry comes in scored against your active deals. Hot, warm, cold — at a glance, on the first scan."
        bullets={[
          'Multi-signal scoring on each lead.',
          'Plain-language reason attached.',
          'Priority order updates as deals move.',
        ]}
      >
        <LeadScoreDiagram aspect="video" />
      </MarketingSection>

      <MarketingSection
        side="left"
        eyebrow="THE REPLY"
        title="Drafts you'd have written. In your voice."
        sub="Chippi reads the thread, writes the reply, and stops. You read it, you press send. Or you don't."
        bullets={[
          'Trained on how you actually write.',
          'Never sends without your tap.',
          "Templates the team has approved (if you're on one).",
        ]}
      >
        <ComposerDraftDiagram aspect="square" />
      </MarketingSection>

      <MarketingSection
        side="right"
        eyebrow="TOURS"
        title="Book the tour from the thread."
        sub="Reply with a time. Chippi puts it on the calendar, the lead's calendar, and the deal record. No tab-switching."
        bullets={[
          'One-tap tour booking.',
          'Two-way calendar sync.',
          'Confirmation goes back in the thread.',
        ]}
      >
        <CalendarBookingDiagram aspect="wide" />
      </MarketingSection>

      <MarketingSection
        side="left"
        eyebrow="THE PIPELINE"
        title="A pipeline that doesn't lie."
        sub="Drag a card to the next stage; Chippi keeps the deal value, dates, and counterparty in sync. The pipeline reflects reality. Not yesterday."
        bullets={[
          'Kanban with auto-updating fields.',
          'Activity timeline per deal.',
          'Won/lost reasons logged in plain language.',
        ]}
      >
        <KanbanDragDiagram aspect="video" />
      </MarketingSection>

      <MarketingSection
        stacked
        eyebrow="ONE PROMISE"
        title="You stay in the driver's seat."
        sub="Chippi can be set to ask before any send, every send. The agent does the work; you make the call. Always."
      />

      <MarketingCTA
        title="Start your free trial."
        sub="Seven days, no credit card. Bring your inbox and let Chippi do the rest."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'See pricing', href: '/pricing' }}
      />
    </>
  );
}
