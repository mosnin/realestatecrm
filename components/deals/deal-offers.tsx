'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Plus, X, Clock } from 'lucide-react';
import { SurfaceCard, SurfaceCardHeader, StatusPill } from '@/components/ui/surface-card';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/formatting';
import { cn } from '@/lib/utils';
import { BODY_MUTED, CAPTION } from '@/lib/typography';

/**
 * Deal-scoped Offers section for the deal detail page (Track 18, extending
 * the offer tracker shipped in #554: lib/offers.ts, /offers board).
 *
 * Reuses the same status machine and API surface as
 * app/s/[slug]/offers/offers-client.tsx — the transition endpoint
 * (POST /api/offers/[id]/transition) and creation endpoint (POST
 * /api/offers, with `dealId` pre-filled here) are the SAME routes the full
 * board uses, so nothing about the offer lifecycle is duplicated, only the
 * status/label maps needed to render it. lib/offers.ts is `server-only` and
 * can't be imported into a client component, so those maps are mirrored
 * here — same pattern already used in offers-client.tsx. Keep in sync with
 * lib/offers.ts / offers-client.tsx if the state machine ever changes.
 */

export const OFFER_STATUSES = [
  'draft',
  'submitted',
  'countered',
  'accepted',
  'rejected',
  'withdrawn',
  'expired',
] as const;

export type OfferStatus = (typeof OFFER_STATUSES)[number];

const OFFER_TRANSITIONS: Record<OfferStatus, readonly OfferStatus[]> = {
  draft: ['submitted', 'withdrawn'],
  submitted: ['countered', 'accepted', 'rejected', 'withdrawn', 'expired'],
  countered: ['accepted', 'rejected', 'withdrawn', 'expired', 'countered'],
  accepted: [],
  rejected: [],
  withdrawn: [],
  expired: [],
};

export interface DealOfferRow {
  id: string;
  spaceId: string;
  dealId: string | null;
  propertyAddress: string | null;
  buyerName: string;
  amount: number | null;
  status: OfferStatus;
  expiresAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_LABEL: Record<OfferStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  countered: 'Countered',
  accepted: 'Accepted',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  expired: 'Expired',
};

const TRANSITION_LABEL: Record<OfferStatus, string> = {
  draft: 'Back to draft',
  submitted: 'Submit',
  countered: 'Counter',
  accepted: 'Accept',
  rejected: 'Reject',
  withdrawn: 'Withdraw',
  expired: 'Mark expired',
};

const TERMINAL_STATUSES: ReadonlySet<OfferStatus> = new Set([
  'accepted',
  'rejected',
  'withdrawn',
  'expired',
]);

export function expiryReadout(
  expiresAt: string | null,
  status: OfferStatus,
): { text: string; tone: 'overdue' | 'soon' | 'normal' } | null {
  if (!expiresAt) return null;
  const ts = new Date(expiresAt).getTime();
  if (Number.isNaN(ts)) return null;
  const now = Date.now();
  const diff = ts - now;
  const dateStr = new Date(expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  if (TERMINAL_STATUSES.has(status)) {
    return { text: `Expired ${dateStr}`, tone: 'normal' };
  }
  if (diff <= 0) {
    return { text: `Overdue — ${dateStr}`, tone: 'overdue' };
  }
  const EXPIRING_SOON_MS = 48 * 60 * 60 * 1000;
  if (diff <= EXPIRING_SOON_MS) {
    const hours = Math.max(1, Math.round(diff / (60 * 60 * 1000)));
    return { text: `Expires in ${hours}h`, tone: 'soon' };
  }
  return { text: `Expires ${dateStr}`, tone: 'normal' };
}

interface Props {
  dealId: string;
  slug: string;
  initialOffers: DealOfferRow[];
  /** Prefills the new-offer form's property address (the deal's own address). */
  defaultPropertyAddress?: string | null;
}

export function DealOffers({ dealId, slug, initialOffers, defaultPropertyAddress = null }: Props) {
  const [offers, setOffers] = useState<DealOfferRow[]>(initialOffers);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);

  async function handleTransition(offer: DealOfferRow, to: OfferStatus) {
    if (pending.has(offer.id)) return;
    const prev = offers;
    setPending((p) => new Set(p).add(offer.id));
    setOffers((cur) => cur.map((o) => (o.id === offer.id ? { ...o, status: to } : o)));

    try {
      const res = await fetch(`/api/offers/${offer.id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setOffers(prev);
        toast.error(body.error ?? "Couldn't update that offer. Try again.");
        return;
      }
      const updated = (await res.json()) as DealOfferRow;
      setOffers((cur) => cur.map((o) => (o.id === offer.id ? updated : o)));
      toast.success(`Offer moved to ${STATUS_LABEL[to].toLowerCase()}.`);
    } catch {
      setOffers(prev);
      toast.error("Couldn't update that offer. Try again.");
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(offer.id);
        return next;
      });
    }
  }

  const hasAny = offers.length > 0;

  return (
    <SurfaceCard>
      <SurfaceCardHeader
        title="Offers"
        action={
          <div className="flex items-center gap-3">
            <Link
              href={`/s/${slug}/offers`}
              className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              View all
            </Link>
            <button
              type="button"
              onClick={() => setFormOpen((v) => !v)}
              aria-expanded={formOpen}
              className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-3.5 h-8 text-xs font-medium text-background transition-all duration-150 motion-reduce:transition-none hover:bg-foreground/90 active:scale-[0.98] motion-reduce:active:scale-100"
            >
              {formOpen ? <X aria-hidden size={13} /> : <Plus aria-hidden size={13} />}
              {formOpen ? 'Cancel' : 'New offer on this deal'}
            </button>
          </div>
        }
      />

      {formOpen && (
        <div className="mt-4">
          <NewDealOfferForm
            dealId={dealId}
            defaultPropertyAddress={defaultPropertyAddress}
            onCancel={() => setFormOpen(false)}
            onCreated={(offer) => {
              setOffers((cur) => [offer, ...cur]);
              setFormOpen(false);
            }}
          />
        </div>
      )}

      {!hasAny ? (
        <p className={cn(BODY_MUTED, 'mt-4')}>No offers on this deal yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border/60">
          {offers.map((offer) => (
            <DealOfferItem
              key={offer.id}
              offer={offer}
              pending={pending.has(offer.id)}
              onTransition={(to) => handleTransition(offer, to)}
            />
          ))}
        </ul>
      )}
    </SurfaceCard>
  );
}

function DealOfferItem({
  offer,
  pending,
  onTransition,
}: {
  offer: DealOfferRow;
  pending: boolean;
  onTransition: (to: OfferStatus) => void;
}) {
  const expiry = expiryReadout(offer.expiresAt, offer.status);
  const nextMoves = OFFER_TRANSITIONS[offer.status];

  return (
    <li className={cn('py-3 transition-opacity', pending && 'opacity-60')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{offer.buyerName}</p>
          {offer.propertyAddress && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{offer.propertyAddress}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {offer.amount != null && (
            <span className="text-sm tabular-nums font-medium text-foreground">
              {formatCurrency(offer.amount)}
            </span>
          )}
          <StatusPill>{STATUS_LABEL[offer.status]}</StatusPill>
        </div>
      </div>

      {expiry && (
        <div
          className={cn(
            'mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium',
            expiry.tone === 'overdue' && 'text-red-600 dark:text-red-400',
            expiry.tone === 'soon' && 'text-amber-600 dark:text-amber-400',
            expiry.tone === 'normal' && 'text-muted-foreground',
          )}
        >
          <Clock aria-hidden size={11} />
          {expiry.text}
        </div>
      )}

      {nextMoves.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {nextMoves.map((to) => (
            <button
              key={to}
              type="button"
              disabled={pending}
              onClick={() => onTransition(to)}
              className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-foreground/80 hover:bg-foreground/[0.08] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {TRANSITION_LABEL[to]}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

function NewDealOfferForm({
  dealId,
  defaultPropertyAddress,
  onCancel,
  onCreated,
}: {
  dealId: string;
  defaultPropertyAddress: string | null;
  onCancel: () => void;
  onCreated: (offer: DealOfferRow) => void;
}) {
  const [buyerName, setBuyerName] = useState('');
  const [propertyAddress, setPropertyAddress] = useState(defaultPropertyAddress ?? '');
  const [amount, setAmount] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const trimmedBuyer = buyerName.trim();
    if (!trimmedBuyer || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dealId,
          buyerName: trimmedBuyer,
          propertyAddress: propertyAddress.trim() || null,
          amount: amount.trim() ? Number(amount) : null,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Couldn't create that offer. Try again.");
        setSubmitting(false);
        return;
      }
      const created = (await res.json()) as DealOfferRow;
      toast.success('Offer added.');
      onCreated(created);
    } catch {
      toast.error("Couldn't create that offer. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className={CAPTION} htmlFor="deal-offer-buyer">
            Buyer name
          </label>
          <Input
            id="deal-offer-buyer"
            value={buyerName}
            onChange={(e) => setBuyerName(e.target.value)}
            placeholder="Dana Whitfield"
            autoFocus
          />
        </div>
        <div className="space-y-1">
          <label className={CAPTION} htmlFor="deal-offer-address">
            Property address
          </label>
          <Input
            id="deal-offer-address"
            value={propertyAddress}
            onChange={(e) => setPropertyAddress(e.target.value)}
            placeholder="123 Elm St"
          />
        </div>
        <div className="space-y-1">
          <label className={CAPTION} htmlFor="deal-offer-amount">
            Amount
          </label>
          <Input
            id="deal-offer-amount"
            type="number"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="450000"
          />
        </div>
        <div className="space-y-1">
          <label className={CAPTION} htmlFor="deal-offer-expires">
            Expires
          </label>
          <Input
            id="deal-offer-expires"
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!buyerName.trim() || submitting}
          className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 h-8 text-xs font-medium text-background transition-all duration-150 motion-reduce:transition-none hover:bg-foreground/90 active:scale-[0.98] motion-reduce:active:scale-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Adding…' : 'Add offer'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 rounded-full px-4 h-8 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
