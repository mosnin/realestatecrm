'use client';

/**
 * /s/[slug]/sms/[id] — one SMS conversation.
 *
 * Paper-flat bubbles, day-grouped by SECTION_LABEL ("TODAY" / "YESTERDAY" /
 * "MAY 30"). Outbound right-aligned; incoming would be left-aligned when
 * inbound lands, but v1 is outbound-only so every bubble is on the right.
 *
 * Sticky send footer at the bottom — same pattern as the chat surface,
 * with mobile bottom-bar clearance baked into the page padding.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';
import { ShimmerText } from '@/components/chippi/shimmer-text';
import { cn } from '@/lib/utils';
import {
  H2,
  BODY_MUTED,
  SECTION_LABEL,
  PRIMARY_PILL,
  CAPTION,
  META,
} from '@/lib/typography';

interface ThreadMessage {
  id: string;
  fromName: string;
  fromAddress: string;
  body: string;
  sentAt: string;
  fromMe: boolean;
}

interface ThreadPayload {
  channel: 'sms';
  contactName: string;
  contactPhone: string;
  messages: ThreadMessage[];
}

interface SmsThreadViewProps {
  slug: string;
  threadId: string;
}

function formatExactTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(d, now)) return 'TODAY';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return 'YESTERDAY';
  return d
    .toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    .toUpperCase();
}

interface GroupedMessages {
  label: string;
  messages: ThreadMessage[];
}

function groupByDay(messages: ThreadMessage[]): GroupedMessages[] {
  const groups: GroupedMessages[] = [];
  let currentLabel = '';
  for (const m of messages) {
    const label = dayLabel(m.sentAt);
    if (label !== currentLabel) {
      groups.push({ label, messages: [m] });
      currentLabel = label;
    } else {
      groups[groups.length - 1].messages.push(m);
    }
  }
  return groups;
}

export function SmsThreadView({ slug, threadId }: SmsThreadViewProps) {
  const [contactName, setContactName] = useState<string>('');
  const [contactPhone, setContactPhone] = useState<string>('');
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const res = await fetch(
          `/api/sms/${encodeURIComponent(threadId)}?slug=${encodeURIComponent(slug)}`,
          { signal },
        );
        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(errBody.error ?? `Could not load (${res.status}).`);
        }
        const data = (await res.json()) as ThreadPayload;
        setContactName(data.contactName);
        setContactPhone(data.contactPhone);
        setMessages(data.messages);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setErrorMessage(
          err instanceof Error ? err.message : 'Could not load this thread.',
        );
      } finally {
        setLoading(false);
      }
    },
    [slug, threadId],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  const groups = useMemo(() => groupByDay(messages), [messages]);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
  }, [groups.length, messages.length]);

  const handleSend = useCallback(async () => {
    if (!body.trim() || !contactPhone) return;
    setSending(true);
    try {
      const res = await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, to: contactPhone, body }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || 'That didn’t go through.');
      }
      setBody('');
      toast('Sent.');
      // Pull the updated thread so the new bubble lands inline.
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'That didn’t go through.');
    } finally {
      setSending(false);
    }
  }, [body, contactPhone, load, slug]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="w-full mx-auto chat-content-wrap pt-10 sm:pt-14 pb-56 md:pb-24 space-y-6 max-w-3xl">
        <header className="space-y-2">
          <Link
            href={`/s/${slug}/sms`}
            className={cn(CAPTION, 'inline-flex items-center gap-1 hover:text-foreground transition-colors')}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All texts
          </Link>
          <div className="flex items-baseline gap-3">
            <h2 className={H2}>{contactName || 'Conversation'}</h2>
            {contactPhone && contactPhone !== contactName && (
              <span className={CAPTION}>{contactPhone}</span>
            )}
          </div>
          <p className={BODY_MUTED}>
            Outgoing SMS only. Replies will land here once inbound is wired.
          </p>
        </header>

        {loading && (
          <ShimmerText
            messages="Pulling this conversation."
            className="block text-sm"
          />
        )}

        {!loading && errorMessage && (
          <p className="text-sm text-muted-foreground">{errorMessage}</p>
        )}

        {!loading && !errorMessage && messages.length === 0 && (
          <p className={BODY_MUTED}>No texts yet to this number.</p>
        )}

        {!loading && !errorMessage && groups.length > 0 && (
          <div className="space-y-6">
            {groups.map((group) => (
              <section key={group.label} className="space-y-3">
                <div className="flex items-center justify-center">
                  <span className={SECTION_LABEL}>{group.label}</span>
                </div>
                <div className="space-y-2">
                  {group.messages.map((m) => (
                    <Bubble key={m.id} message={m} />
                  ))}
                </div>
              </section>
            ))}
            <div ref={bottomRef} aria-hidden />
          </div>
        )}

        {!loading && !errorMessage && (
          <SendFooter
            body={body}
            onBodyChange={setBody}
            onSend={handleSend}
            sending={sending}
            disabled={!contactPhone}
          />
        )}
      </div>
    </div>
  );
}

/* ── Bubble ─────────────────────────────────────────────────────────── */

function Bubble({ message }: { message: ThreadMessage }) {
  // Outgoing right, incoming left. Hairline borders, no shadows — paper-flat.
  const isMe = message.fromMe;
  return (
    <div className={cn('flex', isMe ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-2xl border border-border/70 px-3.5 py-2 space-y-1',
          isMe ? 'bg-foreground/[0.03]' : 'bg-background',
        )}
      >
        <p className="text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">
          {message.body || '(empty)'}
        </p>
        <p className={cn(META, isMe ? 'text-right' : 'text-left')}>
          {formatExactTime(message.sentAt)}
        </p>
      </div>
    </div>
  );
}

/* ── Send footer ───────────────────────────────────────────────────── */

function SendFooter({
  body,
  onBodyChange,
  onSend,
  sending,
  disabled,
}: {
  body: string;
  onBodyChange: (next: string) => void;
  onSend: () => void;
  sending: boolean;
  disabled: boolean;
}) {
  const canSend = !sending && !disabled && body.trim().length > 0;
  return (
    <div className="sticky bottom-24 md:bottom-6 z-10 pt-2">
      <div className="rounded-2xl border border-border/70 bg-background/95 backdrop-blur p-2 flex items-end gap-2">
        <Textarea
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          placeholder="Reply…"
          rows={1}
          disabled={sending || disabled}
          className="resize-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0 min-h-9 max-h-40"
          onKeyDown={(e) => {
            // Cmd/Ctrl+Enter to send. Plain Enter inserts a newline — SMS
            // bodies are short but realtors do paste multi-line content.
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
        />
        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          className={cn(PRIMARY_PILL, 'h-9 disabled:opacity-50')}
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
          <span className="hidden sm:inline">{sending ? 'Sending…' : 'Send'}</span>
        </button>
      </div>
    </div>
  );
}
