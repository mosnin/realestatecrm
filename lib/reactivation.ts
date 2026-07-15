/**
 * Past-Client Reactivation & Referral Engine.
 *
 * Solo realtors sit on a goldmine of closed past clients they never follow up
 * with. `computeReactivations(spaceId)` surfaces the dormant ones worth a
 * touch today — someone whose deal closed a while ago and who has gone quiet —
 * ranked so the highest-value, still-warm relationships sit at the top. The
 * daily Brief renders the list with a one-tap way to reach out.
 *
 * `topReferrers(spaceId)` ranks contacts by how many other contacts they
 * referred (Contact.referredByContactId, added by the referral_tracking
 * migration) so a realtor can see who their best advocates are.
 *
 * Shape mirrors lib/deals/next-move.ts: a pure-ish compute function that takes
 * a spaceId, fans out a few small SCOPED reads, and returns a typed, ranked
 * list. Every Supabase query is scoped with `.eq('spaceId', spaceId)` — the
 * service-role key bypasses RLS, so that filter IS the tenant boundary. The
 * result is honest: an empty array when nothing qualifies. No number here is
 * fabricated — every field is computed from a real stored row.
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

const MS_PER_DAY = 86_400_000;
const MS_PER_MONTH = MS_PER_DAY * 30;

/** A deal must have closed at least this many months ago to count as a
 *  reactivation candidate — long enough that a check-in feels warranted, not
 *  a still-active post-close relationship. */
const DEFAULT_DORMANT_MONTHS = 6;
/** …and the contact must have had no logged touch in at least this many days.
 *  A recent call/email/note means the realtor is already on it. */
const DEFAULT_QUIET_DAYS = 90;
/** Short list — the Brief cell stays glanceable. */
const DEFAULT_LIMIT = 5;
/** Bound the won-deal scan so a huge book of business can't blow the budget. */
const WON_DEAL_SCAN_CAP = 500;
/** Top-referrers list length for the Brief. */
const TOP_REFERRERS_LIMIT = 3;

export interface ReactivationOptions {
  now?: Date;
  /** Deals must have closed at least this many months ago. */
  dormantMonths?: number;
  /** Contact must have no touch in at least this many days. */
  quietDays?: number;
  /** Max rows returned. */
  limit?: number;
}

/**
 * One dormant past client worth reaching out to. `id` is the Contact id so the
 * Brief cell can deep-link to `/s/[slug]/contacts/[id]`.
 */
export interface Reactivation {
  id: string;
  name: string | null;
  /** ISO timestamp of the deal's close (Deal.closedAt) — the anchor date. */
  lastClosedAt: string;
  /** Whole months since the deal closed. */
  monthsSince: number;
  /** Final sale value of the closed deal, or null when none was recorded. */
  dealValue: number | null;
  /** Days since the last logged touch, or null when none was ever logged. */
  daysSinceTouch: number | null;
  /** Human, fact-derived one-liner for the cell (no invented claims). */
  reason: string;
}

/** A contact ranked by how many other contacts named them as the referrer. */
export interface Referrer {
  id: string;
  name: string | null;
  referralCount: number;
}

interface WonDealRow {
  id: string;
  contactId: string | null;
  value: number | null;
  closedAt: string | null;
}

interface ContactRow {
  id: string;
  name: string | null;
  lastContactedAt: string | null;
  brokerageId: string | null;
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY);
}

/**
 * Fact-derived reason line. Uses only computed facts — months since close and
 * days since the last logged touch — never an invented claim about the client.
 */
function reactivationReason(monthsSince: number, daysSinceTouch: number | null): string {
  const closed = `Closed ${monthsSince}mo ago`;
  if (daysSinceTouch == null) return `${closed} · no follow-up logged`;
  return `${closed} · ${daysSinceTouch}d since last touch`;
}

/**
 * Dormant past clients worth reaching out to, ranked. Empty when none qualify.
 *
 * A candidate is a contact tied to a WON deal that closed ≥ dormantMonths ago
 * AND who has had no logged touch (lastContactedAt or ContactActivity) in the
 * last quietDays. Ranking: highest deal value first (biggest relationship),
 * most-recently-closed as the tiebreak (still-warm before cold).
 *
 * Tenant scoping: every read below carries `.eq('spaceId', spaceId)` — the
 * service-role client bypasses RLS, so the filter is the security boundary.
 * The Contact read re-asserts the space rather than trusting the deal join.
 */
export async function computeReactivations(
  spaceId: string,
  opts: ReactivationOptions = {},
): Promise<Reactivation[]> {
  const now = opts.now ?? new Date();
  const dormantMonths = opts.dormantMonths ?? DEFAULT_DORMANT_MONTHS;
  const quietDays = opts.quietDays ?? DEFAULT_QUIET_DAYS;
  const limit = opts.limit ?? DEFAULT_LIMIT;

  const closedBefore = new Date(now.getTime() - dormantMonths * MS_PER_MONTH).toISOString();
  const quietSince = new Date(now.getTime() - quietDays * MS_PER_DAY).toISOString();

  // ── Won deals closed long enough ago to warrant a check-in ──────────────
  const { data: dealData, error: dealErr } = await supabase
    .from('Deal')
    .select('id, contactId, value, closedAt')
    .eq('spaceId', spaceId)
    .eq('status', 'won')
    .not('contactId', 'is', null)
    .not('closedAt', 'is', null)
    .lte('closedAt', closedBefore)
    .order('closedAt', { ascending: false })
    .limit(WON_DEAL_SCAN_CAP);
  if (dealErr) {
    logger.warn('[reactivation] won-deal scan failed', { spaceId, err: dealErr.message });
    return [];
  }

  // One entry per contact — keep their most valuable closed deal (tiebreak:
  // most recent). A repeat client shows once, at their strongest signal.
  const bestByContact = new Map<string, WonDealRow>();
  for (const row of (dealData ?? []) as WonDealRow[]) {
    if (!row.contactId || !row.closedAt) continue;
    const prior = bestByContact.get(row.contactId);
    if (!prior) {
      bestByContact.set(row.contactId, row);
      continue;
    }
    const better =
      (row.value ?? 0) > (prior.value ?? 0) ||
      ((row.value ?? 0) === (prior.value ?? 0) &&
        new Date(row.closedAt).getTime() > new Date(prior.closedAt ?? 0).getTime());
    if (better) bestByContact.set(row.contactId, row);
  }
  const contactIds = [...bestByContact.keys()];
  if (contactIds.length === 0) return [];

  // ── Contacts, re-scoped to the tenant; drop brokerage-routed rows ───────
  const { data: contactData, error: contactErr } = await supabase
    .from('Contact')
    .select('id, name, lastContactedAt, brokerageId')
    .in('id', contactIds)
    .eq('spaceId', spaceId)
    .is('brokerageId', null);
  if (contactErr) {
    logger.warn('[reactivation] contact load failed', { spaceId, err: contactErr.message });
    return [];
  }
  const contacts = new Map<string, ContactRow>();
  for (const c of (contactData ?? []) as ContactRow[]) contacts.set(c.id, c);

  // ── Recent touches — any contact with activity in the quiet window is NOT
  //    dormant (the realtor is already on them). One scoped read for all. ──
  const touched = new Set<string>();
  const { data: actData } = await supabase
    .from('ContactActivity')
    .select('contactId')
    .eq('spaceId', spaceId)
    .in('contactId', contactIds)
    .gte('createdAt', quietSince);
  for (const a of (actData ?? []) as Array<{ contactId: string | null }>) {
    if (a.contactId) touched.add(a.contactId);
  }

  // ── Assemble candidates: dormant only ───────────────────────────────────
  const out: Reactivation[] = [];
  for (const [contactId, deal] of bestByContact) {
    const contact = contacts.get(contactId);
    if (!contact) continue; // outside tenant / brokerage-routed / missing
    if (touched.has(contactId)) continue; // recent logged activity → not dormant

    // A recent lastContactedAt is also a touch.
    let daysSinceTouch: number | null = null;
    if (contact.lastContactedAt) {
      const last = new Date(contact.lastContactedAt);
      if (!isNaN(last.getTime())) {
        if (last.getTime() >= new Date(quietSince).getTime()) continue; // touched recently
        daysSinceTouch = Math.max(0, daysBetween(last, now));
      }
    }

    const closed = new Date(deal.closedAt as string);
    if (isNaN(closed.getTime())) continue;
    const monthsSince = Math.max(0, Math.floor(daysBetween(closed, now) / 30));

    out.push({
      id: contactId,
      name: contact.name,
      lastClosedAt: deal.closedAt as string,
      monthsSince,
      dealValue: typeof deal.value === 'number' && !isNaN(deal.value) ? deal.value : null,
      daysSinceTouch,
      reason: reactivationReason(monthsSince, daysSinceTouch),
    });
  }

  // Rank: biggest relationship first, most-recently-closed as the tiebreak.
  out.sort((a, b) => {
    const va = a.dealValue ?? 0;
    const vb = b.dealValue ?? 0;
    if (vb !== va) return vb - va;
    return new Date(b.lastClosedAt).getTime() - new Date(a.lastClosedAt).getTime();
  });

  return out.slice(0, limit);
}

/**
 * Contacts ranked by how many other contacts named them as their referrer
 * (Contact.referredByContactId). Empty when no referrals are recorded — and,
 * until the referral_tracking migration is applied, the column read fails and
 * the caller's `.catch` yields []. Honest either way: no referrals, no list.
 *
 * Tenant scoping: both reads carry `.eq('spaceId', spaceId)`.
 */
export async function topReferrers(
  spaceId: string,
  opts: { limit?: number } = {},
): Promise<Referrer[]> {
  const limit = opts.limit ?? TOP_REFERRERS_LIMIT;

  const { data: refData, error } = await supabase
    .from('Contact')
    .select('referredByContactId')
    .eq('spaceId', spaceId)
    .not('referredByContactId', 'is', null);
  if (error) {
    logger.warn('[reactivation] referral scan failed', { spaceId, err: error.message });
    return [];
  }

  const counts = new Map<string, number>();
  for (const r of (refData ?? []) as Array<{ referredByContactId: string | null }>) {
    const id = r.referredByContactId;
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  if (counts.size === 0) return [];

  const referrerIds = [...counts.keys()];
  const { data: nameData, error: nameErr } = await supabase
    .from('Contact')
    .select('id, name')
    .in('id', referrerIds)
    .eq('spaceId', spaceId);
  if (nameErr) {
    logger.warn('[reactivation] referrer name load failed', { spaceId, err: nameErr.message });
    return [];
  }
  const names = new Map<string, string | null>();
  for (const c of (nameData ?? []) as Array<{ id: string; name: string | null }>) {
    names.set(c.id, c.name);
  }

  const out: Referrer[] = referrerIds
    // Only referrers that still exist in THIS space (the name read re-scoped).
    .filter((id) => names.has(id))
    .map((id) => ({ id, name: names.get(id) ?? null, referralCount: counts.get(id) ?? 0 }));

  out.sort((a, b) => b.referralCount - a.referralCount);
  return out.slice(0, limit);
}
