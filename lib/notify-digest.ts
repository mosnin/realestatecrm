/**
 * Notification digest batching.
 *
 * The per-event dispatcher (lib/notify.ts) fires an email the instant a lead /
 * tour / deal lands. A realtor who opts into a DAILY or WEEKLY digest instead
 * gets ONE roll-up email per period — and the per-event email for the covered
 * types is suppressed (see lib/notify-prefs.isEmailDigestSuppressed).
 *
 * This module is the batching engine the digest cron drives. It is split out so
 * the window math + event gathering + section building are unit-testable
 * without the cron's auth/lock plumbing.
 *
 * What counts as a "notable event" mirrors the per-event sends:
 *   - new leads        → Contacts tagged 'new-lead' created in the window
 *   - tour bookings    → Tours created in the window
 *   - new deals        → Deals created in the window
 *
 * Each section is only included when the target's effective prefs still want
 * that event type — a type they've turned off is omitted, exactly as the
 * per-event path would never have sent it.
 *
 * Follow-ups are intentionally NOT part of the digest: they already have their
 * own dedicated daily digest cron (app/api/cron/follow-up-reminders), so
 * rolling them up here would double-send.
 */

import { supabase } from '@/lib/supabase';
import type { DigestSection } from '@/lib/email';
import type { EffectiveEventTypes } from '@/lib/notify-prefs';

/** How far back a cadence looks when collecting events. */
export function windowMsForCadence(cadence: 'daily' | 'weekly'): number {
  return cadence === 'weekly' ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
}

/** Compute the [since, until] window for a digest run ending at `now`. */
export function digestWindow(
  now: Date,
  cadence: 'daily' | 'weekly',
): { since: string; until: string } {
  const until = now.toISOString();
  const since = new Date(now.getTime() - windowMsForCadence(cadence)).toISOString();
  return { since, until };
}

/**
 * Compute a CONTIGUOUS [since, until] window for a target, ending at `now`.
 *
 * `since` is anchored to the target's previous digest stamp (`lastDigestAt`) so
 * consecutive runs leave no gap and no overlap — every event lands in exactly
 * one period's digest, regardless of how the cron's fire time drifts. On the
 * FIRST send (no stamp) it falls back to a plain `now - window`.
 *
 * The lookback is clamped to at most 2× the cadence window so a stale stamp
 * (e.g. several missed runs, or a long-dormant opt-in being re-enabled) can
 * never produce a giant catch-up digest — at most the last two periods.
 */
export function contiguousWindow(
  now: Date,
  cadence: 'daily' | 'weekly',
  lastDigestAt: string | null,
): { since: string; until: string } {
  const windowMs = windowMsForCadence(cadence);
  const until = now.toISOString();
  const earliest = now.getTime() - 2 * windowMs;
  const fallback = now.getTime() - windowMs;
  const anchor = lastDigestAt ? new Date(lastDigestAt).getTime() : fallback;
  // Clamp into [earliest, fallback]: never look back more than 2 windows, and
  // never produce a zero/negative window if a stamp is somehow in the future.
  const sinceMs = Math.min(Math.max(anchor, earliest), fallback);
  return { since: new Date(sinceMs).toISOString(), until };
}

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

/** Cap per section so a runaway space can't produce a giant email. */
const MAX_ITEMS_PER_SECTION = 25;

/**
 * Gather the notable events for one space within [since, until], building the
 * digest sections the email renderer consumes. Only event types enabled in
 * `eventTypes` are queried + included. Returns an empty array when the target
 * has no notable activity (the caller then sends nothing).
 *
 * Best-effort per query: a failed table read contributes no section rather than
 * aborting the whole digest.
 */
export async function buildDigestSections(
  spaceId: string,
  eventTypes: EffectiveEventTypes,
  since: string,
  until: string,
): Promise<DigestSection[]> {
  const sections: DigestSection[] = [];

  // ── New leads ──────────────────────────────────────────────────────────
  if (eventTypes.newLeads) {
    const { data: leads, error } = await supabase
      .from('Contact')
      .select('id, name, createdAt')
      .eq('spaceId', spaceId)
      .is('brokerageId', null)
      .contains('tags', ['new-lead'])
      .gte('createdAt', since)
      .lte('createdAt', until)
      .order('createdAt', { ascending: false })
      .limit(MAX_ITEMS_PER_SECTION + 1);
    if (!error && leads && leads.length > 0) {
      sections.push({
        label: 'New leads',
        href: '/leads',
        items: capItems(
          leads.map((c) => (c.name as string) || 'Unnamed lead'),
          leads.length,
        ),
      });
    }
  }

  // ── Tour bookings ──────────────────────────────────────────────────────
  if (eventTypes.tourBookings) {
    const { data: tours, error } = await supabase
      .from('Tour')
      .select('id, guestName, startsAt, propertyAddress, createdAt')
      .eq('spaceId', spaceId)
      .gte('createdAt', since)
      .lte('createdAt', until)
      .order('createdAt', { ascending: false })
      .limit(MAX_ITEMS_PER_SECTION + 1);
    if (!error && tours && tours.length > 0) {
      sections.push({
        label: 'Tour bookings',
        href: '/calendar',
        items: capItems(
          tours.map((t) => {
            const when = t.startsAt
              ? new Date(t.startsAt as string).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })
              : '';
            const prop = t.propertyAddress ? ` — ${t.propertyAddress}` : '';
            const name = (t.guestName as string) || 'Guest';
            return when ? `${name} (${when})${prop}` : `${name}${prop}`;
          }),
          tours.length,
        ),
      });
    }
  }

  // ── New deals ──────────────────────────────────────────────────────────
  if (eventTypes.newDeals) {
    const { data: deals, error } = await supabase
      .from('Deal')
      .select('id, title, value, createdAt')
      .eq('spaceId', spaceId)
      .gte('createdAt', since)
      .lte('createdAt', until)
      .order('createdAt', { ascending: false })
      .limit(MAX_ITEMS_PER_SECTION + 1);
    if (!error && deals && deals.length > 0) {
      sections.push({
        label: 'New deals',
        href: '/deals',
        items: capItems(
          deals.map((d) => {
            const title = (d.title as string) || 'Untitled deal';
            return d.value != null ? `${title} — ${fmtCurrency(Number(d.value))}` : title;
          }),
          deals.length,
        ),
      });
    }
  }

  return sections;
}

/**
 * Trim a section's item list to the cap, appending a "+N more" line when the
 * real count exceeded it. `total` is the untruncated count (the query fetched
 * cap+1 to detect overflow).
 */
function capItems(items: string[], total: number): string[] {
  if (total <= MAX_ITEMS_PER_SECTION) return items.slice(0, MAX_ITEMS_PER_SECTION);
  const shown = items.slice(0, MAX_ITEMS_PER_SECTION);
  shown.push(`+${total - MAX_ITEMS_PER_SECTION} more`);
  return shown;
}
