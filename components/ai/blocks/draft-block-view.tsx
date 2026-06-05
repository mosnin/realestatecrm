'use client';

import { useState } from 'react';
import { Mail, MessageSquare, StickyNote, Send, X, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DraftBlock } from '@/lib/ai-tools/blocks';

interface DraftBlockViewProps {
  block: DraftBlock;
  className?: string;
}

/**
 * Inline draft card. When Chippi drafts a message, the realtor approves and
 * sends (or discards) it right here in the conversation — no detour to the
 * drafts/inbox tab. Approve / discard both PATCH /api/agent/drafts/{draftId};
 * that endpoint owns the space-ownership check and the delivery (Resend /
 * Telnyx). This card never sends on its own — it calls the one approval path.
 *
 * Calm by design: this is Chippi showing its work and asking for one tap, not
 * a danger gate. Neutral surface, one clear primary action.
 *
 * On-mount status: we trust the persisted `block.status`. There's no
 * single-draft GET endpoint, and the drafts list only returns one status at a
 * time, so we can't cheaply tell "sent" from "dismissed" for a draft actioned
 * elsewhere. Rather than guess, the card reflects the stored status and only
 * advances after an action taken here.
 */

type LocalStatus = 'pending' | 'sending' | 'sent' | 'approved' | 'dismissed';

const CHANNEL_META: Record<DraftBlock['channel'], { icon: typeof Mail; label: string }> = {
  email: { icon: Mail, label: 'Email' },
  sms: { icon: MessageSquare, label: 'SMS' },
  note: { icon: StickyNote, label: 'Note' },
};

export function DraftBlockView({ block, className }: DraftBlockViewProps) {
  // Seed from the persisted status: 'pending' stays interactive, every other
  // stored state is terminal.
  const [status, setStatus] = useState<LocalStatus>(block.status);
  const [error, setError] = useState<string | null>(null);

  const { icon: ChannelIcon, label: channelLabel } = CHANNEL_META[block.channel];
  const isEmail = block.channel === 'email';
  const busy = status === 'sending';
  const settled = status === 'sent' || status === 'approved' || status === 'dismissed';

  async function patch(action: 'approved' | 'dismissed') {
    if (busy || settled) return;
    setError(null);
    setStatus(action === 'approved' ? 'sending' : 'dismissed');
    try {
      const res = await fetch(`/api/agent/drafts/${encodeURIComponent(block.draftId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: action }),
      });
      if (!res.ok) {
        let message = action === 'approved' ? 'Could not send that draft.' : 'Could not discard that draft.';
        try {
          const body = (await res.json()) as { error?: string };
          if (body?.error) message = body.error;
        } catch {
          /* non-JSON body */
        }
        // 409 means it was already actioned elsewhere — reflect that calmly.
        if (res.status === 409) {
          setStatus(action === 'approved' ? 'sent' : 'dismissed');
          setError(message);
          return;
        }
        setStatus('pending');
        setError(message);
        return;
      }
      if (action === 'dismissed') {
        setStatus('dismissed');
        return;
      }
      // Approved: the endpoint returns the updated draft plus a deliveryResult.
      // sent=true → delivered; sent=false → reviewed but delivery unconfigured.
      let delivered = true;
      try {
        const body = (await res.json()) as { deliveryResult?: { sent?: boolean } };
        delivered = body?.deliveryResult?.sent !== false;
      } catch {
        /* default to sent */
      }
      setStatus(delivered ? 'sent' : 'approved');
    } catch {
      setStatus('pending');
      setError('Network hiccup. Try that again.');
    }
  }

  const statusLine =
    status === 'sending'
      ? 'Sending…'
      : status === 'sent'
        ? 'Sent'
        : status === 'approved'
          ? 'Approved'
          : status === 'dismissed'
            ? 'Discarded'
            : null;

  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card px-4 py-3',
        settled && 'opacity-90',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 text-muted-foreground">
          <ChannelIcon size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">
            {channelLabel} draft — review and send
          </p>
          <p className="text-sm font-semibold text-foreground">To {block.recipientName}</p>

          <div className="mt-2.5 rounded-md border border-border bg-background/60 px-2.5 py-2 text-[12px]">
            {isEmail && (
              <div className="mb-1">
                <span className="text-muted-foreground font-medium">Subject:</span>{' '}
                {block.subject || '—'}
              </div>
            )}
            <p className="whitespace-pre-wrap text-foreground/90 leading-relaxed">
              {block.preview}
            </p>
          </div>

          {error && (
            <p className="mt-2 text-[11px] text-rose-600 dark:text-rose-400">{error}</p>
          )}

          {/* Actions — or the settled status line once the realtor decided. */}
          {settled ? (
            <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              {status === 'dismissed' ? <X size={12} /> : <Check size={12} />}
              {statusLine}
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => patch('approved')}
                disabled={busy}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md bg-foreground text-background px-3 py-2.5 min-h-[44px] text-xs font-semibold transition-all',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                {busy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                {busy ? 'Sending…' : 'Approve & send'}
              </button>
              <button
                type="button"
                onClick={() => patch('dismissed')}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-background hover:bg-foreground/[0.04] px-3 py-2.5 min-h-[44px] text-xs font-semibold text-muted-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X size={12} />
                Discard
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
