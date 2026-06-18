/**
 * Shared helpers for the offer-drafting tools (`draft_offer`,
 * `draft_counter_offer`, `draft_contingency`).
 *
 * These tools all produce REVIEWABLE drafts through the existing
 * `AgentDraft` pipeline (status='pending', channel='note') tied to a deal.
 * They are talking-points / term summaries the realtor reviews — never
 * auto-sent, never binding contracts. The shared logic here keeps the three
 * tools consistent: money formatting, primary-contact resolution, and the
 * draft expiry window (matching the Python `draft_message` 7-day default).
 */

import { supabase } from '@/lib/supabase';

/** Drafts expire after a week if untouched — matches the Python draft path. */
export const DRAFT_EXPIRY_DAYS = 7;

/** USD, whole dollars. Empty string for null so callers can inline it. */
export function fmtMoney(v: number | null | undefined): string {
  if (v == null) return '';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(v);
}

/**
 * Best-effort primary contact for a deal, so the draft links back to the
 * person it concerns and shows up on their timeline. DealContact has no
 * role-priority ordering at the schema level, so we take the first linked
 * contact (same approach as `find_deal`). Returns null when the deal has no
 * linked contact — the AgentDraft.contactId column is nullable.
 *
 * RLS scopes DealContact via the deal/contact rows; callers have already
 * verified the deal belongs to the caller's space before reaching here.
 */
export async function resolvePrimaryContactId(dealId: string): Promise<string | null> {
  const { data } = await supabase
    .from('DealContact')
    .select('contactId')
    .eq('dealId', dealId)
    .limit(1)
    .maybeSingle();
  const row = data as { contactId?: string } | null;
  return row?.contactId ?? null;
}
