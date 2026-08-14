'use client';

/**
 * /s/[slug]/communication — the realtor's email, in here.
 *
 * TEMPORARY: Email-only while WhatsApp Composio config gets sorted.
 * The toggle + Messages tab + `messagesConnected` prop will return once
 * WhatsApp connect lands cleanly — leaving the props in place + the
 * components untouched (`MessagesListView`, `/whatsapp/[id]` deep-link
 * page, `/api/communication/*` endpoints) so re-enabling is one diff,
 * not a rebuild.
 *
 * Deep links into individual emails stay full pages (/email/[id]).
 */

import { TITLE_FONT, BODY_MUTED, SECTION_LABEL } from '@/lib/typography';
import { EmailInboxView } from '@/components/communication/email-inbox-view';

export type CommunicationTab = 'email' | 'messages';

interface CommunicationViewProps {
  slug: string;
  initialTab: CommunicationTab;
  emailConnected: boolean;
  emailProvider: string | null;
  /** Kept in the props shape but unused while the Messages tab is hidden.
   *  Server still computes it so re-enabling is one render-edit away. */
  messagesConnected: boolean;
}

export function CommunicationView({
  slug,
  emailConnected,
  emailProvider,
}: CommunicationViewProps) {
  const subtitle = !emailConnected
    ? 'Connect Gmail so your email lives here, not in tabs.'
    : emailProvider === 'gmail'
      ? 'Reading from Gmail.'
      : emailProvider === 'outlook'
        ? 'Reading from Outlook.'
        : 'Reading from your inbox.';
  const providerName = emailProvider === 'gmail'
    ? 'Gmail'
    : emailProvider === 'outlook'
      ? 'Outlook'
      : emailConnected
        ? 'Connected inbox'
        : 'Not connected';

  return (
    <div data-realtor-page="today" data-page-family="email-command" className="chippi-dashboard-canvas min-h-[calc(100vh-10rem)] w-full">
      <div className="w-full mx-auto pb-56 pt-3 md:pb-24 sm:pt-5 space-y-8 max-w-5xl">
        <header className="grid min-w-0 gap-8 border-b border-border/60 pb-9 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end lg:gap-16">
          <div className="max-w-3xl space-y-3">
            <p className={SECTION_LABEL}>Client mail</p>
            <h1 className="text-[3rem] leading-[.96] tracking-[-0.045em] text-foreground sm:text-[4.5rem]" style={TITLE_FONT}>
              Reply while the conversation is warm.
            </h1>
            <p className={BODY_MUTED}>{subtitle}</p>
          </div>
          <div className="border-y border-border/60 py-4 lg:text-right">
            <p className={SECTION_LABEL}>Source of truth</p>
            <p className="mt-2 text-sm text-foreground">
              {providerName}
            </p>
          </div>
        </header>

        <EmailInboxView
          slug={slug}
          initialConnected={emailConnected}
          initialProvider={emailProvider}
        />
      </div>
    </div>
  );
}
