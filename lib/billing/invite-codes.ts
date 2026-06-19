/**
 * Invite codes — admin-minted codes that grant a Space FREE access (comp) at a
 * chosen plan, bypassing Stripe. This is NOT a parallel bypass: redeeming a code
 * simply grants the EXISTING complimentary-access mechanism (lib/billing/comp.ts
 * → Space."compAccess"/"compExpiresAt"/"compNote"/"compPlan") on the caller's own
 * Space. The access gate, credit meter, and plan resolver already honor comp.
 *
 * This module owns the pure pieces (code normalization + generation) and the
 * single server entry points (create / list / redeem / deactivate), all going
 * through the service-role supabase client and the atomic Postgres function
 * `redeem_invite_code_atomic` (migration 20260725000000) so a code can never be
 * used past its maxUses under concurrency.
 */

import { supabase } from '@/lib/supabase';
import { PLANS, type PlanId } from '@/lib/plans';

/** The plan an invite code grants by default — the $97/mo self-serve tier. */
export const DEFAULT_INVITE_PLAN: PlanId = 'solo';

/** Outcome of a redemption attempt — the atomic function's return code, plus the
 *  client-side guards (invalid input / infra error) the route layers on. */
export type RedeemResult =
  | 'ok'
  | 'not_found'
  | 'inactive'
  | 'expired'
  | 'exhausted'
  | 'already_redeemed'
  | 'invalid'
  | 'error';

/**
 * Normalize a code to its canonical stored form: trimmed + lowercased so lookups
 * are case-insensitive and the DB UNIQUE constraint can't be sidestepped with
 * casing. Pure — used on BOTH create and redeem so the two can't disagree.
 */
export function normalizeInviteCode(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

// Unambiguous alphabet for auto-generated codes — no 0/O/1/I/l so a code read off
// a screen / said aloud can't be mistyped. Lowercased to match the stored form.
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/**
 * Generate a random, unguessable code. Default length 12 over a 31-char alphabet
 * is ~59 bits of entropy — not feasible to guess, and the redemption path never
 * reveals whether an arbitrary guess matches an existing code beyond a generic
 * "invalid". Uses crypto for uniform, unpredictable draws.
 */
export function generateInviteCode(length = 12): string {
  const n = Math.max(8, Math.min(64, Math.floor(length) || 12));
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < n; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

/** A code row as returned to the admin UI (camelCase, matches the table). */
export interface InviteCodeRow {
  id: string;
  code: string;
  plan: PlanId;
  maxUses: number | null;
  usesCount: number;
  expiresAt: string | null;
  active: boolean;
  compDurationDays: number | null;
  createdByClerkId: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

const INVITE_CODE_COLUMNS =
  'id, code, plan, maxUses, usesCount, expiresAt, active, compDurationDays, createdByClerkId, note, createdAt, updatedAt';

/** List codes for the admin console (newest first). */
export async function listInviteCodes(limit = 200): Promise<InviteCodeRow[]> {
  const { data, error } = await supabase
    .from('InviteCode')
    .select(INVITE_CODE_COLUMNS)
    .order('createdAt', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as InviteCodeRow[];
}

export interface CreateInviteCodeInput {
  /** Raw code; normalized before insert. Empty/omitted → auto-generated. */
  code?: string;
  plan: PlanId;
  maxUses: number | null;
  expiresAt: string | null;
  compDurationDays: number | null;
  note: string | null;
  createdByClerkId: string;
}

/**
 * Insert a new code. Returns the created row, or a typed error string the route
 * maps to a 4xx ('duplicate' on a UNIQUE collision, 'invalid' on a bad plan).
 */
export async function createInviteCode(
  input: CreateInviteCodeInput,
): Promise<{ ok: true; row: InviteCodeRow } | { ok: false; error: 'duplicate' | 'invalid' | 'error' }> {
  if (!(input.plan in PLANS)) return { ok: false, error: 'invalid' };

  const code = normalizeInviteCode(input.code) || generateInviteCode();
  if (!code) return { ok: false, error: 'invalid' };

  const { data, error } = await supabase
    .from('InviteCode')
    .insert({
      code,
      plan: input.plan,
      maxUses: input.maxUses,
      expiresAt: input.expiresAt,
      compDurationDays: input.compDurationDays,
      note: input.note,
      createdByClerkId: input.createdByClerkId,
    })
    .select(INVITE_CODE_COLUMNS)
    .maybeSingle();

  if (error) {
    // 23505 = unique_violation (the normalized code already exists).
    if ((error as { code?: string }).code === '23505') return { ok: false, error: 'duplicate' };
    return { ok: false, error: 'error' };
  }
  if (!data) return { ok: false, error: 'error' };
  return { ok: true, row: data as unknown as InviteCodeRow };
}

/** Flip a code's active flag (deactivate = false). Returns false on DB error. */
export async function setInviteCodeActive(id: string, active: boolean): Promise<boolean> {
  const { error } = await supabase
    .from('InviteCode')
    .update({ active, updatedAt: new Date().toISOString() })
    .eq('id', id);
  return !error;
}

/**
 * Redeem a code for a Space, atomically. The space MUST be one the caller owns —
 * the route resolves it from the authed session and passes it here. Delegates the
 * lock + validate + increment + comp-grant to the Postgres function so the
 * use-count can never exceed maxUses and a space can't redeem the same code twice.
 *
 * Returns the function's status, or 'invalid' for empty input / 'error' for an
 * infrastructure failure. Never throws.
 */
export async function redeemInviteCode(params: {
  code: string;
  spaceId: string;
  userClerkId: string;
}): Promise<RedeemResult> {
  const code = normalizeInviteCode(params.code);
  if (!code || !params.spaceId) return 'invalid';

  try {
    const { data, error } = await supabase.rpc('redeem_invite_code_atomic', {
      p_code: code,
      p_space_id: params.spaceId,
      p_user_clerk_id: params.userClerkId,
    });
    if (error) return 'error';
    const status = (typeof data === 'string' ? data : '') as RedeemResult;
    const known: RedeemResult[] = ['ok', 'not_found', 'inactive', 'expired', 'exhausted', 'already_redeemed'];
    return known.includes(status) ? status : 'error';
  } catch {
    return 'error';
  }
}
