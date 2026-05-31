'use client';

/**
 * /s/[slug]/email — the realtor's Gmail inbox, here.
 *
 * Channel-pure (no WhatsApp). Rows are tappable into a full-page read at
 * /email/[id]. Filter sits at the top: Inbox · Starred · Sent. Star
 * toggles right from the row (always visible on mobile, hover-revealed
 * on desktop) and writes through to Gmail's STARRED label. Load more
 * pages in 30 at a time via Gmail's pageToken.
 *
 * No channel chip in the row — this surface IS email. Showing "EMAIL"
 * on every row would be the surface confessing it doesn't know what it is.
 *
 * Compose stays a modal: writing is a focal task that earns a dialog.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail, Plug, Plus, Send, Star } from 'lucide-react';
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

export type EmailFilter = 'inbox' | 'starred' | 'sent';

const FILTERS: { key: EmailFilter; label: string }[] = [
  { key: 'inbox', label: 'Inbox' },
  { key: 'starred', label: 'Starred' },
  { key: 'sent', label: 'Sent' },
];

interface EmailListItem {
  id: string;
  threadId: string;
  fromName: string;
  fromAddress: string;
  toName: string;
  toAddress: string;
  subject: string | null;
  snippet: string;
  sentAt: string;
  unread: boolean;
  starred: boolean;
}

interface ConnectedPayload {
  connected: true;
  provider: 'gmail' | 'outlook';
  filter: EmailFilter;
  items: EmailListItem[];
  nextPageToken: string | null;
  noteOutlookReadPending?: boolean;
}

interface NotConnectedPayload {
  connected: false;
}

type FetchPayload = ConnectedPayload | NotConnectedPayload;

interface EmailInboxViewProps {
  slug: string;
  initialConnected: boolean;
  initialProvider: string | null;
}

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

function filterStorageKey(slug: string): string {
  return `email-filter:${slug}`;
}

function readStoredFilter(slug: string): EmailFilter {
  if (typeof window === 'undefined') return 'inbox';
  try {
    const v = window.localStorage.getItem(filterStorageKey(slug));
    if (v === 'starred' || v === 'sent' || v === 'inbox') return v;
  } catch {
    /* localStorage can throw in private browsing — treat as inbox. */
  }
  return 'inbox';
}

function writeStoredFilter(slug: string, filter: EmailFilter): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(filterStorageKey(slug), filter);
  } catch {
    /* no-op */
  }
}

export function EmailInboxView({
  slug,
  initialConnected,
  initialProvider,
}: EmailInboxViewProps) {
  const router = useRouter();
  const [connected, setConnected] = useState(initialConnected);
  const [provider, setProvider] = useState<string | null>(initialProvider);
  const [filter, setFilter] = useState<EmailFilter>('inbox');
  const [items, setItems] = useState<EmailListItem[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(initialConnected);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noteOutlookReadPending, setNoteOutlookReadPending] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const filterRef = useRef<EmailFilter>('inbox');

  // Hydrate filter from localStorage on mount.
  useEffect(() => {
    const stored = readStoredFilter(slug);
    setFilter(stored);
    filterRef.current = stored;
  }, [slug]);

  const fetchPage = useCallback(
    async (args: {
      filter: EmailFilter;
      pageToken: string | null;
      append: boolean;
    }) => {
      if (!connected) {
        setLoading(false);
        return;
      }
      if (args.append) setLoadingMore(true);
      else setLoading(true);
      setErrorMessage(null);

      const params = new URLSearchParams();
      params.set('slug', slug);
      params.set('filter', args.filter);
      if (args.pageToken) params.set('pageToken', args.pageToken);

      try {
        const res = await fetch(`/api/email?${params.toString()}`);
        if (!res.ok) throw new Error(`Could not load (${res.status}).`);
        const data = (await res.json()) as FetchPayload;
        // If a newer fetch already wrote (filter changed), discard this one.
        if (filterRef.current !== args.filter) return;
        if (!data.connected) {
          setConnected(false);
          setItems([]);
          setNextPageToken(null);
          return;
        }
        setConnected(true);
        setProvider(data.provider);
        setNoteOutlookReadPending(Boolean(data.noteOutlookReadPending));
        setItems((prev) => (args.append ? [...prev, ...data.items] : data.items));
        setNextPageToken(data.nextPageToken);
      } catch (err) {
        if (filterRef.current !== args.filter) return;
        setErrorMessage(
          err instanceof Error ? err.message : 'Could not reach your inbox.',
        );
      } finally {
        if (filterRef.current === args.filter) {
          if (args.append) setLoadingMore(false);
          else setLoading(false);
        }
      }
    },
    [connected, slug],
  );

  // Fetch on filter change.
  useEffect(() => {
    filterRef.current = filter;
    if (!connected) {
      setLoading(false);
      return;
    }
    fetchPage({ filter, pageToken: null, append: false });
  }, [filter, connected, fetchPage]);

  const handleFilterChange = useCallback(
    (next: EmailFilter) => {
      writeStoredFilter(slug, next);
      setFilter(next);
    },
    [slug],
  );

  const handleLoadMore = useCallback(() => {
    if (!nextPageToken || loadingMore) return;
    fetchPage({ filter, pageToken: nextPageToken, append: true });
  }, [fetchPage, filter, loadingMore, nextPageToken]);

  const handleSent = useCallback(() => {
    setComposeOpen(false);
    // Refetch the current view so the new outbound shows up if filter=sent.
    fetchPage({ filter, pageToken: null, append: false });
  }, [fetchPage, filter]);

  const handleStarToggle = useCallback(
    async (messageId: string, nextStarred: boolean) => {
      // Optimistic update + write through. Roll back on failure.
      setItems((prev) =>
        prev.map((it) =>
          it.id === messageId ? { ...it, starred: nextStarred } : it,
        ),
      );
      try {
        const res = await fetch('/api/email/star', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug, messageId, starred: nextStarred }),
        });
        if (!res.ok) throw new Error('star failed');
      } catch {
        // Roll back.
        setItems((prev) =>
          prev.map((it) =>
            it.id === messageId ? { ...it, starred: !nextStarred } : it,
          ),
        );
      }
    },
    [slug],
  );

  const handleRowOpen = useCallback(
    (messageId: string) => {
      // Mark as read locally — Gmail will catch up server-side; we don't
      // round-trip a read-mark in v1.
      setItems((prev) =>
        prev.map((it) => (it.id === messageId ? { ...it, unread: false } : it)),
      );
      router.push(`/s/${slug}/email/${encodeURIComponent(messageId)}`);
    },
    [router, slug],
  );

  const visible = items;

  return (
    <div className="h-full overflow-y-auto">
      <div className="w-full mx-auto chat-content-wrap pt-10 sm:pt-14 pb-56 md:pb-24 space-y-8 max-w-3xl">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <p className={BODY_MUTED}>Email.</p>
            <h1 className={H1} style={TITLE_FONT}>
              Your inbox, in here.
            </h1>
            <p className={BODY_MUTED}>
              {connected
                ? statusLine(provider)
                : 'Connect Gmail so your email lives here, not in tabs.'}
            </p>
          </div>
          {connected && (
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

        {!connected && <DisconnectedState slug={slug} />}

        {connected && (
          <div className="space-y-5">
            <FilterChips value={filter} onChange={handleFilterChange} />

            {loading && (
              <ShimmerText
                messages={[
                  'Reading your inbox.',
                  'Bringing in the latest.',
                ]}
                className="block text-sm"
              />
            )}

            {!loading && errorMessage && (
              <Card>
                <CardContent className="p-5 space-y-2">
                  <p className={BODY}>I couldn’t reach your inbox just now.</p>
                  <p className={BODY_MUTED}>{errorMessage}</p>
                </CardContent>
              </Card>
            )}

            {!loading && !errorMessage && visible.length === 0 && (
              <EmptyFeed filter={filter} />
            )}

            {!loading && !errorMessage && visible.length > 0 && (
              <>
                <ul className="divide-y divide-border/60">
                  {visible.map((it) => (
                    <EmailRow
                      key={it.id}
                      item={it}
                      filter={filter}
                      onOpen={() => handleRowOpen(it.id)}
                      onToggleStar={() => handleStarToggle(it.id, !it.starred)}
                    />
                  ))}
                </ul>
                {nextPageToken && (
                  <div className="flex justify-center pt-2">
                    <button
                      type="button"
                      onClick={handleLoadMore}
                      disabled={loadingMore}
                      className={cn(GHOST_PILL, 'border border-border/70')}
                    >
                      {loadingMore ? 'Loading…' : 'Load more'}
                    </button>
                  </div>
                )}
              </>
            )}

            {noteOutlookReadPending && (
              <p className={cn(CAPTION, 'pt-2')}>
                Outlook reading is on the way. Connect Gmail to see your inbox.
              </p>
            )}
          </div>
        )}

        <ComposeDialog
          open={composeOpen}
          onClose={() => setComposeOpen(false)}
          slug={slug}
          onSent={handleSent}
        />
      </div>
    </div>
  );
}

function statusLine(provider: string | null): string {
  if (provider === 'gmail') return 'Reading from Gmail.';
  if (provider === 'outlook') return 'Reading from Outlook.';
  return '';
}

function FilterChips({
  value,
  onChange,
}: {
  value: EmailFilter;
  onChange: (next: EmailFilter) => void;
}) {
  return (
    <div className="flex items-center gap-2" role="tablist" aria-label="Filter">
      {FILTERS.map((f, idx) => (
        <span key={f.key} className="flex items-center gap-2">
          {idx > 0 && <span className={BODY_MUTED}>·</span>}
          <button
            type="button"
            role="tab"
            aria-selected={value === f.key}
            onClick={() => onChange(f.key)}
            className={cn(
              'text-sm transition-colors duration-150',
              value === f.key
                ? 'text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {f.label}
          </button>
        </span>
      ))}
    </div>
  );
}

function EmailRow({
  item,
  filter,
  onOpen,
  onToggleStar,
}: {
  item: EmailListItem;
  filter: EmailFilter;
  onOpen: () => void;
  onToggleStar: () => void;
}) {
  // For Sent: show the recipient, not the realtor themselves.
  const isSent = filter === 'sent';
  const displayName = isSent
    ? item.toName || item.toAddress || '(no recipient)'
    : item.fromName || item.fromAddress || '(unknown sender)';
  const displayAddress = isSent ? item.toAddress : item.fromAddress;

  return (
    <li className="group/row">
      <div className="flex items-start gap-3 py-3">
        {/* Unread dot — left rail. Tiny but earned by being the only thing
            that pulls the eye to a new row. */}
        <span className="w-1.5 shrink-0 pt-2.5 flex items-center justify-center">
          <span
            className={cn(
              'block w-1.5 h-1.5 rounded-full transition-colors',
              item.unread ? 'bg-foreground' : 'bg-transparent',
            )}
            aria-hidden
          />
        </span>

        <button
          type="button"
          onClick={onOpen}
          className="flex-1 min-w-0 text-left hover:bg-foreground/[0.02] transition-colors duration-150 -my-1 py-1"
        >
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                'text-sm truncate',
                item.unread
                  ? 'font-semibold text-foreground'
                  : 'text-foreground',
              )}
            >
              {displayName}
            </span>
            {displayAddress && displayAddress !== displayName && (
              <span className={cn(CAPTION, 'truncate min-w-0')}>
                {displayAddress}
              </span>
            )}
          </div>
          <p className={cn(CAPTION, 'mt-0.5 truncate')}>
            {item.subject ? (
              <>
                <span
                  className={cn(
                    item.unread ? 'text-foreground' : 'text-foreground/80',
                  )}
                >
                  {item.subject}
                </span>
                {item.snippet ? <span> — {item.snippet}</span> : null}
              </>
            ) : (
              item.snippet || ''
            )}
          </p>
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleStar();
          }}
          aria-label={item.starred ? 'Unstar' : 'Star'}
          className={cn(
            'shrink-0 p-1 -m-1 rounded-md transition-opacity duration-150',
            item.starred
              ? 'opacity-100'
              : 'opacity-100 md:opacity-0 md:group-hover/row:opacity-100',
          )}
        >
          <Star
            size={15}
            strokeWidth={1.75}
            className={cn(
              'transition-colors',
              item.starred
                ? 'fill-foreground text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          />
        </button>

        <span className={cn(META, 'shrink-0 pt-1 tabular-nums')}>
          {formatRelative(item.sentAt)}
        </span>
      </div>
    </li>
  );
}

function EmptyFeed({ filter }: { filter: EmailFilter }) {
  const title =
    filter === 'starred'
      ? 'Nothing starred yet.'
      : filter === 'sent'
        ? 'Nothing sent yet.'
        : 'Inbox is quiet.';
  return (
    <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 py-12 px-6 flex flex-col items-center text-center">
      <div className="mb-3 w-10 h-10 rounded-lg bg-foreground/[0.04] flex items-center justify-center">
        <Mail size={16} strokeWidth={1.75} className="text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-[13px] text-muted-foreground max-w-[280px] leading-relaxed">
        Anything new will land here.
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
            <Mail size={16} strokeWidth={1.75} className="text-muted-foreground" />
          </div>
          <div className="space-y-1.5">
            <p className={BODY}>
              Bring your email here so the day’s threads live in one place.
            </p>
            <p className={BODY_MUTED}>Gmail is the fast path.</p>
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
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Compose dialog ────────────────────────────────────────────────── */

function ComposeDialog({
  open,
  onClose,
  slug,
  onSent,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  onSent: () => void;
  initial?: {
    to?: string;
    subject?: string;
    body?: string;
  };
}) {
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTo(initial?.to ?? '');
    setCc('');
    setSubject(initial?.subject ?? '');
    setBody(initial?.body ?? '');
    setErrorMessage(null);
    setSending(false);
  }, [open, initial?.to, initial?.subject, initial?.body]);

  const handleSend = useCallback(async () => {
    setSending(true);
    setErrorMessage(null);
    try {
      const payload: Record<string, unknown> = { slug, to, subject, body };
      if (cc.trim()) payload.cc = cc;
      const res = await fetch('/api/email/send', {
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
      setErrorMessage(
        err instanceof Error ? err.message : 'That didn’t go through.',
      );
    } finally {
      setSending(false);
    }
  }, [body, cc, onSent, slug, subject, to]);

  const canSubmit = useMemo(() => {
    if (sending) return false;
    if (!to.trim()) return false;
    if (!subject.trim()) return false;
    if (!body.trim()) return false;
    return true;
  }, [body, sending, subject, to]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-base font-medium text-foreground">
            New message
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="email-to" className={SECTION_LABEL}>
              To
            </Label>
            <Input
              id="email-to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="name@email.com"
              disabled={sending}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="email-cc" className={SECTION_LABEL}>
              Cc{' '}
              <span className="font-normal lowercase tracking-normal">
                (optional)
              </span>
            </Label>
            <Input
              id="email-cc"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="name@email.com"
              disabled={sending}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="email-subject" className={SECTION_LABEL}>
              Subject
            </Label>
            <Input
              id="email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              disabled={sending}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="email-body" className={SECTION_LABEL}>
              Message
            </Label>
            <Textarea
              id="email-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message…"
              rows={8}
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
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Exposed so the read page can reuse the same compose modal. */
export { ComposeDialog as EmailComposeDialog };
