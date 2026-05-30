/**
 * Tip categories — earned tips, never generic. Each category is a
 * specific gap in THIS realtor's data named in one Chippi-voiced
 * sentence with a deep-link action.
 *
 * Phase C1 ships six categories — five single-subject + one trend:
 *
 *   hot_lead_dormant      Hot lead, 7+ days since contact, no draft
 *   deal_closing_soon     Deal closing ≤7 days, no activity ≥5 days
 *   won_deal_review_ask   Won deal 14-30 days ago, no review-ask on file
 *   past_client_referral  Past client, ≥180 days quiet, won deal 6-18m ago
 *   unworked_tag          Tag with ≥5 contacts, none touched in ≥21 days
 *   overdue_pileup        ≥5 follow-ups ≥3 days overdue (trend tip)
 *
 * Phase C2 adds the multi-week trend tips: reply_rate_decline,
 * stage_stagnation, tour_conversion_drop, source_dry_spell.
 *
 * Each category is a pure function that returns 0 or more Signal
 * candidates. The composer ranks across categories + applies cool-downs.
 */

import { supabase } from '@/lib/supabase';
import { HOT_LEAD_THRESHOLD } from '@/lib/constants';
import type { Signal } from '../types';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function daysSince(dateInput: string | Date | null): number | null {
  if (!dateInput) return null;
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - date.getTime()) / MS_PER_DAY);
}

// ── 1. Hot lead gone dormant ─────────────────────────────────────────────────

export async function tipHotLeadDormant(spaceId: string): Promise<Signal[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(today.getTime() - 7 * MS_PER_DAY);

  const { data, error } = await supabase
    .from('Contact')
    .select('id, name, leadScore, lastContactedAt')
    .eq('spaceId', spaceId)
    .is('brokerageId', null)
    .gte('leadScore', HOT_LEAD_THRESHOLD)
    .lt('lastContactedAt', sevenDaysAgo.toISOString())
    .order('leadScore', { ascending: false })
    .limit(5);

  if (error || !data) return [];

  return (data as Array<{ id: string; name: string; leadScore: number; lastContactedAt: string }>).map((c) => {
    const days = daysSince(c.lastContactedAt) ?? 7;
    const aboveHot = c.leadScore - HOT_LEAD_THRESHOLD;
    const confidence = aboveHot >= 10 && days >= 10 ? 0.92 : 0.8;
    return {
      source: 'tips',
      kind: 'tip',
      urgency: 2,
      confidence,
      subject: { id: c.id, name: c.name, href: `/contacts/${c.id}` },
      evidence: `Scored hot ${days} days ago. You haven't reached out since.`,
      tipCategory: 'hot_lead_dormant',
    };
  });
}

// ── 2. Deal closing soon with no recent touch ────────────────────────────────

export async function tipDealClosingSoonNoTouch(spaceId: string): Promise<Signal[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sevenDaysOut = new Date(today.getTime() + 7 * MS_PER_DAY).toISOString().slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);
  const fiveDaysAgo = new Date(today.getTime() - 5 * MS_PER_DAY).toISOString();

  const { data, error } = await supabase
    .from('Deal')
    .select('id, title, closeDate, contactId')
    .eq('spaceId', spaceId)
    .eq('status', 'active')
    .gte('closeDate', todayStr)
    .lte('closeDate', sevenDaysOut);

  if (error || !data) return [];

  // For each, check ContactActivity recency.
  const signals: Signal[] = [];
  for (const deal of data as Array<{ id: string; title: string; closeDate: string; contactId: string | null }>) {
    if (!deal.contactId) continue;
    const { count } = await supabase
      .from('ContactActivity')
      .select('id', { count: 'exact', head: true })
      .eq('contactId', deal.contactId)
      .gte('createdAt', fiveDaysAgo);

    if ((count ?? 0) > 0) continue;

    const daysToClose = daysSince(deal.closeDate);
    const closeWord = daysToClose === 0 ? 'today' : daysToClose === -1 ? 'tomorrow' : `in ${Math.abs(daysToClose ?? 0)} days`;
    signals.push({
      source: 'tips',
      kind: 'tip',
      urgency: 1,
      confidence: 0.9,
      subject: { id: deal.id, name: deal.title, href: `/deals/${deal.id}` },
      evidence: `Closes ${closeWord}. No contact activity in the last five days.`,
      tipCategory: 'deal_closing_soon',
    });
  }
  return signals;
}

// ── 3. Won deal with no review/testimonial ask ───────────────────────────────

export async function tipWonDealReviewAsk(spaceId: string): Promise<Signal[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const fourteenAgo = new Date(today.getTime() - 14 * MS_PER_DAY);
  const thirtyAgo = new Date(today.getTime() - 30 * MS_PER_DAY);

  const { data, error } = await supabase
    .from('Deal')
    .select('id, title, closeDate, contactId, status')
    .eq('spaceId', spaceId)
    .eq('status', 'won')
    .gte('closeDate', thirtyAgo.toISOString().slice(0, 10))
    .lte('closeDate', fourteenAgo.toISOString().slice(0, 10));

  if (error || !data) return [];

  const signals: Signal[] = [];
  for (const deal of data as Array<{ id: string; title: string; closeDate: string; contactId: string | null }>) {
    if (!deal.contactId) continue;
    // Has any ContactActivity note mentioned "review" or "testimonial"?
    const { data: notes } = await supabase
      .from('ContactActivity')
      .select('content')
      .eq('contactId', deal.contactId)
      .eq('type', 'note')
      .gte('createdAt', deal.closeDate)
      .limit(20);

    const hasReviewMention = (notes ?? []).some((n) => {
      const txt = ((n as { content: string }).content ?? '').toLowerCase();
      return txt.includes('review') || txt.includes('testimonial');
    });
    if (hasReviewMention) continue;

    const daysAgo = daysSince(deal.closeDate) ?? 14;
    signals.push({
      source: 'tips',
      kind: 'tip',
      urgency: 2,
      confidence: 0.86,
      subject: { id: deal.id, name: deal.title, href: `/deals/${deal.id}` },
      evidence: `Closed ${daysAgo} days ago. No review ask on file yet.`,
      tipCategory: 'won_deal_review_ask',
    });
  }
  return signals;
}

// ── 4. Past client referral window ───────────────────────────────────────────

export async function tipPastClientReferral(spaceId: string): Promise<Signal[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sixMonthsAgo = new Date(today.getTime() - 180 * MS_PER_DAY);
  const eighteenMonthsAgo = new Date(today.getTime() - 540 * MS_PER_DAY);

  // Past clients = contacts with a won Deal closed 6-18 months ago, no
  // contact in 180+ days.
  const { data: deals } = await supabase
    .from('Deal')
    .select('id, contactId, closeDate, title')
    .eq('spaceId', spaceId)
    .eq('status', 'won')
    .gte('closeDate', eighteenMonthsAgo.toISOString().slice(0, 10))
    .lte('closeDate', sixMonthsAgo.toISOString().slice(0, 10));

  if (!deals || deals.length === 0) return [];

  const signals: Signal[] = [];
  for (const deal of deals as Array<{ id: string; contactId: string | null; closeDate: string; title: string }>) {
    if (!deal.contactId) continue;
    const { data: contact } = await supabase
      .from('Contact')
      .select('id, name, lastContactedAt')
      .eq('id', deal.contactId)
      .maybeSingle();

    if (!contact) continue;
    const lastContactDays = daysSince((contact as { lastContactedAt: string | null }).lastContactedAt);
    if (lastContactDays === null || lastContactDays < 180) continue;

    const closeDays = daysSince(deal.closeDate) ?? 180;
    const months = Math.round(closeDays / 30);
    const confidence = closeDays <= 365 ? 0.88 : 0.78;
    const name = (contact as { name: string }).name;

    signals.push({
      source: 'tips',
      kind: 'tip',
      urgency: 3,
      confidence,
      subject: { id: contact.id as string, name, href: `/contacts/${contact.id}` },
      evidence: `You closed with ${name} ${months} months ago. They're in the referral window.`,
      tipCategory: 'past_client_referral',
    });
  }
  return signals;
}

// ── 5. Unworked tag — a segment the realtor hasn't touched ───────────────────

export async function tipUnworkedTag(spaceId: string): Promise<Signal[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const twentyOneAgo = new Date(today.getTime() - 21 * MS_PER_DAY);

  // Pull all non-brokerage contacts and bucket by tag.
  const { data, error } = await supabase
    .from('Contact')
    .select('id, tags, lastContactedAt, leadScore')
    .eq('spaceId', spaceId)
    .is('brokerageId', null);

  if (error || !data) return [];

  type Row = { id: string; tags: string[] | null; lastContactedAt: string | null; leadScore: number | null };
  const tagBuckets = new Map<string, { count: number; recentTouches: number; avgScore: number }>();

  for (const row of data as Row[]) {
    const tags = Array.isArray(row.tags) ? row.tags : [];
    for (const tag of tags) {
      // Skip system tags — they're not segments the realtor curated.
      if (tag === 'new-lead' || tag === 'application-link' || tag.startsWith('_')) continue;
      const bucket = tagBuckets.get(tag) ?? { count: 0, recentTouches: 0, avgScore: 0 };
      bucket.count += 1;
      bucket.avgScore += row.leadScore ?? 0;
      const touched = row.lastContactedAt && new Date(row.lastContactedAt) > twentyOneAgo;
      if (touched) bucket.recentTouches += 1;
      tagBuckets.set(tag, bucket);
    }
  }

  const signals: Signal[] = [];
  for (const [tag, bucket] of tagBuckets.entries()) {
    if (bucket.count < 5 || bucket.recentTouches > 0) continue;
    const avgScore = bucket.count > 0 ? bucket.avgScore / bucket.count : 0;
    if (avgScore < 40) continue; // skip cold segments

    const confidence = bucket.count >= 10 ? 0.88 : 0.78;
    signals.push({
      source: 'tips',
      kind: 'tip',
      urgency: 3,
      confidence,
      subject: { id: `tag:${tag}`, name: `Tag "${tag}"`, href: `/contacts?tag=${encodeURIComponent(tag)}` },
      evidence: `${bucket.count} contacts tagged "${tag}". None touched in three weeks.`,
      tipCategory: 'unworked_tag',
    });
  }
  return signals;
}

// ── 6. Overdue follow-ups piling up — the only trend tip in C1 ──────────────

export async function tipOverduePileup(spaceId: string): Promise<Signal[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const threeAgo = new Date(today.getTime() - 3 * MS_PER_DAY).toISOString();

  const { count, error } = await supabase
    .from('Contact')
    .select('id', { count: 'exact', head: true })
    .eq('spaceId', spaceId)
    .is('brokerageId', null)
    .lt('followUpAt', threeAgo);

  if (error) return [];
  const overdue = count ?? 0;
  if (overdue < 5) return [];

  const confidence = overdue >= 10 ? 0.88 : 0.82;
  return [
    {
      source: 'tips',
      kind: 'tip',
      urgency: 2,
      confidence,
      // Trend tips have no named subject — the subject is the realtor's
      // own backlog. Cool-down is per (category, null).
      subject: {
        id: 'overdue_pileup',
        name: `${overdue} overdue follow-ups`,
        href: '/contacts?filter=overdue',
      },
      evidence: `${overdue} follow-ups are more than three days late.`,
      tipCategory: 'overdue_pileup',
    },
  ];
}

export const ALL_TIP_CATEGORIES = [
  tipHotLeadDormant,
  tipDealClosingSoonNoTouch,
  tipWonDealReviewAsk,
  tipPastClientReferral,
  tipUnworkedTag,
  tipOverduePileup,
];
