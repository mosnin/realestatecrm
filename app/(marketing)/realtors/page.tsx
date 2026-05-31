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
import { MarketingMediaSlot } from '@/components/marketing/marketing-media-slot';
import { MarketingCTA } from '@/components/marketing/marketing-cta';

export const metadata = { title: 'For solo realtors — Chippi' };

export default function RealtorsPage() {
  return (
    <>
      <MarketingHero
        eyebrow="FOR SOLO REALTORS"
        title="Your second brain. With opposable thumbs."
        sub="Chippi reads your inbox, replies on your behalf, schedules tours, and keeps your deals current. You stay in the driver's seat — every send still goes through you."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'See all features', href: '/features' }}
      >
        <MarketingMediaSlot
          aspect="video"
          description="Realtor hero — a solo realtor on their phone after-hours, Chippi drafting a reply on the laptop in the background. Calm, golden hour, real workspace not a stock office."
        />
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
        <MarketingMediaSlot
          aspect="video"
          description="Lead feed — new inquiry lands, score and reason animate in (subtle), realtor taps the top lead."
        />
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
        <MarketingMediaSlot
          aspect="square"
          description="Composer with Chippi draft card open — Send and Discard buttons visible, agent badge in serif orange."
        />
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
        <MarketingMediaSlot
          aspect="wide"
          description="Inline tour-booking flow — pick time → calendar updates → confirmation sent."
        />
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
        <MarketingMediaSlot
          aspect="video"
          description="Kanban — card moves Negotiating → Closed Won, side panel auto-fills with closing details."
        />
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
