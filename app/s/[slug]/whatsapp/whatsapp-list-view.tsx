'use client';

/**
 * /s/[slug]/whatsapp — conversation list.
 *
 * Rows: contact name (bold) · phone (muted) · last message snippet ·
 * relative time. Tap → full thread page. No filters, no tabs in v1.
 *
 * Slug uncertainty: Composio's WhatsApp toolkit slugs aren't fully
 * verified. The API tries each candidate and surfaces a calm
 * `noteSlugUnresolved` flag if none resolves. We render an honest line
 * rather than a 500.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MessageSquare, Plug } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { ShimmerText } from '@/components/chippi/shimmer-text';
import { cn } from '@/lib/utils';
import {
  H1,
  TITLE_FONT,
  BODY,
  BODY_MUTED,
  CAPTION,
  META,
  PRIMARY_PILL,
} from '@/lib/typography';

interface WhatsAppConversation {
  id: string;
  contactName: string;
  contactPhone: string;
  snippet: string;
  lastAt: string;
}

interface ConnectedPayload {
  connected: true;
  conversations: WhatsAppConversation[];
  noteSlugUnresolved?: boolean;
}

interface NotConnectedPayload {
  connected: false;
}

type FetchPayload = ConnectedPayload | NotConnectedPayload;

function formatRelative(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const ms = now.getTime() - then.getTime();
  if (ms < 60_000) return 'now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  if (ms < 7 * 86_400_000) return `${Math.floor(ms / 86_400_000)}d`;
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function WhatsAppConversationListView({
  slug,
  initialConnected,
}: {
  slug: string;
  initialConnected: boolean;
}) {
  const [connected, setConnected] = useState(initialConnected);
  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [loading, setLoading] = useState(initialConnected);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [slugUnresolved, setSlugUnresolved] = useState(false);

  useEffect(() => {
    if (!connected) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErrorMessage(null);
    fetch(`/api/whatsapp?slug=${encodeURIComponent(slug)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Could not load (${res.status}).`);
        const data = (await res.json()) as FetchPayload;
        if (cancelled) return;
        if (!data.connected) {
          setConnected(false);
          setConversations([]);
          return;
        }
        setConnected(true);
        setConversations(data.conversations);
        setSlugUnresolved(Boolean(data.noteSlugUnresolved));
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setErrorMessage(err.message || 'Couldn’t load WhatsApp messages.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connected, slug]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="w-full mx-auto chat-content-wrap pt-10 sm:pt-14 pb-56 md:pb-24 space-y-8 max-w-3xl">
        <header className="space-y-1.5">
          <p className={BODY_MUTED}>WhatsApp.</p>
          <h1 className={H1} style={TITLE_FONT}>
            Your conversations, in here.
          </h1>
          <p className={BODY_MUTED}>
            {connected
              ? 'Reading from WhatsApp Business.'
              : 'Connect WhatsApp Business so your chats live here, not in tabs.'}
          </p>
        </header>

        {!connected && <DisconnectedState slug={slug} />}

        {connected && loading && (
          <ShimmerText
            messages={['Catching up on WhatsApp.', 'Bringing in your conversations.']}
            className="block text-sm"
          />
        )}

        {connected && !loading && errorMessage && (
          <Card>
            <CardContent className="p-5 space-y-2">
              <p className={BODY}>Couldn’t load WhatsApp messages.</p>
              <p className={BODY_MUTED}>{errorMessage}</p>
            </CardContent>
          </Card>
        )}

        {connected && !loading && !errorMessage && (
          <>
            {conversations.length === 0 ? (
              <EmptyState slugUnresolved={slugUnresolved} />
            ) : (
              <ul className="divide-y divide-border/60">
                {conversations.map((c) => (
                  <ConversationRow key={c.id} slug={slug} item={c} />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ConversationRow({
  slug,
  item,
}: {
  slug: string;
  item: WhatsAppConversation;
}) {
  return (
    <li>
      <Link
        href={`/s/${slug}/whatsapp/${encodeURIComponent(item.id)}`}
        className="block w-full py-3 hover:bg-foreground/[0.02] transition-colors duration-150"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-medium text-foreground truncate">
                {item.contactName}
              </span>
              {item.contactPhone && item.contactPhone !== item.contactName && (
                <span className={cn(CAPTION, 'truncate min-w-0')}>
                  {item.contactPhone}
                </span>
              )}
            </div>
            {item.snippet && (
              <p className={cn(CAPTION, 'mt-0.5 truncate')}>{item.snippet}</p>
            )}
          </div>
          <span className={cn(META, 'shrink-0 pt-0.5')}>
            {formatRelative(item.lastAt)}
          </span>
        </div>
      </Link>
    </li>
  );
}

function EmptyState({ slugUnresolved }: { slugUnresolved: boolean }) {
  if (slugUnresolved) {
    return (
      <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 py-12 px-6 flex flex-col items-center text-center">
        <div className="mb-3 w-10 h-10 rounded-lg bg-foreground/[0.04] flex items-center justify-center">
          <MessageSquare
            size={16}
            strokeWidth={1.75}
            className="text-muted-foreground"
          />
        </div>
        <p className="text-sm font-medium text-foreground">
          Couldn’t load WhatsApp messages.
        </p>
        <p className="mt-1 text-[13px] text-muted-foreground max-w-[320px] leading-relaxed">
          The WhatsApp tool isn’t responding. Check the connection in
          Integrations.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 py-12 px-6 flex flex-col items-center text-center">
      <div className="mb-3 w-10 h-10 rounded-lg bg-foreground/[0.04] flex items-center justify-center">
        <MessageSquare
          size={16}
          strokeWidth={1.75}
          className="text-muted-foreground"
        />
      </div>
      <p className="text-sm font-medium text-foreground">
        WhatsApp is quiet.
      </p>
      <p className="mt-1 text-[13px] text-muted-foreground max-w-[280px] leading-relaxed">
        New conversations will land here.
      </p>
    </div>
  );
}

function DisconnectedState({ slug }: { slug: string }) {
  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 w-9 h-9 rounded-lg bg-foreground/[0.04] flex items-center justify-center shrink-0">
            <MessageSquare
              size={16}
              strokeWidth={1.75}
              className="text-muted-foreground"
            />
          </div>
          <div className="space-y-1.5">
            <p className={BODY}>
              Bring your WhatsApp Business chats here so they live with the
              rest of your day.
            </p>
            <p className={BODY_MUTED}>
              WhatsApp Business is the fast path.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/s/${slug}/integrations`}
            className={PRIMARY_PILL}
            aria-label="Connect WhatsApp"
          >
            <Plug className="h-4 w-4" />
            Connect WhatsApp
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
