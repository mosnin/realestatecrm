/**
 * `/` — Chippi marketing homepage.
 *
 * One idea: Chippi runs your workspace. Hero, four product surfaces in
 * tick-tock rhythm, one closing CTA. Every media block is a slot until the
 * real footage lands. Auth users still bounce to their workspace.
 */

import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { MarketingHero } from '@/components/marketing/marketing-hero';
import { MarketingSection } from '@/components/marketing/marketing-section';
import { MarketingMediaSlot } from '@/components/marketing/marketing-media-slot';
import { MarketingCTA } from '@/components/marketing/marketing-cta';

export default async function MarketingHomePage() {
  const { userId } = await auth();
  if (userId) {
    redirect('/auth/redirect?intent=realtor');
  }

  return (
    <>
      <MarketingHero
        eyebrow="The agentic OS for real estate"
        title="Chippi runs your workspace."
        sub="An AI agent that qualifies leads, drafts follow-ups, schedules tours, and keeps your pipeline current. So you can focus on the deals that matter."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'See how it works', href: '/features/chippi' }}
      >
        <MarketingMediaSlot
          aspect="video"
          description="Homepage hero video — autoplay-mute-loop, ~30s, showing Chippi at work across the workspace (inbound lead → draft → tour scheduled → deal updated). 16:9, paper-flat product UI, no fake screen mockups."
        />
      </MarketingHero>

      <MarketingSection
        title="Used by real estate pros."
        stacked
      >
        <MarketingMediaSlot
          aspect="wide"
          description="Customer logo strip — 5-6 greyscale brokerage logos, evenly spaced, single row."
        />
      </MarketingSection>

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
        <MarketingMediaSlot
          aspect="square"
          description="Chippi composer with a draft reply card — agent badge in serif orange, the kind of screenshot you'd put on a billboard."
        />
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
        <MarketingMediaSlot
          aspect="video"
          description="Deals kanban — card dragged from Negotiating to Closed Won, sidebar fields auto-fill."
        />
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
        <MarketingMediaSlot
          aspect="video"
          description="Thread view → Chippi drafts reply → tour booked → calendar updates, in one continuous flow."
        />
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
        <MarketingMediaSlot
          aspect="wide"
          description="Split: broker leaderboard left, realtor daily brief right."
        />
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
