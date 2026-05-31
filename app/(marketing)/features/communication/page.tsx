/**
 * `/features/communication` — the inbox surface.
 *
 * The one idea: your email is already in here. Threads, stars, attachments —
 * everything Gmail does, with Chippi drafting the reply you were going to
 * type anyway. The page walks the realtor from the list, into a read view,
 * into the draft Chippi has waiting, and out to the connectors.
 */

import { MarketingHero } from '@/components/marketing/marketing-hero';
import { MarketingSection } from '@/components/marketing/marketing-section';
import { MarketingMediaSlot } from '@/components/marketing/marketing-media-slot';
import { MarketingCTA } from '@/components/marketing/marketing-cta';

export const metadata = { title: 'Communication — Chippi' };

export default function FeaturesCommunicationPage() {
  return (
    <>
      <MarketingHero
        eyebrow="COMMUNICATION"
        title="Your inbox, in here."
        sub="Read and reply in Chippi. Threads, stars, attachments — everything Gmail does, with Chippi drafting the reply you were going to type."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'See all features', href: '/features' }}
      >
        <MarketingMediaSlot
          aspect="video"
          description="Inbox to read view to Chippi draft — one continuous flow."
        />
      </MarketingHero>

      <MarketingSection
        eyebrow="THE INBOX"
        title="Threads, not messages."
        sub="Conversations grouped by thread. Stars, attachments, archive. Filter by lead, by deal, by date."
        bullets={[
          'Thread-first inbox.',
          'Filters that match the work.',
          "Stars for the one you'll come back to.",
        ]}
        side="right"
      >
        <MarketingMediaSlot
          aspect="square"
          description="Inbox list — threads, star indicators, unread count."
        />
      </MarketingSection>

      <MarketingSection
        eyebrow="THE READ VIEW"
        title="The body of the page IS the body of the email."
        sub="Subject is the headline. Sender recedes below. Recipients tuck into a single line. The body reads like a page, not a chat bubble."
        bullets={[
          'Serif subject as headline.',
          'Plain-text body, no toolbar.',
          'Reply, star, open-in-Gmail in one row.',
        ]}
        side="left"
      >
        <MarketingMediaSlot
          aspect="wide"
          description="Email read view — large serif subject, body below, action row above body."
        />
      </MarketingSection>

      <MarketingSection
        eyebrow="THE DRAFT"
        title="Chippi drafts. You approve."
        sub="Open a thread; Chippi has the reply ready. Read it, edit it, send it. Or discard."
        bullets={[
          'Pre-drafted on thread open.',
          'Edit in the composer.',
          'Agent never sends without your tap.',
        ]}
        side="right"
      >
        <MarketingMediaSlot
          aspect="square"
          description="Composer with Chippi draft card — agent badge, Send and Discard buttons."
        />
      </MarketingSection>

      <MarketingSection
        eyebrow="WHAT WE CONNECT"
        title="Gmail and Outlook."
        sub="OAuth in. Realtime in both directions. Send-from address stays yours; signatures stay yours."
        bullets={[
          'Gmail + Outlook out of the box.',
          'Two-way sync.',
          'Your signature, your domain, your reputation.',
        ]}
        side="left"
      >
        <MarketingMediaSlot
          aspect="square"
          description="Connect screen — Gmail and Outlook tiles, connected state."
        />
      </MarketingSection>

      <MarketingSection
        eyebrow="THE PROMISE"
        title="One inbox. One agent. No tabs."
        sub="If it's a deal-related email, it lives here."
        stacked
      />

      <MarketingCTA
        title="Bring your inbox into Chippi."
        sub="Connect Gmail or Outlook in a minute. Chippi takes it from there."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'See pricing', href: '/pricing' }}
      />
    </>
  );
}
