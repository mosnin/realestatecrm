/**
 * Offer lifecycle tracker — CRUD + the legal status state machine for
 * `Offer` rows (supabase/migrations/20260831000000_offers.sql).
 *
 * Tenant scoping: every query below chains `.eq('spaceId', spaceId)` on the
 * service-role client — that `.eq` IS the security boundary (CLAUDE.md). Note
 * `tenantTable()` (lib/tenant-db.ts) isn't used here: its returned builder
 * only exposes a bare `.eq` after `update()`/`select()`, which can't chain
 * `.order()`/`.select()`/a second `.eq()` without unsound `as any` casts, so
 * this file follows the same explicit `.eq('spaceId', …)` pattern already
 * used throughout the neighboring deal routes/libs (e.g.
 * app/api/deals/[id]/checklist/route.ts, app/api/deals/[id]/commission-splits/route.ts).
 *
 * Callers always derive `spaceId` from the authenticated request context
 * (`requireAuth` + `getSpaceForUser`); never accept it from a request body.
 *
 * `transition()` is the ONLY sanctioned way to change `Offer.status` — it
 * enforces OFFER_TRANSITIONS below and always writes a matching `OfferEvent`
 * row, so the board's history timeline can never drift from the offer's
 * actual status changes.
 */
import 'server-only';
import crypto from 'crypto';
import { supabase } from '@/lib/supabase';
import { advanceDealFromEvent } from '@/lib/deals/advance-from-event';
import { logger } from '@/lib/logger';

// ── Types ────────────────────────────────────────────────────────────────

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

export function isOfferStatus(value: unknown): value is OfferStatus {
  return typeof value === 'string' && (OFFER_STATUSES as readonly string[]).includes(value);
}

export interface Offer {
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

export interface OfferEvent {
  id: string;
  offerId: string;
  spaceId: string;
  fromStatus: OfferStatus | null;
  toStatus: OfferStatus;
  note: string | null;
  at: string;
}

export interface CreateOfferInput {
  dealId?: string | null;
  propertyAddress?: string | null;
  buyerName: string;
  amount?: number | null;
  status?: OfferStatus;
  expiresAt?: string | null;
  terms?: Record<string, unknown>;
  notes?: string | null;
}

export interface UpdateOfferInput {
  dealId?: string | null;
  propertyAddress?: string | null;
  buyerName?: string;
  amount?: number | null;
  expiresAt?: string | null;
  terms?: Record<string, unknown>;
  notes?: string | null;
}

// ── State machine ───────────────────────────────────────────────────────
//
// draft      -> submitted, withdrawn
// submitted  -> countered, accepted, rejected, withdrawn, expired
// countered  -> accepted, rejected, withdrawn, expired, countered (re-counter)
// accepted / rejected / withdrawn / expired are terminal — no way out.
//
// The load-bearing rule: 'accepted' is reachable ONLY from 'submitted' or
// 'countered'. A draft can never be accepted directly — it must be submitted
// first, mirroring how an offer actually moves through a transaction.
export const OFFER_TRANSITIONS: Record<OfferStatus, readonly OfferStatus[]> = {
  draft: ['submitted', 'withdrawn'],
  submitted: ['countered', 'accepted', 'rejected', 'withdrawn', 'expired'],
  countered: ['accepted', 'rejected', 'withdrawn', 'expired', 'countered'],
  accepted: [],
  rejected: [],
  withdrawn: [],
  expired: [],
};

export function isLegalOfferTransition(from: OfferStatus, to: OfferStatus): boolean {
  return OFFER_TRANSITIONS[from].includes(to);
}

export class IllegalOfferTransitionError extends Error {
  constructor(
    public readonly from: OfferStatus,
    public readonly to: OfferStatus,
  ) {
    super(`Illegal offer transition: ${from} -> ${to}`);
    this.name = 'IllegalOfferTransitionError';
  }
}

// ── CRUD ─────────────────────────────────────────────────────────────────

export async function listOffers(spaceId: string): Promise<Offer[]> {
  const { data, error } = await supabase
    .from('Offer')
    .select('*')
    .eq('spaceId', spaceId)
    .order('createdAt', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Offer[];
}

/**
 * Offers linked to one deal, scoped to the caller's space. Used by the deal
 * detail page's Offers section (app/s/[slug]/deals/[id]/page.tsx) — every
 * read here chains BOTH `.eq('spaceId', spaceId)` AND `.eq('dealId', dealId)`
 * so a dealId that happens to belong to another tenant's deal can never
 * surface that tenant's offers: the spaceId filter alone already excludes
 * them, the dealId filter just narrows within the caller's own space.
 */
export async function listOffersForDeal(spaceId: string, dealId: string): Promise<Offer[]> {
  const { data, error } = await supabase
    .from('Offer')
    .select('*')
    .eq('spaceId', spaceId)
    .eq('dealId', dealId)
    .order('createdAt', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Offer[];
}

export async function getOffer(spaceId: string, offerId: string): Promise<Offer | null> {
  const { data, error } = await supabase
    .from('Offer')
    .select('*')
    .eq('id', offerId)
    .eq('spaceId', spaceId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as Offer) ?? null;
}

export async function listOfferEvents(spaceId: string, offerId: string): Promise<OfferEvent[]> {
  const { data, error } = await supabase
    .from('OfferEvent')
    .select('*')
    .eq('offerId', offerId)
    .eq('spaceId', spaceId)
    .order('at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as OfferEvent[];
}

export async function createOffer(spaceId: string, input: CreateOfferInput): Promise<Offer> {
  const status = input.status ?? 'draft';
  const id = crypto.randomUUID();

  // If a dealId is supplied, confirm it belongs to THIS space before linking —
  // a caller must not attach an offer to another tenant's deal (the Offer row
  // is always spaceId-scoped, but a foreign dealId would still be a tenant
  // data-integrity leak). Unknown/foreign dealId → drop the link, don't throw.
  let dealId: string | null = null;
  if (input.dealId) {
    const { data: deal } = await supabase
      .from('Deal')
      .select('id')
      .eq('id', input.dealId)
      .eq('spaceId', spaceId)
      .maybeSingle();
    dealId = deal ? input.dealId : null;
  }

  const { data, error } = await supabase
    .from('Offer')
    .insert({
      id,
      spaceId,
      dealId,
      propertyAddress: input.propertyAddress ?? null,
      buyerName: input.buyerName,
      amount: input.amount ?? null,
      status,
      expiresAt: input.expiresAt ?? null,
      terms: input.terms ?? {},
      notes: input.notes ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;

  // Record the creation itself as the first history row (fromStatus null),
  // so the board's timeline always starts at the true beginning.
  const { error: eventError } = await supabase.from('OfferEvent').insert({
    id: crypto.randomUUID(),
    spaceId,
    offerId: id,
    fromStatus: null,
    toStatus: status,
    note: null,
  });
  if (eventError) throw eventError;

  return data as unknown as Offer;
}

export async function updateOffer(
  spaceId: string,
  offerId: string,
  input: UpdateOfferInput,
): Promise<Offer | null> {
  const existing = await getOffer(spaceId, offerId);
  if (!existing) return null;

  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if ('dealId' in input) patch.dealId = input.dealId ?? null;
  if ('propertyAddress' in input) patch.propertyAddress = input.propertyAddress ?? null;
  if ('buyerName' in input && input.buyerName) patch.buyerName = input.buyerName;
  if ('amount' in input) patch.amount = input.amount ?? null;
  if ('expiresAt' in input) patch.expiresAt = input.expiresAt ?? null;
  if ('terms' in input) patch.terms = input.terms ?? {};
  if ('notes' in input) patch.notes = input.notes ?? null;

  const { data, error } = await supabase
    .from('Offer')
    .update(patch)
    .eq('id', offerId)
    .eq('spaceId', spaceId)
    .select('*')
    .single();
  if (error) throw error;
  return data as unknown as Offer;
}

/**
 * Delete an offer (and, via ON DELETE CASCADE, its OfferEvent history).
 * Only legal for 'draft' offers — anything that has left draft has real
 * transaction history that must stay auditable; withdraw it instead.
 * Returns false if the offer doesn't exist in this space, or exists but
 * isn't a draft (caller should surface the appropriate error).
 */
export async function deleteDraftOffer(spaceId: string, offerId: string): Promise<boolean> {
  const existing = await getOffer(spaceId, offerId);
  if (!existing) return false;
  if (existing.status !== 'draft') return false;

  const { error } = await supabase
    .from('Offer')
    .delete()
    .eq('id', offerId)
    .eq('spaceId', spaceId);
  if (error) throw error;
  return true;
}

/**
 * Transition an offer's status, enforcing OFFER_TRANSITIONS, and write the
 * matching OfferEvent row. Throws IllegalOfferTransitionError for a
 * disallowed move. Returns null if the offer doesn't exist in this space
 * (tenant-scoped — a cross-tenant offerId behaves identically to a missing
 * one, never leaking existence).
 */
export async function transition(
  spaceId: string,
  offerId: string,
  to: OfferStatus,
  note?: string | null,
): Promise<Offer | null> {
  const existing = await getOffer(spaceId, offerId);
  if (!existing) return null;

  if (!isLegalOfferTransition(existing.status, to)) {
    throw new IllegalOfferTransitionError(existing.status, to);
  }

  const { data, error } = await supabase
    .from('Offer')
    .update({ status: to, updatedAt: new Date().toISOString() })
    .eq('id', offerId)
    .eq('spaceId', spaceId)
    .select('*')
    .single();
  if (error) throw error;

  const { error: eventError } = await supabase.from('OfferEvent').insert({
    id: crypto.randomUUID(),
    spaceId,
    offerId,
    fromStatus: existing.status,
    toStatus: to,
    note: note ?? null,
  });
  if (eventError) throw eventError;

  if (to === 'accepted' && existing.dealId) {
    try {
      await advanceDealFromEvent({
        spaceId,
        dealId: existing.dealId,
        event: 'offer_accepted',
        title: existing.buyerName,
        address: existing.propertyAddress,
      });
    } catch (err) {
      logger.warn('[offers] pipeline advance failed', { spaceId, offerId, dealId: existing.dealId }, err);
    }
  }

  return data as unknown as Offer;
}
