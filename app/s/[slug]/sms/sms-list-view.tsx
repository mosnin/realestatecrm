'use client';

/**
 * /s/[slug]/sms — outbound SMS history grouped by phone number.
 *
 * Same divide-y row vocabulary as `/communication`, scoped to one channel
 * so the page reads as a single idea. Tapping a row navigates to the
 * thread; compose lives in a Dialog opened from the header.
 *
 * Outbound-only for v1 — inbound SMS isn't wired (no Telnyx webhook
 * receiver). The one-liner under the title says so honestly rather than
 * suggesting silence equals "no replies."
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircle, Plus, Send } from 'lucide-react';
import { toast } from 'sonner';
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

interface SmsConversation {
  id: string;
  fromName: string;
  fromAddress: string;
  snippet: string;
  lastAt: string;
  outboundCount: number;
}

interface NotConfiguredPayload {
  connected: false;
}
interface ConfiguredPayload {
  connected: true;
  items: SmsConversation[];
  noteInboundPending: true;
}
type FeedPayload = NotConfiguredPayload | ConfiguredPayload;

interface SmsListViewProps {
  slug: string;
  initialConnected: boolean;
}

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

/* ── Main view ──────────────────────────────────────────────────────── */

export function SmsListView({ slug, initialConnected }: SmsListViewProps) {
  const router = useRouter();
  const [connected, setConnected] = useState(initialConnected);
  const [items, setItems] = useState<SmsConversation[]>([]);
  const [loading, setLoading] = useState(initialConnected);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);

  // Initial + refetch.
  useEffect(() => {
    if (!connected) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErrorMessage(null);
    fetch(`/api/sms?slug=${encodeURIComponent(slug)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Could not load (${res.status}).`);
        const data = (await res.json()) as FeedPayload;
        if (cancelled) return;
        if (!data.connected) {
          setConnected(false);
          setItems([]);
          return;
        }
        setItems(data.items);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setErrorMessage(err.message || 'Could not reach SMS history.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connected, slug]);

  const handleSent = useCallback(
    (phone: string | null) => {
      setComposeOpen(false);
      toast('Sent.');
      // Refetch the list so the new outbound shows up.
      fetch(`/api/sms?slug=${encodeURIComponent(slug)}`)
        .then((r) => r.json())
        .then((data: FeedPayload) => {
          if (data.connected) setItems(data.items);
        })
        .catch(() => {
          /* list will catch up on next nav; swallow */
        });
      // Deep-link the realtor straight into the thread they just texted.
      if (phone) {
        router.push(
          `/s/${slug}/sms/${encodeURIComponent(`sms:${encodeURIComponent(phone)}`)}`,
        );
      }
    },
    [router, slug],
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="w-full mx-auto chat-content-wrap pt-10 sm:pt-14 pb-56 md:pb-24 space-y-8 max-w-3xl">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <p className={BODY_MUTED}>SMS.</p>
            <h1 className={H1} style={TITLE_FONT}>
              Your texts, in here.
            </h1>
            <p className={BODY_MUTED}>
              {connected
                ? 'Showing outgoing SMS. Replies will land here once inbound is wired.'
                : 'SMS lives behind Telnyx — once the workspace is configured, this is where it surfaces.'}
            </p>
          </div>
          {connected && (
            <button
              type="button"
              onClick={() => setComposeOpen(true)}
              className={cn(PRIMARY_PILL, 'whitespace-nowrap shrink-0')}
              aria-label="New text"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New text</span>
              <span className="sm:hidden">New</span>
            </button>
          )}
        </header>

        {!connected && <NotConfiguredState />}

        {connected && loading && (
          <ShimmerText
            messages={[
              'Reading the SMS log.',
              'Bringing it together.',
            ]}
            className="block text-sm"
          />
        )}

        {connected && !loading && errorMessage && (
          <Card>
            <CardContent className="p-5 space-y-2">
              <p className={BODY}>I couldn’t reach the SMS log just now.</p>
              <p className={BODY_MUTED}>{errorMessage}</p>
            </CardContent>
          </Card>
        )}

        {connected && !loading && !errorMessage && (
          <div className="space-y-6">
            {items.length === 0 ? (
              <EmptyFeed />
            ) : (
              <ul className="divide-y divide-border/60">
                {items.map((it) => (
                  <ConversationRow key={it.id} item={it} slug={slug} />
                ))}
              </ul>
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

/* ── Row ───────────────────────────────────────────────────────────── */

function ConversationRow({
  item,
  slug,
}: {
  item: SmsConversation;
  slug: string;
}) {
  const router = useRouter();
  return (
    <li>
      <button
        type="button"
        onClick={() =>
          router.push(`/s/${slug}/sms/${encodeURIComponent(item.id)}`)
        }
        className="w-full text-left py-3 flex items-start gap-3 hover:bg-foreground/[0.02] transition-colors duration-150"
      >
        <span
          className={cn(SECTION_LABEL, 'w-[68px] shrink-0 pt-0.5 tabular-nums')}
        >
          SMS
        </span>
        <div className="min-w-0 flex-1 pr-3">
          <div className="flex items-baseline gap-2">
            <span className="text-sm text-foreground truncate">
              {item.fromName}
            </span>
            {item.fromAddress && item.fromAddress !== item.fromName && (
              <span className={cn(CAPTION, 'truncate min-w-0')}>
                {item.fromAddress}
              </span>
            )}
          </div>
          <p className={cn(CAPTION, 'mt-0.5 truncate')}>
            {item.snippet || '(No message body)'}
          </p>
        </div>
        <span className={cn(META, 'shrink-0 pt-0.5')}>
          {formatRelativeTime(item.lastAt)}
        </span>
      </button>
    </li>
  );
}

/* ── States ──────────────────────────────────────────────────────────── */

function EmptyFeed() {
  return (
    <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 py-12 px-6 flex flex-col items-center text-center">
      <div className="mb-3 w-10 h-10 rounded-lg bg-foreground/[0.04] flex items-center justify-center">
        <MessageCircle
          size={16}
          strokeWidth={1.75}
          className="text-muted-foreground"
        />
      </div>
      <p className="text-sm font-medium text-foreground">Quiet on SMS.</p>
      <p className="mt-1 text-[13px] text-muted-foreground max-w-[280px] leading-relaxed">
        Anything you text from in here will land in this list.
      </p>
    </div>
  );
}

function NotConfiguredState() {
  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 w-9 h-9 rounded-lg bg-foreground/[0.04] flex items-center justify-center shrink-0">
            <MessageCircle
              size={16}
              strokeWidth={1.75}
              className="text-muted-foreground"
            />
          </div>
          <div className="space-y-1.5">
            <p className={BODY}>SMS isn’t set up yet.</p>
            <p className={BODY_MUTED}>
              Add a Telnyx API key and sender number in the workspace
              environment — once those are live, this page becomes your
              outbox.
            </p>
          </div>
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
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  onSent: (phone: string | null) => void;
}) {
  const [to, setTo] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTo('');
    setBody('');
    setErrorMessage(null);
    setSending(false);
  }, [open]);

  const handleSend = useCallback(async () => {
    setSending(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, to, body }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || 'That didn’t go through.');
      }
      onSent(to.trim() || null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'That didn’t go through.');
    } finally {
      setSending(false);
    }
  }, [body, onSent, slug, to]);

  const canSubmit = useMemo(() => {
    if (sending) return false;
    if (!to.trim()) return false;
    if (!body.trim()) return false;
    return true;
  }, [body, sending, to]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-base font-medium text-foreground">
            New text
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="sms-to" className={SECTION_LABEL}>
              To
            </Label>
            <Input
              id="sms-to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="+15551234567"
              disabled={sending}
            />
            <p className={CAPTION}>
              Must match a saved contact’s phone — add the person first if
              they’re new.
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="sms-body" className={SECTION_LABEL}>
              Message
            </Label>
            <Textarea
              id="sms-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your text…"
              rows={5}
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
