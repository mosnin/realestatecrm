'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, X, Trash2, Clock } from 'lucide-react';
import {
  SurfaceCard,
  SurfaceCardHeader,
  StatusPill,
} from '@/components/ui/surface-card';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/formatting';
import { cn } from '@/lib/utils';
import { BODY_MUTED, CAPTION } from '@/lib/typography';
import { Reveal, StaggerReveal, AnimatedNumber } from '@/components/motion';

// ── Types ────────────────────────────────────────────────────────────────
//
// Mirrors lib/offers.ts's Offer/OfferStatus. That module is `server-only`
// and can't be imported into this client component, so the shape is kept
// here — same pattern as app/s/[slug]/reviews/reviews-client.tsx's local
// ReviewRow/ReviewStatus. Keep in sync with lib/offers.ts if either changes.

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

// Must mirror OFFER_TRANSITIONS in lib/offers.ts exactly — the server is the
// real enforcement (illegal moves 409 there regardless), this copy only
// drives which pills the UI offers so a click never round-trips to a move
// the server would reject.
const OFFER_TRANSITIONS: Record<OfferStatus, readonly OfferStatus[]> = {
  draft: ['submitted', 'withdrawn'],
  submitted: ['countered', 'accepted', 'rejected', 'withdrawn', 'expired'],
  countered: ['accepted', 'rejected', 'withdrawn', 'expired', 'countered'],
  accepted: [],
  rejected: [],
  withdrawn: [],
  expired: [],
};

export interface OfferRow {
  id: string;
  spaceId: string;
  dealId: string | null;
  propertyAddress: string | null;
  buyerName: string;
  amount: number | null;
  status: OfferStatus;
  expiresAt: string | null;
  terms: Record<string, unknown>;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  slug: string;
  initialOffers: OfferRow[];
}

// ── Helpers ──────────────────────────────────────────────────────────────

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

const TERMINAL_STATUSES: ReadonlySet<OfferStatus> = new Set(['accepted', 'rejected', 'withdrawn', 'expired']);

const EXPIRING_SOON_MS = 48 * 60 * 60 * 1000;

export function expiryReadout(expiresAt: string | null, status: OfferStatus): { text: string; tone: 'overdue' | 'soon' | 'normal' } | null {
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
  if (diff <= EXPIRING_SOON_MS) {
    const hours = Math.max(1, Math.round(diff / (60 * 60 * 1000)));
    return { text: `Expires in ${hours}h`, tone: 'soon' };
  }
  return { text: `Expires ${dateStr}`, tone: 'normal' };
}

// ── Component ────────────────────────────────────────────────────────────

export function OffersClient({ slug: _slug, initialOffers }: Props) {
  const [offers, setOffers] = useState<OfferRow[]>(initialOffers);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<OfferStatus, OfferRow[]>();
    for (const s of OFFER_STATUSES) map.set(s, []);
    for (const o of offers) {
      const arr = map.get(o.status);
      if (arr) arr.push(o);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return map;
  }, [offers]);

  const hasAny = offers.length > 0;

  async function handleTransition(offer: OfferRow, to: OfferStatus) {
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
      const updated = (await res.json()) as OfferRow;
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

  async function handleDeleteDraft(offer: OfferRow) {
    if (pending.has(offer.id)) return;
    const prev = offers;
    setPending((p) => new Set(p).add(offer.id));
    setOffers((cur) => cur.filter((o) => o.id !== offer.id));

    try {
      const res = await fetch(`/api/offers/${offer.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setOffers(prev);
        toast.error(body.error ?? "Couldn't delete that offer. Try again.");
        return;
      }
      toast.success('Draft removed.');
    } catch {
      setOffers(prev);
      toast.error("Couldn't delete that offer. Try again.");
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(offer.id);
        return next;
      });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className={CAPTION} aria-live="polite">
          {hasAny ? (
            <>
              <AnimatedNumber value={offers.length} /> offer{offers.length === 1 ? '' : 's'} tracked
            </>
          ) : (
            ''
          )}
        </p>
        <button
          type="button"
          onClick={() => setFormOpen((v) => !v)}
          aria-expanded={formOpen}
          className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 h-9 text-sm font-medium text-background transition-all duration-150 motion-reduce:transition-none hover:bg-foreground/90 active:scale-[0.98] motion-reduce:active:scale-100"
        >
          {formOpen ? <X aria-hidden size={14} /> : <Plus aria-hidden size={14} />}
          {formOpen ? 'Cancel' : 'New offer'}
        </button>
      </div>

      {formOpen && (
        <NewOfferForm
          onCancel={() => setFormOpen(false)}
          onCreated={(offer) => {
            setOffers((cur) => [offer, ...cur]);
            setFormOpen(false);
          }}
        />
      )}

      {!hasAny ? (
        <Reveal variant="fade">
          <SurfaceCard>
            <div className="py-10 text-center">
              <p className={BODY_MUTED}>No offers yet.</p>
              <p className={cn(CAPTION, 'mt-1')}>
                Track a buyer&apos;s offer on a listing to see it here.
              </p>
            </div>
          </SurfaceCard>
        </Reveal>
      ) : (
        <StaggerReveal className="flex gap-4 overflow-x-auto pb-2">
          {OFFER_STATUSES.map((status) => {
            const rows = grouped.get(status) ?? [];
            return (
              <div key={status} className="w-80 flex-shrink-0">
                <SurfaceCard className="h-full">
                  <SurfaceCardHeader
                    title={STATUS_LABEL[status]}
                    action={<StatusPill>{rows.length}</StatusPill>}
                  />
                  <div className="mt-4 space-y-3">
                    {rows.length === 0 ? (
                      <p className="py-6 text-center text-xs text-muted-foreground/60">
                        Nothing here
                      </p>
                    ) : (
                      rows.map((offer) => (
                        <OfferCard
                          key={offer.id}
                          offer={offer}
                          pending={pending.has(offer.id)}
                          onTransition={(to) => handleTransition(offer, to)}
                          onDelete={
                            offer.status === 'draft' ? () => handleDeleteDraft(offer) : undefined
                          }
                        />
                      ))
                    )}
                  </div>
                </SurfaceCard>
              </div>
            );
          })}
        </StaggerReveal>
      )}
    </div>
  );
}

// ── Offer card ───────────────────────────────────────────────────────────

function OfferCard({
  offer,
  pending,
  onTransition,
  onDelete,
}: {
  offer: OfferRow;
  pending: boolean;
  onTransition: (to: OfferStatus) => void;
  onDelete?: () => void;
}) {
  const expiry = expiryReadout(offer.expiresAt, offer.status);
  const nextMoves = OFFER_TRANSITIONS[offer.status];

  return (
    <div
      className={cn(
        'rounded-2xl border border-border bg-background/60 p-3.5 transition-opacity',
        pending && 'opacity-60',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{offer.buyerName}</p>
          {offer.propertyAddress && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {offer.propertyAddress}
            </p>
          )}
        </div>
        {onDelete && !pending && (
          <button
            type="button"
            onClick={onDelete}
            title="Delete draft"
            aria-label="Delete draft offer"
            className="h-6 w-6 flex-shrink-0 flex items-center justify-center rounded-md text-muted-foreground/60 hover:bg-foreground/[0.06] hover:text-foreground transition-colors"
          >
            <Trash2 aria-hidden size={12} />
          </button>
        )}
      </div>

      {offer.amount != null && (
        <p className="mt-2 text-lg tracking-tight tabular-nums text-foreground" style={{ fontFamily: 'var(--font-title)' }}>
          {formatCurrency(offer.amount)}
        </p>
      )}

      {expiry && (
        <div
          className={cn(
            'mt-2 inline-flex items-center gap-1 text-[11px] font-medium',
            expiry.tone === 'overdue' && 'text-red-600 dark:text-red-400',
            expiry.tone === 'soon' && 'text-amber-600 dark:text-amber-400',
            expiry.tone === 'normal' && 'text-muted-foreground',
          )}
        >
          <Clock aria-hidden size={11} />
          {expiry.text}
        </div>
      )}

      {offer.notes && (
        <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{offer.notes}</p>
      )}

      {nextMoves.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
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
    </div>
  );
}

// ── New offer form ───────────────────────────────────────────────────────

function NewOfferForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (offer: OfferRow) => void;
}) {
  const [buyerName, setBuyerName] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [notes, setNotes] = useState('');
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
          buyerName: trimmedBuyer,
          propertyAddress: propertyAddress.trim() || null,
          amount: amount.trim() ? Number(amount) : null,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Couldn't create that offer. Try again.");
        setSubmitting(false);
        return;
      }
      const created = (await res.json()) as OfferRow;
      toast.success('Offer added.');
      onCreated(created);
    } catch {
      toast.error("Couldn't create that offer. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <SurfaceCard>
      <SurfaceCardHeader title="New offer" />
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className={CAPTION} htmlFor="offer-buyer">
            Buyer name
          </label>
          <Input
            id="offer-buyer"
            value={buyerName}
            onChange={(e) => setBuyerName(e.target.value)}
            placeholder="Dana Whitfield"
            autoFocus
          />
        </div>
        <div className="space-y-1">
          <label className={CAPTION} htmlFor="offer-address">
            Property address
          </label>
          <Input
            id="offer-address"
            value={propertyAddress}
            onChange={(e) => setPropertyAddress(e.target.value)}
            placeholder="123 Elm St"
          />
        </div>
        <div className="space-y-1">
          <label className={CAPTION} htmlFor="offer-amount">
            Amount
          </label>
          <Input
            id="offer-amount"
            type="number"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="450000"
          />
        </div>
        <div className="space-y-1">
          <label className={CAPTION} htmlFor="offer-expires">
            Expires
          </label>
          <Input
            id="offer-expires"
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <label className={CAPTION} htmlFor="offer-notes">
            Notes
          </label>
          <Input
            id="offer-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Contingent on inspection…"
          />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!buyerName.trim() || submitting}
          className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 h-9 text-sm font-medium text-background transition-all duration-150 motion-reduce:transition-none hover:bg-foreground/90 active:scale-[0.98] motion-reduce:active:scale-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Adding…' : 'Add offer'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 rounded-full px-4 h-9 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors"
        >
          Cancel
        </button>
      </div>
    </SurfaceCard>
  );
}
