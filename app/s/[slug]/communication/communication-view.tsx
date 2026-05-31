'use client';

/**
 * /s/[slug]/communication — the realtor's email + messages, in here.
 *
 * One surface, one entry in the sidebar. A segmented toggle at the top
 * picks the channel: Email | Messages. Each position mounts a focused
 * view (not a feed-mix); deep links into individual emails or threads
 * stay full pages (/email/[id], /whatsapp/[id]).
 *
 * Why one item instead of two: the realtor saw the split as Chippi
 * crammed messages under email. One door labelled Communication, with a
 * quiet pick-which-channel inside, reads as a calmer house.
 *
 * Active tab persists per-slug in localStorage and syncs to ?tab= in the
 * URL so the surface is shareable and back/forward works.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  H1,
  TITLE_FONT,
  BODY_MUTED,
} from '@/lib/typography';
import { EmailInboxView } from '@/components/communication/email-inbox-view';
import { MessagesListView } from '@/components/communication/messages-list-view';

export type CommunicationTab = 'email' | 'messages';

function tabStorageKey(slug: string): string {
  return `communication-tab:${slug}`;
}

function readStoredTab(slug: string): CommunicationTab | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(tabStorageKey(slug));
    if (v === 'email' || v === 'messages') return v;
  } catch {
    /* private mode — fall through to default */
  }
  return null;
}

function writeStoredTab(slug: string, tab: CommunicationTab): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(tabStorageKey(slug), tab);
  } catch {
    /* no-op */
  }
}

interface CommunicationViewProps {
  slug: string;
  initialTab: CommunicationTab;
  emailConnected: boolean;
  emailProvider: string | null;
  messagesConnected: boolean;
}

export function CommunicationView({
  slug,
  initialTab,
  emailConnected,
  emailProvider,
  messagesConnected,
}: CommunicationViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<CommunicationTab>(initialTab);

  // On mount only: if the URL had no ?tab=, hydrate from localStorage so
  // the realtor lands on whichever channel they last used. URL wins over
  // localStorage when explicitly present so shared links land where they
  // say they will. The ?tab= mirror happens in handleTabChange below;
  // this hydration also writes the URL when it changes the tab from the
  // server-rendered default so refresh + share keep working.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const urlTab = searchParams.get('tab');
    if (urlTab === 'email' || urlTab === 'messages') return;
    const stored = readStoredTab(slug);
    if (!stored || stored === tab) return;
    setTab(stored);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', stored);
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [slug]); // mount-only hydration; tab changes route via handleTabChange

  const handleTabChange = useCallback(
    (next: CommunicationTab) => {
      setTab(next);
      writeStoredTab(slug, next);
      // Mirror to URL so the surface is shareable. replace() — we don't
      // want a back-stack entry for each toggle press.
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', next);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams, slug],
  );

  const subtitle = useMemo(() => {
    if (tab === 'email') {
      if (!emailConnected) {
        return 'Connect Gmail so your email lives here, not in tabs.';
      }
      if (emailProvider === 'gmail') return 'Reading from Gmail.';
      if (emailProvider === 'outlook') return 'Reading from Outlook.';
      return 'Reading from your inbox.';
    }
    // tab === 'messages'
    if (!messagesConnected) {
      return 'Connect WhatsApp to send and receive messages here.';
    }
    return 'Reading from WhatsApp Business.';
  }, [emailConnected, emailProvider, messagesConnected, tab]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="w-full mx-auto chat-content-wrap pt-10 sm:pt-14 pb-56 md:pb-24 space-y-8 max-w-3xl">
        <header className="space-y-1.5 min-w-0">
          <p className={BODY_MUTED}>Communication.</p>
          <h1 className={H1} style={TITLE_FONT}>
            Your messages, in here.
          </h1>
          <p className={BODY_MUTED}>{subtitle}</p>
        </header>

        <SegmentedToggle value={tab} onChange={handleTabChange} />

        {tab === 'email' ? (
          <EmailInboxView
            slug={slug}
            initialConnected={emailConnected}
            initialProvider={emailProvider}
          />
        ) : (
          <MessagesListView slug={slug} initialConnected={messagesConnected} />
        )}
      </div>
    </div>
  );
}

/* ── Segmented toggle ───────────────────────────────────────────────── */

function SegmentedToggle({
  value,
  onChange,
}: {
  value: CommunicationTab;
  onChange: (next: CommunicationTab) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Channel"
      className="inline-flex items-center rounded-full border border-border/70 p-0.5"
    >
      <ToggleTab
        active={value === 'email'}
        onClick={() => onChange('email')}
        label="Email"
      />
      <ToggleTab
        active={value === 'messages'}
        onClick={() => onChange('messages')}
        label="Messages"
      />
    </div>
  );
}

function ToggleTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'px-3.5 h-7 rounded-full text-[12px] font-medium uppercase tracking-wider transition-colors duration-150',
        active
          ? 'bg-foreground/[0.08] text-foreground'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  );
}
