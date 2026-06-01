/**
 * `/features/communication` — the inbox surface.
 *
 * The one idea: your email is already in here. Threads, stars, attachments —
 * everything Gmail does, with Chippi drafting the reply you were going to
 * type anyway. The page walks the realtor from the list, into a read view,
 * into the draft Chippi has waiting, and out to the connectors.
 */

import { Mail, AtSign, MessageCircle, MessageSquare, MessagesSquare, Plus } from 'lucide-react';
import { MarketingHero } from '@/components/marketing/marketing-hero';
import { MarketingSection } from '@/components/marketing/marketing-section';
import { MarketingMediaSlot } from '@/components/marketing/marketing-media-slot';
import { MarketingCTA } from '@/components/marketing/marketing-cta';
import { MarketingIntegrations } from '@/components/marketing/marketing-integrations';
import { ComposerDraftDiagram } from '@/components/marketing/diagrams';

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
        <ComposerDraftDiagram aspect="video" />
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
        <ComposerDraftDiagram aspect="square" />
      </MarketingSection>

      <MarketingIntegrations
        eyebrow="WHAT WE CONNECT"
        title="Brings your inbox along."
        sub="Connect once. Chippi reads, drafts, and sends from the address your contacts already know. Two-way sync, signature kept, reputation kept."
        integrations={[
          {
            name: 'Gmail',
            description: 'Read, draft, and send. Your address, your signature.',
            icon: Mail,
          },
          {
            name: 'Outlook',
            description: 'Microsoft 365 and Outlook.com both supported.',
            icon: AtSign,
          },
          {
            name: 'WhatsApp Business',
            description: 'Replies in the channel your buyers actually open.',
            icon: MessageCircle,
            comingSoon: true,
          },
          {
            name: 'SMS',
            description: 'Tour confirmations and lightweight follow-ups.',
            icon: MessageSquare,
            comingSoon: true,
          },
          {
            name: 'Slack',
            description: 'Notify the team channel when a deal moves.',
            icon: MessagesSquare,
            comingSoon: true,
          },
          {
            name: 'And many more',
            description: 'Composio underneath — hundreds of tools, one wire.',
            icon: Plus,
          },
        ]}
        learnMore={{ label: 'Connect your inbox', href: '/login/realtor?intent=signup' }}
      />

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
