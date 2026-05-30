/**
 * HubSpot signal source — Phase D1.
 *   review/1/0.85 — HS deal closedate ≤7d, matched Chippi Deal not in `closing`.
 *   review/2/0.82 — HS deal stage advanced ≤24h ago, matched Chippi Deal earlier.
 *   reply /2/0.78 — HS Contact created ≤24h ago, no Chippi email match.
 * Trigger lastFiredAt gates the trigger-driven signals. Cross-walk: deals
 * by case-insensitive whole title; contacts by case-insensitive email.
 * 3s timeout per Composio call; on timeout/error/no connection/no Composio
 * configured, return []. The brief is never blocked by an external API.
 */

import { supabase } from '@/lib/supabase';
import { executeToolForEntity, composioConfigured } from '@/lib/integrations/composio';
import { logger } from '@/lib/logger';
import type { Signal, SignalGatherer } from '../types';

const MS_PER_DAY = 86_400_000;
const TIMEOUT_MS = 3000;
const CLOSE_WINDOW_DAYS = 7;
const TRIGGER_WINDOW_MS = MS_PER_DAY;
const STAGE_TRIGGER = 'HUBSPOT_DEAL_STAGE_UPDATED_TRIGGER';
const CONTACT_TRIGGER = 'HUBSPOT_CONTACT_CREATED_TRIGGER';

interface ChippiDeal {
  id: string;
  title: string;
  DealStage: { kind: string | null; name: string } | null;
}
type ChippiContact = { id: string; name: string; email: string | null };

// ── Pure helpers (exported for tests) ──
export function matchDealByTitle<D extends { title: string }>(name: string | null, deals: D[]): D | null {
  const needle = name?.trim().toLowerCase();
  if (!needle) return null;
  return deals.find((d) => d.title.trim().toLowerCase() === needle) ?? null;
}
export function matchContactByEmail<C extends { email: string | null }>(email: string | null, contacts: C[]): C | null {
  const needle = email?.trim().toLowerCase();
  if (!needle) return null;
  return contacts.find((c) => c.email?.trim().toLowerCase() === needle) ?? null;
}
export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.floor((d.getTime() - today.getTime()) / MS_PER_DAY);
}
export function firedRecently(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && Date.now() - t <= TRIGGER_WINDOW_MS;
}
/** Weekday inside the week, today/tomorrow for the close cases. */
export function formatCloseDate(iso: string | null, days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (!iso) return `in ${days} days`;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return `in ${days} days`;
  return days <= 6
    ? d.toLocaleDateString('en-US', { weekday: 'long' })
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
export function describeChippiStage(deal: ChippiDeal): string {
  return deal.DealStage?.name?.trim() || deal.DealStage?.kind || 'open';
}

/** 3s-timed Composio call. Null on timeout / throw / !successful. */
async function call(entityId: string, slug: string, args: Record<string, unknown>): Promise<unknown | null> {
  const timer = new Promise<null>((r) => setTimeout(() => r(null), TIMEOUT_MS));
  try {
    const res = await Promise.race([executeToolForEntity({ entityId, slug, arguments: args }), timer]);
    if (!res) return null;
    if (typeof res === 'object' && (res as { successful?: boolean }).successful === false) return null;
    return res;
  } catch (err) {
    logger.warn('[briefing.hubspot] composio call failed', { slug, err: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/** Lift HubSpot's `{ results: [{ id, properties: {...} }] }` to flat rows. */
function rows(resp: unknown): Array<{ id: string; props: Record<string, unknown> }> {
  if (!resp || typeof resp !== 'object') return [];
  const d = (resp as { data?: unknown }).data ?? resp;
  if (!d || typeof d !== 'object') return [];
  const list =
    (d as { results?: unknown }).results ??
    (d as { items?: unknown }).items ??
    (d as { data?: unknown }).data;
  if (!Array.isArray(list)) return [];
  return list
    .map((row) => {
      const r = row as Record<string, unknown>;
      return { id: String(r.id ?? ''), props: (r.properties as Record<string, unknown> | undefined) ?? r };
    })
    .filter((r) => r.id.length > 0);
}

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim().length > 0 ? v : null;

export const hubspotSource: SignalGatherer = {
  source: 'hubspot',
  async gather(spaceId: string): Promise<Signal[]> {
    if (!composioConfigured()) return [];

    const { data: connData } = await supabase
      .from('IntegrationConnection')
      .select('id, userId')
      .eq('spaceId', spaceId).eq('toolkit', 'hubspot').eq('status', 'active')
      .maybeSingle();
    const connection = connData as { id: string; userId: string } | null;
    if (!connection) return [];

    // lastFiredAt = free freshness cache. Contact trigger gates the
    // contact-list fetch; deal-list always polls (closedate is trigger-free).
    const { data: trigData } = await supabase
      .from('IntegrationTrigger')
      .select('triggerSlug, lastFiredAt')
      .eq('connectionId', connection.id).eq('status', 'active');
    const triggers = new Map<string, string | null>();
    for (const r of (trigData ?? []) as Array<{ triggerSlug: string; lastFiredAt: string | null }>) {
      triggers.set(r.triggerSlug, r.lastFiredAt);
    }
    const stageFired = firedRecently(triggers.get(STAGE_TRIGGER));
    const contactFired = firedRecently(triggers.get(CONTACT_TRIGGER));

    const [dealsResult, contactsResult, dealResp, contactResp] = await Promise.all([
      supabase.from('Deal').select('id, title, DealStage:stageId(kind, name)')
        .eq('spaceId', spaceId).eq('status', 'active'),
      supabase.from('Contact').select('id, name, email')
        .eq('spaceId', spaceId).not('email', 'is', null),
      call(connection.userId, 'HUBSPOT_DEAL_LIST', {
        properties: ['dealname', 'dealstage', 'closedate'], limit: 100,
      }),
      contactFired
        ? call(connection.userId, 'HUBSPOT_CONTACT_LIST', {
            properties: ['email', 'firstname', 'lastname'], limit: 100,
          })
        : Promise.resolve(null),
    ]);

    const chippiDeals = (dealsResult.data ?? []) as unknown as ChippiDeal[];
    const chippiContacts = (contactsResult.data ?? []) as ChippiContact[];
    const signals: Signal[] = [];

    for (const { props } of rows(dealResp)) {
      const matched = matchDealByTitle(str(props.dealname), chippiDeals);
      if (!matched) continue;
      const href = `/deals/${matched.id}`;
      const subject = { id: matched.id, name: matched.title, href };

      const closedate = str(props.closedate);
      const closeIn = daysUntil(closedate);
      if (
        closeIn !== null && closeIn >= 0 && closeIn <= CLOSE_WINDOW_DAYS &&
        matched.DealStage?.kind !== 'closing'
      ) {
        signals.push({
          source: 'hubspot', kind: 'review', urgency: 1, confidence: 0.85, subject,
          evidence: `${matched.title} closes ${formatCloseDate(closedate, closeIn)} in HubSpot — still '${describeChippiStage(matched)}' in Chippi.`,
          draftedAction: { kind: 'open', href },
        });
        continue;
      }

      const dealstage = str(props.dealstage);
      if (!stageFired || !dealstage) continue;
      const chippiStage = describeChippiStage(matched);
      if (dealstage.toLowerCase() === chippiStage.toLowerCase()) continue;
      signals.push({
        source: 'hubspot', kind: 'review', urgency: 2, confidence: 0.82, subject,
        evidence: `HubSpot moved the ${matched.title} deal to '${dealstage}'. Chippi still has it at '${chippiStage}'.`,
        draftedAction: { kind: 'open', href },
      });
    }

    if (contactFired) {
      for (const { id, props } of rows(contactResp)) {
        if (matchContactByEmail(str(props.email), chippiContacts)) continue;
        const name = [str(props.firstname), str(props.lastname)].filter(Boolean).join(' ').trim();
        if (!name) continue;
        signals.push({
          source: 'hubspot', kind: 'reply', urgency: 2, confidence: 0.78,
          // Prefix the id so composer dedup can't collide with a Chippi card.
          subject: { id: `hubspot:contact:${id}`, name, href: '/contacts' },
          evidence: `New HubSpot contact: ${name}. Not in Chippi.`,
          draftedAction: { kind: 'open', href: '/contacts' },
        });
      }
    }

    return signals;
  },
};
