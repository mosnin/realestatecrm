/**
 * `/` — Chippi marketing homepage.
 *
 * One idea: Chippi runs your workspace. Hero, four product surfaces in
 * tick-tock rhythm, one closing CTA. Every media block is a slot until the
 * real footage lands. Auth users still bounce to their workspace.
 */

import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { MarketingHeroHome } from '@/components/marketing/marketing-hero-home';
import { MarketingSection } from '@/components/marketing/marketing-section';
import { MarketingCTA } from '@/components/marketing/marketing-cta';
import { MarketingLogoStrip } from '@/components/marketing/marketing-logo-strip';
import {
  ComposerDraftDiagram,
  KanbanDragDiagram,
  CalendarBookingDiagram,
  TeamLeaderboardDiagram,
} from '@/components/marketing/diagrams';

export default async function MarketingHomePage() {
  const { userId } = await auth();
  if (userId) {
    redirect('/auth/redirect?intent=realtor');
  }

  return (
    <>
      <MarketingHeroHome
        eyebrow="The agentic OS for real estate"
        title="Chippi runs your workspace."
        sub="An AI agent that qualifies leads, drafts follow-ups, schedules tours, and keeps your pipeline current — so you can focus on the deals that matter."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'See how it works', href: '/features/chippi' }}
      />

      {/* Trusted-by row — six greyscale slots until real brokerage logos
          land. Paper-flat, static, no marquee. The slots themselves are
          the placeholder until customers ship us assets we can use. */}
      <MarketingLogoStrip
        items={[
          { name: 'Brokerage 1' },
          { name: 'Brokerage 2' },
          { name: 'Brokerage 3' },
          { name: 'Brokerage 4' },
          { name: 'Brokerage 5' },
          { name: 'Brokerage 6' },
        ]}
      />

      <MarketingSection
        eyebrow="Chippi"
        title="An agent that runs the room."
        sub="Chippi reads your inbox, drafts replies, schedules tours, and updates the pipeline. Always asks before sending."
        bullets={[
          'Drafts replies in your voice.',
          'Books tours straight from a reply.',
          'Surfaces what to look at first.',
        ]}
        learnMore={{ label: 'Meet Chippi', href: '/features/chippi' }}
        side="right"
      >
        <ComposerDraftDiagram aspect="square" />
      </MarketingSection>

      <MarketingSection
        eyebrow="People & deals"
        title="A pipeline that updates itself."
        sub="Renters, buyers, sellers, vendors — every contact is a record with a timeline. Move a deal stage; Chippi keeps the rest in sync."
        bullets={[
          'Contact records with full timeline.',
          'Drag-and-drop kanban pipeline.',
          'Deal value and dates always current.',
        ]}
        learnMore={{ label: 'See people + deals', href: '/features/people' }}
        side="left"
      >
        <KanbanDragDiagram aspect="video" />
      </MarketingSection>

      <MarketingSection
        eyebrow="Inbox & calendar"
        title="Your inbox, in here."
        sub="Gmail and Outlook plug in. Read, star, reply — Chippi drafts the reply you were going to type. Tours land on the calendar without leaving the thread."
        bullets={[
          'Email read + compose inline.',
          'Tour booking from a reply.',
          'Calendar synced both ways.',
        ]}
        learnMore={{ label: 'See communication', href: '/features/communication' }}
        side="right"
      >
        <CalendarBookingDiagram aspect="video" />
      </MarketingSection>

      <MarketingSection
        eyebrow="For teams"
        title="Built for floors, not just desks."
        sub="Brokerages route leads, share templates, and see what the floor is closing. Every realtor still has their own workspace; admins see the room."
        bullets={[
          'Auto-routed leads to the right realtor.',
          'Shared templates the team can reach for.',
          'Performance dashboards a broker would actually open.',
        ]}
        learnMore={{ label: 'See teams', href: '/teams' }}
        side="left"
      >
        <TeamLeaderboardDiagram aspect="wide" />
      </MarketingSection>

      <MarketingCTA
        title="Start your free trial."
        sub="Seven days, no credit card. Bring your inbox and let Chippi do the rest."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'Talk to sales', href: '/about' }}
      />
    </>
  );
}
