/**
 * `/teams/chat` — Team chat.
 *
 * Channels for the deals, channels for the team. Chippi joins the ones it's
 * invited to, stays out of the ones it isn't. Hero → 3 tick-tock sections →
 * quiet anchor → CTA. Paper-flat, hairline borders, one primary CTA, no
 * brand orange — the conversation is the work, not a tab next to it.
 */

import { MarketingHero } from '@/components/marketing/marketing-hero';
import { MarketingSection } from '@/components/marketing/marketing-section';
import { MarketingMediaSlot } from '@/components/marketing/marketing-media-slot';
import { MarketingCTA } from '@/components/marketing/marketing-cta';

export const metadata = { title: 'Team chat — Chippi for teams' };

export default function TeamsChatPage() {
  return (
    <>
      <MarketingHero
        eyebrow="FOR BROKERAGES · TEAM CHAT"
        title="Talk shop, on the same page."
        sub="Channels for the deals, channels for the team, channels for the agents. Chippi listens to the ones it's invited to."
        primaryCta={{ label: 'Talk to sales', href: '/about' }}
        secondaryCta={{ label: 'See all team features', href: '/teams' }}
      >
        <MarketingMediaSlot
          aspect="video"
          description="Team chat — broker drops a question in the deal channel, Chippi answers with the lead's current state."
        />
      </MarketingHero>

      <MarketingSection
        side="right"
        eyebrow="PER-DEAL CHANNELS"
        title="One channel per deal that matters."
        sub="Auto-created when the deal hits a stage you care about. Archived when it closes. The chat lives with the deal, not next to it."
        bullets={[
          'Auto-created per deal.',
          'Archived on close.',
          'Search across all deals.',
        ]}
      >
        <MarketingMediaSlot
          aspect="square"
          description="Deal channel header — deal name, status pill, participants."
        />
      </MarketingSection>

      <MarketingSection
        side="left"
        eyebrow="WHEN TO LOOP IN CHIPPI"
        title="@chippi when you need it."
        sub="Pull the agent into a channel; ask it to draft, summarize, or pull a number. It answers in line. No tab-switching."
        bullets={[
          'Mention to invoke.',
          'Threaded replies keep the channel calm.',
          'Auto-context from the deal record.',
        ]}
      >
        <MarketingMediaSlot
          aspect="wide"
          description="Chat thread — '@chippi summarize today' → agent reply with bullet list."
        />
      </MarketingSection>

      <MarketingSection
        side="right"
        eyebrow="OFF-DUTY"
        title="A team room. Without the noise."
        sub="General channels for the floor: industry news, banter, the deal-of-the-week post. Chippi stays out of channels it's not invited to."
        bullets={[
          'General + private channels.',
          'Reactions and mentions.',
          'Quiet hours per channel.',
        ]}
      >
        <MarketingMediaSlot
          aspect="square"
          description="Team chat sidebar — Deals section, General section, an Agents section. Hairline dividers."
        />
      </MarketingSection>

      <MarketingSection
        stacked
        eyebrow="THE PROMISE"
        title="A room that gets the work done."
        sub="Not another tab. Built next to the deal so the conversation is the work."
      />

      <MarketingCTA
        title="Bring your team chat into the deal."
        sub="Talk to us about migration."
        primaryCta={{ label: 'Talk to sales', href: '/about' }}
        secondaryCta={{ label: 'See pricing', href: '/pricing' }}
      />
    </>
  );
}
