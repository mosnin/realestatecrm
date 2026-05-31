'use client';

/**
 * /s/[slug]/mail — the realtor's inbox, here.
 *
 * Same vocabulary as /calendar: three connection states (not connected,
 * connected-and-empty, connected-with-messages), a + Compose pill in the
 * header, and a dialog read pane for individual messages. Send goes
 * through the realtor's own provider so the From line is theirs.
 *
 * v1 deliberately omits: rich text body, search/filter, label management,
 * mark-as-read writes back to the provider, threaded reply UI (we send a
 * reply as a fresh message with Re: prefix — provider threads on subject
 * + In-Reply-To headers we don't yet pass through).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Mail as MailIcon, Plug, Plus, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toastSuccess, toastError } from '@/lib/toast-helpers';
import { cn } from '@/lib/utils';
import {
  H1,
  TITLE_FONT,
  BODY_MUTED,
  BODY,
  SECTION_LABEL,
  PRIMARY_PILL,
  GHOST_PILL,
  META,
  CAPTION,
  QUIET_LINK,
} from '@/lib/typography';

/* ── Shapes (mirror /api/mail) ────────────────────────────────────────── */

interface MailListItem {
  id: string;
  threadId: string | null;
  fromName: string | null;
  fromEmail: string;
  subject: string;
  snippet: string;
  receivedAt: string;
  unread: boolean;
  webLink: string | null;
}

interface MailMessageDetail {
  id: string;
  threadId: string | null;
  fromName: string | null;
  fromEmail: string;
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  receivedAt: string;
  webLink: string | null;
}

interface ConnectedPayload {
  connected: true;
  provider: string;
  messages: MailListItem[];
}
interface NotConnectedPayload {
  connected: false;
}
type FetchPayload = ConnectedPayload | NotConnectedPayload;

interface MailViewProps {
  slug: string;
  initialConnected: boolean;
  initialProvider: string | null;
}

/* ── Provider copy ────────────────────────────────────────────────────── */

function providerLabel(provider: string | null): string {
  if (provider === 'gmail') return 'Gmail';
  if (provider === 'outlook') return 'Outlook';
  return 'your inbox';
}

function providerSendable(provider: string | null): boolean {
  // Outlook reads in v1 but write is gated (see api/mail/send/route.ts).
  return provider === 'gmail';
}

/* ── Time + text helpers (no date-fns) ────────────────────────────────── */

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function senderInitials(item: { fromName: string | null; fromEmail: string }): string {
  const src = item.fromName ?? item.fromEmail;
  if (!src) return '?';
  return src.charAt(0).toUpperCase();
}

function senderDisplay(item: { fromName: string | null; fromEmail: string }): string {
  return item.fromName?.trim() || item.fromEmail || 'Unknown';
}

/* ── Main view ────────────────────────────────────────────────────────── */

export function MailView({
  slug,
  initialConnected,
  initialProvider,
}: MailViewProps) {
  const [connected, setConnected] = useState(initialConnected);
  const [provider, setProvider] = useState<string | null>(initialProvider);
  const [messages, setMessages] = useState<MailListItem[]>([]);
  const [loading, setLoading] = useState(initialConnected);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Read pane state
  const [openMessageId, setOpenMessageId] = useState<string | null>(null);

  // Compose modal state
  const [composeOpen, setComposeOpen] = useState(false);
  const [composePrefill, setComposePrefill] = useState<ComposePrefill | null>(null);

  useEffect(() => {
    if (!connected) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErrorMessage(null);
    fetch(`/api/mail?slug=${encodeURIComponent(slug)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
        const data = (await res.json()) as FetchPayload;
        if (cancelled) return;
        if (!data.connected) {
          setConnected(false);
          setProvider(null);
          setMessages([]);
          return;
        }
        setProvider(data.provider);
        setMessages(data.messages);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setErrorMessage(err.message || "Couldn't reach your mailbox.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connected, slug]);

  const openCompose = useCallback((prefill: ComposePrefill | null = null) => {
    setComposePrefill(prefill);
    setComposeOpen(true);
  }, []);

  const openMessage = useCallback((id: string) => {
    setOpenMessageId(id);
  }, []);

  const handleReply = useCallback(
    (detail: MailMessageDetail) => {
      const subj = detail.subject.startsWith('Re:')
        ? detail.subject
        : `Re: ${detail.subject}`;
      const quoted = detail.body
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
      const header = `On ${new Date(detail.receivedAt).toLocaleString()}, ${senderDisplay(detail)} wrote:`;
      openCompose({
        to: detail.fromEmail ? [detail.fromEmail] : [],
        cc: [],
        bcc: [],
        subject: subj,
        body: `\n\n${header}\n${quoted}`,
        inReplyToId: detail.id,
      });
      setOpenMessageId(null);
    },
    [openCompose],
  );

  return (
    <div className="h-full overflow-y-auto">
      <div
        className={cn(
          'w-full max-w-3xl mx-auto chat-content-wrap pt-10 sm:pt-14 pb-56 md:pb-24 space-y-8',
        )}
      >
        <header className="space-y-1.5">
          <p className={BODY_MUTED}>Mail.</p>
          <h1 className={H1} style={TITLE_FONT}>
            Your inbox, in here.
          </h1>
          <p className={BODY_MUTED}>
            {connected
              ? `Reading from ${providerLabel(provider)}.`
              : 'Connect your mailbox so I can show you what landed and send replies from your address.'}
          </p>
        </header>

        {!connected && <NotConnectedState slug={slug} />}

        {connected && (
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => openCompose(null)}
              disabled={!providerSendable(provider)}
              title={
                providerSendable(provider)
                  ? undefined
                  : 'Sending from Outlook isn’t live yet.'
              }
              className={cn(
                PRIMARY_PILL,
                'whitespace-nowrap shrink-0',
                !providerSendable(provider) && 'opacity-50 cursor-not-allowed',
              )}
              aria-label="Compose new email"
            >
              <Plus className="h-4 w-4" />
              <span>Compose</span>
            </button>
          </div>
        )}

        {connected && loading && (
          <p className={BODY_MUTED}>One moment — pulling your inbox.</p>
        )}

        {connected && !loading && errorMessage && (
          <Card>
            <CardContent className="p-5 space-y-2">
              <p className={BODY}>I couldn&apos;t reach your mailbox just now.</p>
              <p className={BODY_MUTED}>{errorMessage}</p>
            </CardContent>
          </Card>
        )}

        {connected && !loading && !errorMessage && messages.length === 0 && (
          <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-6 py-12 text-center">
            <p className={BODY}>Inbox is quiet.</p>
            <p className={`${BODY_MUTED} mt-1`}>I&apos;ll surface anything that needs you in the brief.</p>
          </div>
        )}

        {connected && !loading && !errorMessage && messages.length > 0 && (
          <MessageList messages={messages} onOpen={openMessage} />
        )}

        {connected && openMessageId && (
          <ReadPaneDialog
            slug={slug}
            messageId={openMessageId}
            onClose={() => setOpenMessageId(null)}
            onReply={handleReply}
            canSend={providerSendable(provider)}
          />
        )}

        {connected && (
          <ComposeModal
            open={composeOpen}
            onClose={() => setComposeOpen(false)}
            prefill={composePrefill}
            slug={slug}
          />
        )}
      </div>
    </div>
  );
}

/* ── Not-connected card ──────────────────────────────────────────────── */

function NotConnectedState({ slug }: { slug: string }) {
  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 w-9 h-9 rounded-lg bg-foreground/[0.04] flex items-center justify-center shrink-0">
            <MailIcon size={16} strokeWidth={1.75} className="text-muted-foreground" />
          </div>
          <div className="space-y-1.5">
            <p className={BODY}>
              Connect your mailbox and your inbox lands here. Replies and new
              messages go out from your address, not mine.
            </p>
            <p className={BODY_MUTED}>Gmail is the fast path. Outlook reads work too.</p>
          </div>
        </div>
        <div>
          <Link href={`/s/${slug}/integrations`} className={PRIMARY_PILL}>
            <Plug className="h-4 w-4" />
            Connect Gmail
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Message list ─────────────────────────────────────────────────────── */

function MessageList({
  messages,
  onOpen,
}: {
  messages: MailListItem[];
  onOpen: (id: string) => void;
}) {
  return (
    <ul className="divide-y divide-border/60 border-y border-border/60">
      {messages.map((m) => (
        <li key={m.id}>
          <button
            type="button"
            onClick={() => onOpen(m.id)}
            className="w-full text-left py-3 hover:bg-foreground/[0.04] transition-colors duration-150 -mx-3 px-3 rounded"
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'mt-2 h-1.5 w-1.5 rounded-full shrink-0',
                  m.unread ? 'bg-foreground' : 'bg-transparent',
                )}
                aria-label={m.unread ? 'Unread' : 'Read'}
              />
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-baseline gap-2">
                  <span className={cn(BODY, 'font-medium truncate')}>
                    {senderDisplay(m)}
                  </span>
                  <span className={cn(META, 'truncate hidden sm:inline')}>
                    {m.fromEmail}
                  </span>
                  <span className={cn(META, 'ml-auto shrink-0 tabular-nums')}>
                    {relativeTime(m.receivedAt)}
                  </span>
                </div>
                <p className={cn(BODY, 'truncate')}>{m.subject}</p>
                {m.snippet && (
                  <p className={cn(CAPTION, 'truncate')}>{m.snippet}</p>
                )}
              </div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ── Read pane dialog ─────────────────────────────────────────────────── */

function ReadPaneDialog({
  slug,
  messageId,
  onClose,
  onReply,
  canSend,
}: {
  slug: string;
  messageId: string;
  onClose: () => void;
  onReply: (detail: MailMessageDetail) => void;
  canSend: boolean;
}) {
  const [detail, setDetail] = useState<MailMessageDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    fetch(`/api/mail/${encodeURIComponent(messageId)}?slug=${encodeURIComponent(slug)}`)
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as
          | { message?: MailMessageDetail; error?: string }
          | undefined;
        if (cancelled) return;
        if (!res.ok || !data?.message) {
          setError(data?.error ?? 'Could not open this message.');
          return;
        }
        setDetail(data.message);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message || 'Could not open this message.');
      });
    return () => {
      cancelled = true;
    };
  }, [messageId, slug]);

  return (
    <Dialog open={true} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-left">
            {detail?.subject ?? 'Loading…'}
          </DialogTitle>
        </DialogHeader>

        {error && <p className={BODY_MUTED}>{error}</p>}
        {!detail && !error && <p className={BODY_MUTED}>One moment — opening the message.</p>}

        {detail && (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5 min-w-0">
                <p className={cn(BODY, 'font-medium truncate')}>
                  {senderDisplay(detail)}
                </p>
                <p className={cn(META, 'truncate')}>
                  {detail.fromEmail}
                  {' · '}
                  {new Date(detail.receivedAt).toLocaleString()}
                </p>
              </div>
              {detail.webLink && (
                <a
                  href={detail.webLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(QUIET_LINK, 'inline-flex items-center gap-1 shrink-0')}
                >
                  <ExternalLink size={13} strokeWidth={1.75} />
                  Open
                </a>
              )}
            </div>

            <div className="border-t border-border/60 pt-4">
              <pre
                className={cn(
                  BODY,
                  'whitespace-pre-wrap font-sans leading-relaxed',
                )}
              >
                {detail.body || '(No body)'}
              </pre>
            </div>

            <DialogFooter className="border-t border-border/60 pt-4">
              <button type="button" onClick={onClose} className={GHOST_PILL}>
                Close
              </button>
              <button
                type="button"
                onClick={() => onReply(detail)}
                disabled={!canSend}
                title={canSend ? undefined : 'Sending from Outlook isn’t live yet.'}
                className={cn(
                  PRIMARY_PILL,
                  !canSend && 'opacity-50 cursor-not-allowed',
                )}
              >
                Reply
              </button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── Compose modal ────────────────────────────────────────────────────── */

interface ComposePrefill {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  inReplyToId?: string;
}

interface ContactPick {
  id: string;
  name: string;
  email: string | null;
}

function ComposeModal({
  open,
  onClose,
  prefill,
  slug,
}: {
  open: boolean;
  onClose: () => void;
  prefill: ComposePrefill | null;
  slug: string;
}) {
  // Field state. Recipients are a string the realtor types into directly
  // (comma-separated) plus a contact picker that appends to it. One source
  // of truth — what's in the input is what we send.
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inReplyToId, setInReplyToId] = useState<string | null>(null);

  // Reset fields whenever the modal re-opens. The prefill arrives at the
  // moment we open (Reply → open with the quoted body); a fresh Compose
  // opens with everything blank.
  useEffect(() => {
    if (!open) return;
    setTo((prefill?.to ?? []).join(', '));
    setCc((prefill?.cc ?? []).join(', '));
    setBcc((prefill?.bcc ?? []).join(', '));
    setSubject(prefill?.subject ?? '');
    setBody(prefill?.body ?? '');
    setShowCcBcc(Boolean((prefill?.cc?.length ?? 0) || (prefill?.bcc?.length ?? 0)));
    setInReplyToId(prefill?.inReplyToId ?? null);
    setError(null);
  }, [open, prefill]);

  // Append the contact's email to the current To field.
  const handlePickContact = useCallback((contact: ContactPick) => {
    if (!contact.email) return;
    setTo((curr) => {
      const tokens = curr
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const lower = contact.email!.toLowerCase();
      if (tokens.some((t) => t.toLowerCase() === lower)) return curr;
      return tokens.length === 0
        ? contact.email!
        : `${tokens.join(', ')}, ${contact.email!}`;
    });
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (submitting) return;
      setError(null);
      setSubmitting(true);
      try {
        const res = await fetch('/api/mail/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug,
            to,
            cc: showCcBcc ? cc : '',
            bcc: showCcBcc ? bcc : '',
            subject,
            body,
            inReplyToId: inReplyToId ?? undefined,
          }),
        });
        const data: { ok?: boolean; error?: string } = await res
          .json()
          .catch(() => ({}));
        if (!res.ok || !data.ok) {
          const msg = data.error || `Couldn’t send (${res.status}).`;
          setError(msg);
          toastError(msg);
          return;
        }
        const firstRecipient =
          to.split(',').map((s) => s.trim()).find(Boolean) ?? 'them';
        toastSuccess(`Sent to ${firstRecipient}.`);
        onClose();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Network error.';
        setError(msg);
        toastError(msg);
      } finally {
        setSubmitting(false);
      }
    },
    [submitting, slug, to, cc, bcc, subject, body, showCcBcc, inReplyToId, onClose],
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{inReplyToId ? 'Reply' : 'New message'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="mail-to">To</Label>
            <Input
              id="mail-to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="sam@example.com"
              autoFocus
              required
            />
            <ContactPicker slug={slug} onPick={handlePickContact} />
          </div>

          {!showCcBcc && (
            <button
              type="button"
              onClick={() => setShowCcBcc(true)}
              className={cn(QUIET_LINK, 'text-xs')}
            >
              Cc · Bcc
            </button>
          )}

          {showCcBcc && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="mail-cc">Cc</Label>
                <Input
                  id="mail-cc"
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  placeholder="Comma-separated"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mail-bcc">Bcc</Label>
                <Input
                  id="mail-bcc"
                  value={bcc}
                  onChange={(e) => setBcc(e.target.value)}
                  placeholder="Comma-separated"
                />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="mail-subject">Subject</Label>
            <Input
              id="mail-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mail-body">Message</Label>
            <Textarea
              id="mail-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              required
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <DialogFooter>
            <button
              type="button"
              onClick={onClose}
              className={GHOST_PILL}
              disabled={submitting}
            >
              Cancel
            </button>
            <button type="submit" className={PRIMARY_PILL} disabled={submitting}>
              {submitting ? 'Sending…' : 'Send'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Contact picker — mirrors wizard-step-contacts pattern ────────────── */

function ContactPicker({
  slug,
  onPick,
}: {
  slug: string;
  onPick: (contact: ContactPick) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ContactPick[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/contacts?slug=${encodeURIComponent(slug)}&search=${encodeURIComponent(query)}&limit=8`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as Array<{
          id: string;
          name: string;
          email: string | null;
        }>;
        if (cancelled) return;
        setResults(
          data
            .filter((c) => Boolean(c.email))
            .map((c) => ({ id: c.id, name: c.name, email: c.email })),
        );
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, slug]);

  // Collapsed by default — the field appears under "Or pick from your people".
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(QUIET_LINK, 'text-xs')}
      >
        Or pick from your people
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-border/60 p-3">
      <div className="flex items-center justify-between">
        <p className={cn(SECTION_LABEL)}>Pick a contact</p>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setQuery('');
            setResults([]);
          }}
          aria-label="Close contact picker"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X size={14} />
        </button>
      </div>
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name or email…"
      />
      {searching && <p className={CAPTION}>Searching…</p>}
      {!searching && query.trim() && results.length === 0 && (
        <p className={CAPTION}>No contacts with email match.</p>
      )}
      {results.length > 0 && (
        <ul className="divide-y divide-border/60 max-h-48 overflow-y-auto">
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(c);
                  setQuery('');
                  setResults([]);
                }}
                className="w-full text-left py-2 hover:bg-foreground/[0.04] transition-colors px-1 rounded"
              >
                <p className={cn(BODY, 'truncate font-medium')}>{c.name}</p>
                {c.email && <p className={cn(META, 'truncate')}>{c.email}</p>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
