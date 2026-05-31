'use client';

/**
 * /s/[slug]/communication — email + WhatsApp, in here.
 *
 * One divide-y feed across both channels. Channel chips on the left
 * (small caps, no icon) so the realtor can see at a glance whether a
 * row is email or WhatsApp without parsing the sender. Time on the right.
 *
 * Optional source filter sits ABOVE the list as quiet text-link chips
 * (`All · Email · WhatsApp`) — only when both channels are connected.
 * One channel connected → no filter (silence beats configuration).
 *
 * Rows open the thread/conversation in a Dialog. Compose lives in a
 * second Dialog opened from the header's New message button; its
 * channel picker is hidden when only one channel is connected.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { MessageSquare, Plug, Plus, Send } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ShimmerText } from '@/components/chippi/shimmer-text';
import { cn } from '@/lib/utils';
import {
  H1,
  TITLE_FONT,
  BODY,
  BODY_MUTED,
  SECTION_LABEL,
  PRIMARY_PILL,
  GHOST_PILL,
  CAPTION,
  META,
} from '@/lib/typography';

/* ── Shared shapes mirror the API ───────────────────────────────────── */

interface FeedItem {
  id: string;
  channel: 'email' | 'whatsapp';
  fromName: string;
  fromAddress: string;
  subject: string | null;
  snippet: string;
  lastAt: string;
  unread: boolean;
}

interface NotConnectedPayload {
  connected: false;
  email: false;
  whatsapp: false;
}
interface ConnectedPayload {
  connected: true;
  email: boolean;
  whatsapp: boolean;
  items: FeedItem[];
  noteOutlookReadPending?: boolean;
}
type FeedPayload = NotConnectedPayload | ConnectedPayload;

interface ThreadMessage {
  id: string;
  fromName: string;
  fromAddress: string;
  subject: string | null;
  body: string;
  sentAt: string;
  fromMe: boolean;
}

interface ThreadPayload {
  channel: 'email' | 'whatsapp';
  messages: ThreadMessage[];
}

interface CommunicationViewProps {
  slug: string;
  initialEmailConnected: boolean;
  initialWhatsAppConnected: boolean;
  initialEmailProvider: string | null;
}

type SourceFilter = 'all' | 'email' | 'whatsapp';

/* ── Utilities ───────────────────────────────────────────────────────── */

function formatRelativeTime(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const ms = now.getTime() - then.getTime();
  if (ms < 60_000) return 'now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  if (ms < 7 * 86_400_000) return `${Math.floor(ms / 86_400_000)}d`;
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatExactTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/* ── Main view ──────────────────────────────────────────────────────── */

export function CommunicationView({
  slug,
  initialEmailConnected,
  initialWhatsAppConnected,
  initialEmailProvider,
}: CommunicationViewProps) {
  const [emailConnected, setEmailConnected] = useState(initialEmailConnected);
  const [whatsAppConnected, setWhatsAppConnected] = useState(
    initialWhatsAppConnected,
  );
  const [emailProvider, setEmailProvider] = useState<string | null>(
    initialEmailProvider,
  );
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(
    initialEmailConnected || initialWhatsAppConnected,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noteOutlookReadPending, setNoteOutlookReadPending] = useState(false);

  const [filter, setFilter] = useState<SourceFilter>('all');
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);

  const anyConnected = emailConnected || whatsAppConnected;

  // Initial + refetch.
  useEffect(() => {
    if (!anyConnected) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErrorMessage(null);
    fetch(`/api/communication?slug=${encodeURIComponent(slug)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Could not load (${res.status}).`);
        const data = (await res.json()) as FeedPayload;
        if (cancelled) return;
        if (!data.connected) {
          setEmailConnected(false);
          setWhatsAppConnected(false);
          setItems([]);
          return;
        }
        setEmailConnected(data.email);
        setWhatsAppConnected(data.whatsapp);
        setItems(data.items);
        setNoteOutlookReadPending(Boolean(data.noteOutlookReadPending));
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setErrorMessage(err.message || 'Could not reach your inbox.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [anyConnected, slug]);

  const handleSent = useCallback(() => {
    setComposeOpen(false);
    // Refetch the feed so the new outbound shows up. The send route
    // already invalidated the memo, so the next /api/communication call
    // re-hits Composio.
    if (!anyConnected) return;
    fetch(`/api/communication?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((data: FeedPayload) => {
        if (data.connected) {
          setItems(data.items);
          setNoteOutlookReadPending(Boolean(data.noteOutlookReadPending));
        }
      })
      .catch(() => {
        /* feed will catch up on next page nav; swallow */
      });
  }, [anyConnected, slug]);

  const visibleItems = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((it) => it.channel === filter);
  }, [filter, items]);

  // Filter affordance only shows when both channels are connected and we
  // actually have items to filter. Silence beats configuration.
  const showFilter = emailConnected && whatsAppConnected && items.length > 0;

  const openItem = useMemo(
    () => items.find((it) => it.id === openItemId) ?? null,
    [items, openItemId],
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="w-full mx-auto chat-content-wrap pt-10 sm:pt-14 pb-56 md:pb-24 space-y-8 max-w-3xl">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <p className={BODY_MUTED}>Communication.</p>
            <h1 className={H1} style={TITLE_FONT}>
              Your messages, in here.
            </h1>
            <p className={BODY_MUTED}>
              {anyConnected
                ? statusLine({
                    emailConnected,
                    emailProvider,
                    whatsAppConnected,
                  })
                : 'Connect a channel so your conversations live here, not in tabs.'}
            </p>
          </div>
          {anyConnected && (
            <button
              type="button"
              onClick={() => setComposeOpen(true)}
              className={cn(PRIMARY_PILL, 'whitespace-nowrap shrink-0')}
              aria-label="New message"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New message</span>
              <span className="sm:hidden">New</span>
            </button>
          )}
        </header>

        {!anyConnected && <BothDisconnectedState slug={slug} />}

        {anyConnected && loading && (
          <ShimmerText
            messages={[
              'Reading your inbox.',
              'Catching up on WhatsApp.',
              'Bringing it together.',
            ]}
            className="block text-sm"
          />
        )}

        {anyConnected && !loading && errorMessage && (
          <Card>
            <CardContent className="p-5 space-y-2">
              <p className={BODY}>I couldn’t reach your inbox just now.</p>
              <p className={BODY_MUTED}>{errorMessage}</p>
            </CardContent>
          </Card>
        )}

        {anyConnected && !loading && !errorMessage && (
          <div className="space-y-6">
            {showFilter && (
              <SourceFilterChips value={filter} onChange={setFilter} />
            )}

            {visibleItems.length === 0 ? (
              <EmptyFeed
                filter={filter}
                emailConnected={emailConnected}
                whatsAppConnected={whatsAppConnected}
              />
            ) : (
              <ul className="divide-y divide-border/60">
                {visibleItems.map((it) => (
                  <FeedRow
                    key={it.id}
                    item={it}
                    onOpen={() => setOpenItemId(it.id)}
                  />
                ))}
              </ul>
            )}

            {/* Quiet nudges below the feed when only one channel is connected. */}
            {emailConnected && !whatsAppConnected && (
              <p className={cn(CAPTION, 'pt-4')}>
                <Link
                  href={`/s/${slug}/integrations`}
                  className="hover:text-foreground transition-colors"
                >
                  Connect WhatsApp to bring it in here too.
                </Link>
              </p>
            )}
            {whatsAppConnected && !emailConnected && (
              <p className={cn(CAPTION, 'pt-4')}>
                <Link
                  href={`/s/${slug}/integrations`}
                  className="hover:text-foreground transition-colors"
                >
                  Connect email to bring it in here too.
                </Link>
              </p>
            )}

            {noteOutlookReadPending && (
              <p className={cn(CAPTION, 'pt-2')}>
                Outlook reading is on the way. Gmail and WhatsApp are live.
              </p>
            )}
          </div>
        )}

        <ThreadDialog
          slug={slug}
          item={openItem}
          onClose={() => setOpenItemId(null)}
        />

        <ComposeDialog
          open={composeOpen}
          onClose={() => setComposeOpen(false)}
          slug={slug}
          emailConnected={emailConnected}
          whatsAppConnected={whatsAppConnected}
          onSent={handleSent}
        />
      </div>
    </div>
  );
}

/* ── Subtitle ──────────────────────────────────────────────────────── */

function statusLine(args: {
  emailConnected: boolean;
  emailProvider: string | null;
  whatsAppConnected: boolean;
}): string {
  const parts: string[] = [];
  if (args.emailConnected) {
    const label =
      args.emailProvider === 'gmail'
        ? 'Gmail'
        : args.emailProvider === 'outlook'
          ? 'Outlook'
          : 'email';
    parts.push(label);
  }
  if (args.whatsAppConnected) parts.push('WhatsApp');
  if (parts.length === 0) return '';
  return `Reading from ${parts.join(' and ')}.`;
}

/* ── Source filter ─────────────────────────────────────────────────── */

function SourceFilterChips({
  value,
  onChange,
}: {
  value: SourceFilter;
  onChange: (next: SourceFilter) => void;
}) {
  // Quiet text-link chips, separated by middots. Not a tab strip.
  const chip = (key: SourceFilter, label: string) => (
    <button
      key={key}
      type="button"
      onClick={() => onChange(key)}
      className={cn(
        'text-sm transition-colors duration-150',
        value === key
          ? 'text-foreground font-medium'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  );
  return (
    <div className="flex items-center gap-2">
      {chip('all', 'All')}
      <span className={BODY_MUTED}>·</span>
      {chip('email', 'Email')}
      <span className={BODY_MUTED}>·</span>
      {chip('whatsapp', 'WhatsApp')}
    </div>
  );
}

/* ── Row ───────────────────────────────────────────────────────────── */

function FeedRow({ item, onOpen }: { item: FeedItem; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="w-full text-left py-3 flex items-start gap-3 hover:bg-foreground/[0.02] transition-colors duration-150"
      >
        {/* Channel chip — small caps, muted, fixed width column. */}
        <span
          className={cn(SECTION_LABEL, 'w-[68px] shrink-0 pt-0.5 tabular-nums')}
        >
          {item.channel === 'whatsapp' ? 'WHATSAPP' : 'EMAIL'}
        </span>
        <div className="min-w-0 flex-1 pr-3">
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                'text-sm truncate',
                item.unread
                  ? 'font-semibold text-foreground'
                  : 'text-foreground',
              )}
            >
              {item.fromName}
            </span>
            {item.fromAddress && item.fromAddress !== item.fromName && (
              <span className={cn(CAPTION, 'truncate min-w-0')}>
                {item.fromAddress}
              </span>
            )}
          </div>
          <p className={cn(CAPTION, 'mt-0.5 truncate')}>
            {item.subject ? (
              <>
                <span className="text-foreground/80">{item.subject}</span>
                {item.snippet ? <span> — {item.snippet}</span> : null}
              </>
            ) : (
              item.snippet || ''
            )}
          </p>
        </div>
        <span className={cn(META, 'shrink-0 pt-0.5')}>
          {formatRelativeTime(item.lastAt)}
        </span>
      </button>
    </li>
  );
}

/* ── Empty + connect states ────────────────────────────────────────── */

function EmptyFeed({
  filter,
  emailConnected,
  whatsAppConnected,
}: {
  filter: SourceFilter;
  emailConnected: boolean;
  whatsAppConnected: boolean;
}) {
  // The brief's "Quiet across the board." canonical empty state.
  let title = 'Quiet across the board.';
  if (filter === 'email' && emailConnected) title = 'Email is quiet.';
  if (filter === 'whatsapp' && whatsAppConnected) title = 'WhatsApp is quiet.';
  return (
    <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 py-12 px-6 flex flex-col items-center text-center">
      <div className="mb-3 w-10 h-10 rounded-lg bg-foreground/[0.04] flex items-center justify-center">
        <MessageSquare
          size={16}
          strokeWidth={1.75}
          className="text-muted-foreground"
        />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-[13px] text-muted-foreground max-w-[280px] leading-relaxed">
        Anything new will land here.
      </p>
    </div>
  );
}

function BothDisconnectedState({ slug }: { slug: string }) {
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
              Bring your email and WhatsApp here so the day’s conversations live
              in one place.
            </p>
            <p className={BODY_MUTED}>
              Gmail and WhatsApp Business are the fast paths.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/s/${slug}/integrations`}
            className={PRIMARY_PILL}
            aria-label="Connect email"
          >
            <Plug className="h-4 w-4" />
            Connect email
          </Link>
          <Link
            href={`/s/${slug}/integrations`}
            className={cn(GHOST_PILL, 'border border-border/70')}
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

/* ── Thread dialog ─────────────────────────────────────────────────── */

function ThreadDialog({
  slug,
  item,
  onClose,
}: {
  slug: string;
  item: FeedItem | null;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);

  useEffect(() => {
    if (!item) {
      setMessages([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(
      `/api/communication/${encodeURIComponent(item.id)}?slug=${encodeURIComponent(
        slug,
      )}`,
    )
      .then(async (res) => {
        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(errBody.error ?? `Could not load (${res.status}).`);
        }
        return (await res.json()) as ThreadPayload;
      })
      .then((data) => {
        if (cancelled) return;
        setMessages(data.messages);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item, slug]);

  return (
    <Dialog open={Boolean(item)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <span className={cn(SECTION_LABEL, 'pt-1')}>
              {item?.channel === 'whatsapp' ? 'WHATSAPP' : 'EMAIL'}
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base font-medium text-foreground truncate">
                {item?.subject ?? item?.fromName ?? 'Conversation'}
              </DialogTitle>
              {item && (
                <p className={cn(CAPTION, 'mt-0.5 truncate')}>
                  {item.fromName}
                  {item.fromAddress && item.fromAddress !== item.fromName ? (
                    <> — {item.fromAddress}</>
                  ) : null}
                </p>
              )}
            </div>
          </div>
        </DialogHeader>

        {loading && (
          <ShimmerText
            messages={
              item?.channel === 'whatsapp'
                ? 'Pulling this conversation.'
                : 'Pulling this thread.'
            }
            className="block text-sm"
          />
        )}

        {!loading && error && (
          <div className="text-sm text-muted-foreground">{error}</div>
        )}

        {!loading && !error && messages.length === 0 && (
          <p className={BODY_MUTED}>Nothing to show here yet.</p>
        )}

        {!loading && !error && messages.length > 0 && (
          <div className="space-y-4">
            {messages.map((m) => (
              <article
                key={m.id}
                className={cn(
                  'rounded-md border border-border/60 p-4 space-y-2',
                  m.fromMe ? 'bg-muted/30' : '',
                )}
              >
                <header className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-foreground">
                      {m.fromMe ? 'You' : m.fromName || m.fromAddress || 'Unknown'}
                    </span>
                    {!m.fromMe && m.fromAddress && m.fromAddress !== m.fromName && (
                      <span className={cn(CAPTION, ' ml-2 truncate')}>
                        {m.fromAddress}
                      </span>
                    )}
                  </div>
                  <span className={META}>{formatExactTime(m.sentAt)}</span>
                </header>
                {m.subject && m.subject !== item?.subject && (
                  <p className={cn(CAPTION, 'text-foreground/80')}>
                    {m.subject}
                  </p>
                )}
                <p className="text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">
                  {m.body}
                </p>
              </article>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── Compose dialog ────────────────────────────────────────────────── */

function ComposeDialog({
  open,
  onClose,
  slug,
  emailConnected,
  whatsAppConnected,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  emailConnected: boolean;
  whatsAppConnected: boolean;
  onSent: () => void;
}) {
  // Default channel: email if connected, else WhatsApp.
  const initialChannel: 'email' | 'whatsapp' = emailConnected
    ? 'email'
    : 'whatsapp';
  const [channel, setChannel] = useState<'email' | 'whatsapp'>(initialChannel);
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Reset when the modal opens so each compose starts clean.
  useEffect(() => {
    if (!open) return;
    setChannel(emailConnected ? 'email' : 'whatsapp');
    setTo('');
    setCc('');
    setSubject('');
    setBody('');
    setErrorMessage(null);
    setSending(false);
  }, [open, emailConnected]);

  const bothConnected = emailConnected && whatsAppConnected;

  const handleSend = useCallback(async () => {
    setSending(true);
    setErrorMessage(null);
    try {
      const payload: Record<string, unknown> = {
        slug,
        channel,
        to,
        body,
      };
      if (channel === 'email') {
        payload.subject = subject;
        if (cc.trim()) payload.cc = cc;
      }
      const res = await fetch('/api/communication/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || 'That didn’t go through.');
      }
      onSent();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'That didn’t go through.');
    } finally {
      setSending(false);
    }
  }, [body, cc, channel, onSent, slug, subject, to]);

  const canSubmit = useMemo(() => {
    if (sending) return false;
    if (!to.trim()) return false;
    if (!body.trim()) return false;
    if (channel === 'email' && !subject.trim()) return false;
    return true;
  }, [body, channel, sending, subject, to]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-base font-medium text-foreground">
            New message
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {bothConnected && (
            <div className="flex items-center gap-2">
              <span className={cn(SECTION_LABEL, 'shrink-0')}>Channel</span>
              <div
                role="tablist"
                aria-label="Send via"
                className="inline-flex items-center rounded-full border border-border/70 p-0.5"
              >
                <ChannelTab
                  active={channel === 'email'}
                  onClick={() => setChannel('email')}
                  label="Email"
                />
                <ChannelTab
                  active={channel === 'whatsapp'}
                  onClick={() => setChannel('whatsapp')}
                  label="WhatsApp"
                />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="comm-to" className={SECTION_LABEL}>
              To
            </Label>
            <Input
              id="comm-to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder={
                channel === 'email'
                  ? 'name@email.com'
                  : '+15551234567'
              }
              disabled={sending}
            />
          </div>

          {channel === 'email' && (
            <>
              <div className="space-y-1">
                <Label htmlFor="comm-cc" className={SECTION_LABEL}>
                  Cc <span className="font-normal lowercase tracking-normal">(optional)</span>
                </Label>
                <Input
                  id="comm-cc"
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  placeholder="name@email.com"
                  disabled={sending}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="comm-subject" className={SECTION_LABEL}>
                  Subject
                </Label>
                <Input
                  id="comm-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Subject"
                  disabled={sending}
                />
              </div>
            </>
          )}

          <div className="space-y-1">
            <Label htmlFor="comm-body" className={SECTION_LABEL}>
              Message
            </Label>
            <Textarea
              id="comm-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={
                channel === 'email'
                  ? 'Write your message…'
                  : 'Write your message…'
              }
              rows={channel === 'whatsapp' ? 5 : 8}
              disabled={sending}
              className="resize-none"
            />
          </div>

          {errorMessage && (
            <p className="text-xs text-destructive">{errorMessage}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={sending}
              className={cn(GHOST_PILL)}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSubmit}
              className={cn(PRIMARY_PILL, 'disabled:opacity-50')}
            >
              <Send className="h-4 w-4" />
              {sending
                ? 'Sending…'
                : channel === 'whatsapp'
                  ? 'Send via WhatsApp'
                  : 'Send'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChannelTab({
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
        'px-3 h-7 rounded-full text-[11px] font-medium uppercase tracking-wider transition-colors duration-150',
        active
          ? 'bg-foreground text-background'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  );
}
