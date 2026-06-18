/**
 * Atomic tour-insert primitive.
 *
 * The ONE seam every code path that creates a Tour row must go through, so
 * the conflict check + insert stays a single transaction with row-level
 * locking and nobody can double-book a slot.
 *
 * Why a helper instead of inlining `supabase.rpc('book_tour_atomic', …)`:
 * the public booking endpoint (`/api/tours/book`) and the agent tool
 * (`schedule_tour`) both need the same atomic insert. Before this helper
 * existed the tool inserted directly into `Tour`, BYPASSING the conflict
 * check the endpoint relied on — two agents (or an agent + a guest) could
 * land overlapping tours in the same room at the same time. One seam, one
 * conflict rule, one bug surface.
 *
 * The actual locking lives in the `book_tour_atomic` Postgres function
 * (supabase/migrations/20260322000000_atomic_operations.sql, params later
 * widened to TEXT). This helper is the thin TS wrapper: it generates the
 * id + manage token, calls the RPC, and maps the result to a small
 * discriminated union so callers don't each re-interpret "null means
 * conflict".
 */

import crypto from 'crypto';
import { supabase } from '@/lib/supabase';

export interface BookTourInput {
  spaceId: string;
  contactId: string | null;
  guestName: string;
  guestEmail: string;
  guestPhone: string | null;
  propertyAddress: string | null;
  notes: string | null;
  /** ISO 8601. */
  startsAt: string;
  /** ISO 8601. Must be > startsAt. */
  endsAt: string;
  propertyProfileId?: string | null;
  /** Pre-generated manage token. When omitted a 256-bit token is minted. */
  manageToken?: string;
  /** Pre-generated Tour id. When omitted a uuid is minted. */
  id?: string;
}

export type BookTourResult =
  /** Insert landed. `tourId`/`manageToken` are the values written. */
  | { ok: true; tourId: string; manageToken: string }
  /** The DB function found an overlapping scheduled/confirmed tour. */
  | { ok: false; reason: 'conflict' }
  /** The RPC itself errored (network, types, etc.). `error` is the cause. */
  | { ok: false; reason: 'error'; error: unknown };

/** Mint a cryptographically secure 256-bit manage token (hex). */
export function generateManageToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Insert a Tour via the atomic conflict-checked DB function. Never inserts
 * into `Tour` directly — that's the whole point.
 *
 * Returns a discriminated result rather than throwing on conflict, because
 * "the slot is taken" is an expected outcome both callers handle (409 for
 * the endpoint, a friendly tool message for the agent). A genuine RPC error
 * is surfaced via `{ ok: false, reason: 'error' }` so the caller decides
 * whether to throw (endpoint) or degrade (tool).
 */
export async function bookTourAtomic(input: BookTourInput): Promise<BookTourResult> {
  const tourId = input.id ?? crypto.randomUUID();
  const manageToken = input.manageToken ?? generateManageToken();

  const { data: bookedId, error } = await supabase.rpc('book_tour_atomic', {
    p_id: tourId,
    p_space_id: input.spaceId,
    p_contact_id: input.contactId,
    p_guest_name: input.guestName,
    p_guest_email: input.guestEmail,
    p_guest_phone: input.guestPhone,
    p_property_address: input.propertyAddress,
    p_notes: input.notes,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_property_profile_id: input.propertyProfileId ?? null,
    p_manage_token: manageToken,
  });

  if (error) return { ok: false, reason: 'error', error };
  // NULL return means a conflicting tour was found (see the RPC body).
  if (!bookedId) return { ok: false, reason: 'conflict' };

  return { ok: true, tourId, manageToken };
}
