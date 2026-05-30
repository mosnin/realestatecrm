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

// ── Phase C2 pure helpers — testable in isolation ───────────────────────────

/** Reply rate over a list of sends. A send "replied" if the recipient has a
 *  ContactActivity (note/email/call) within 72h of the send. */
export function computeReplyRate(
  sends: Array<{ contactId: string | null; sentAt: string }>,
  activitiesByContact: Map<string, string[]>,
): { rate: number; sample: number } {
  let replied = 0;
  let counted = 0;
  for (const send of sends) {
    if (!send.contactId) continue;
    counted += 1;
    const sentMs = new Date(send.sentAt).getTime();
    if (isNaN(sentMs)) continue;
    const cutoff = sentMs + 72 * 60 * 60 * 1000;
    const acts = activitiesByContact.get(send.contactId) ?? [];
    if (acts.some((iso) => {
      const t = new Date(iso).getTime();
      return !isNaN(t) && t > sentMs && t <= cutoff;
    })) replied += 1;
  }
  if (counted === 0) return { rate: 0, sample: 0 };
  return { rate: Math.round((replied / counted) * 100), sample: counted };
}

/** Median inter-arrival time (days) between consecutive arrivals. Null if <2. */
export function medianInterArrivalDays(createdAtIsoList: string[]): number | null {
  const times = createdAtIsoList
    .map((iso) => new Date(iso).getTime())
    .filter((t) => !isNaN(t))
    .sort((a, b) => a - b);
  if (times.length < 2) return null;
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i += 1) gaps.push((times[i] - times[i - 1]) / MS_PER_DAY);
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  return gaps.length % 2 === 0 ? (gaps[mid - 1] + gaps[mid]) / 2 : gaps[mid];
}

/** "N in 10" — round to nearest tenth. */
export function describeFraction(num: number, den: number): string {
  if (den === 0) return '0 in 10';
  return `${Math.round((num / den) * 10)} in 10`;
}

/** Small integers as words; rest stays numeric. */
export function countAsWord(n: number): string {
  return ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'][n] ?? String(n);
}

// ── 7. Reply rate decline — week-over-week ──────────────────────────────────

export async function tipReplyRateDecline(spaceId: string): Promise<Signal[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const fourteenAgo = new Date(today.getTime() - 14 * MS_PER_DAY);
  const sevenAgo = new Date(today.getTime() - 7 * MS_PER_DAY);
  // Pull a few extra days so 72h-after-send windows aren't clipped.
  const replyHorizon = new Date(today.getTime() + 3 * MS_PER_DAY).toISOString();

  const { data: sends, error } = await supabase
    .from('AgentDraft')
    .select('contactId, updatedAt')
    .eq('spaceId', spaceId)
    .eq('status', 'sent')
    .gte('updatedAt', fourteenAgo.toISOString())
    .lt('updatedAt', today.toISOString());
  if (error || !sends) return [];

  type Send = { contactId: string | null; updatedAt: string };
  const rows = (sends as Send[]).map((s) => ({ contactId: s.contactId, sentAt: s.updatedAt }));
  const thisWeek = rows.filter((r) => new Date(r.sentAt) >= sevenAgo);
  const priorWeek = rows.filter((r) => new Date(r.sentAt) < sevenAgo);

  // New-realtor gate + sample-size floor: prior week must clear 10 sends.
  if (priorWeek.length < 10) return [];

  const contactIds = Array.from(
    new Set(rows.map((r) => r.contactId).filter((id): id is string => id !== null)),
  );
  if (contactIds.length === 0) return [];

  const { data: activities } = await supabase
    .from('ContactActivity')
    .select('contactId, createdAt, type')
    .eq('spaceId', spaceId)
    .in('contactId', contactIds)
    .in('type', ['note', 'email', 'call'])
    .gte('createdAt', fourteenAgo.toISOString())
    .lt('createdAt', replyHorizon);

  const byContact = new Map<string, string[]>();
  for (const a of (activities ?? []) as Array<{ contactId: string; createdAt: string }>) {
    const list = byContact.get(a.contactId) ?? [];
    list.push(a.createdAt);
    byContact.set(a.contactId, list);
  }

  const prior = computeReplyRate(priorWeek, byContact);
  const current = computeReplyRate(thisWeek, byContact);
  const drop = prior.rate - current.rate;
  if (drop < 15) return [];

  const confidence = drop >= 25 && current.sample >= 20 ? 0.9 : 0.8;
  return [{
    source: 'tips',
    kind: 'tip',
    urgency: 2,
    confidence,
    subject: { id: 'reply_rate_decline', name: 'Reply rate dropped', href: '/chippi/activity?filter=sent_no_reply' },
    evidence: `Your reply rate dropped from ${prior.rate}% to ${current.rate}% this week. Sample is ${current.sample} sends.`,
    tipCategory: 'reply_rate_decline',
  }];
}

// ── 8. Stage stagnation — a whole stage hasn't moved in 21+ days ─────────────

export async function tipStageStagnation(spaceId: string): Promise<Signal[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const twentyOneAgo = new Date(today.getTime() - 21 * MS_PER_DAY);
  const thirtyAgo = new Date(today.getTime() - 30 * MS_PER_DAY);

  const { data: deals, error } = await supabase
    .from('Deal')
    .select('id, stageId, stageChangedAt')
    .eq('spaceId', spaceId)
    .eq('status', 'active');
  if (error || !deals) return [];

  type Row = { id: string; stageId: string; stageChangedAt: string | null };
  const byStage = new Map<string, Row[]>();
  for (const d of deals as Row[]) {
    if (!d.stageId) continue;
    const list = byStage.get(d.stageId) ?? [];
    list.push(d);
    byStage.set(d.stageId, list);
  }

  // ≥3 active deals AND every one has stageChangedAt ≤21d ago (missing = skip).
  const stuckStageIds: string[] = [];
  const stuckMeta = new Map<string, { count: number; allOver30: boolean }>();
  for (const [stageId, rows] of byStage.entries()) {
    if (rows.length < 3) continue;
    const stuckAt = (cutoff: Date) =>
      rows.every((r) => !!r.stageChangedAt && new Date(r.stageChangedAt) <= cutoff);
    if (!stuckAt(twentyOneAgo)) continue;
    stuckStageIds.push(stageId);
    stuckMeta.set(stageId, { count: rows.length, allOver30: stuckAt(thirtyAgo) });
  }
  if (stuckStageIds.length === 0) return [];

  const { data: stages } = await supabase
    .from('DealStage')
    .select('id, name')
    .in('id', stuckStageIds);
  const nameMap = new Map(
    ((stages ?? []) as Array<{ id: string; name: string }>).map((s) => [s.id, s.name]),
  );

  const signals: Signal[] = [];
  for (const stageId of stuckStageIds) {
    const meta = stuckMeta.get(stageId);
    if (!meta) continue;
    const stageName = nameMap.get(stageId) ?? 'this stage';
    const confidence = meta.count >= 5 && meta.allOver30 ? 0.92 : 0.85;
    signals.push({
      source: 'tips',
      kind: 'tip',
      urgency: 2,
      confidence,
      subject: {
        id: `stage:${stageId}`,
        name: stageName,
        href: `/deals?stage=${encodeURIComponent(stageId)}`,
      },
      evidence: `Every deal in ${stageName} has been there 3+ weeks. ${countAsWord(meta.count)} deals, no movement.`,
      tipCategory: 'stage_stagnation',
    });
  }
  return signals;
}

// ── 9. Tour conversion drop — recent vs. baseline window ────────────────────

export async function tipTourConversionDrop(spaceId: string): Promise<Signal[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const twentyOneAgo = new Date(today.getTime() - 21 * MS_PER_DAY);
  const fortyTwoAgo = new Date(today.getTime() - 42 * MS_PER_DAY);
  const twentyTwoAgo = new Date(today.getTime() - 22 * MS_PER_DAY);
  // Cover the 7d post-tour window for the oldest baseline tour.
  const draftsLookback = new Date(today.getTime() - 49 * MS_PER_DAY).toISOString();

  const { data: tours, error } = await supabase
    .from('Tour')
    .select('id, contactId, endsAt')
    .eq('spaceId', spaceId)
    .eq('status', 'completed')
    .gte('endsAt', fortyTwoAgo.toISOString())
    .lt('endsAt', today.toISOString());
  if (error || !tours) return [];

  type Tour = { id: string; contactId: string | null; endsAt: string };
  const all = tours as Tour[];
  const recent = all.filter((t) => new Date(t.endsAt) >= twentyOneAgo);
  const baseline = all.filter((t) => {
    const d = new Date(t.endsAt);
    return d <= twentyTwoAgo && d >= fortyTwoAgo;
  });
  // ≥4 recent tours + baseline must exist (new-realtor gate).
  if (recent.length < 4 || baseline.length === 0) return [];

  const contactIds = Array.from(
    new Set(all.map((t) => t.contactId).filter((id): id is string => id !== null)),
  );
  if (contactIds.length === 0) return [];

  // Converted = within 7d post-tour, a Deal in a later stage updated OR an
  // AgentDraft mentioning application/offer was created.
  const [dealsRes, draftsRes, stagesRes] = await Promise.all([
    supabase.from('Deal').select('contactId, stageId, updatedAt').eq('spaceId', spaceId).in('contactId', contactIds),
    supabase.from('AgentDraft').select('contactId, content, createdAt').eq('spaceId', spaceId).in('contactId', contactIds).gte('createdAt', draftsLookback),
    supabase.from('DealStage').select('id, kind').eq('spaceId', spaceId),
  ]);

  const laterKinds = new Set(['under_contract', 'closing', 'closed']);
  const stageIsLater = new Map<string, boolean>();
  for (const s of (stagesRes.data ?? []) as Array<{ id: string; kind: string | null }>) {
    stageIsLater.set(s.id, !!s.kind && laterKinds.has(s.kind));
  }

  type DealRow = { contactId: string | null; stageId: string; updatedAt: string };
  type DraftRow = { contactId: string | null; content: string | null; createdAt: string };
  const dealsByContact = new Map<string, DealRow[]>();
  const draftsByContact = new Map<string, DraftRow[]>();
  function bucket<T extends { contactId: string | null }>(rows: T[], map: Map<string, T[]>) {
    for (const r of rows) {
      if (!r.contactId) continue;
      const list = map.get(r.contactId) ?? [];
      list.push(r);
      map.set(r.contactId, list);
    }
  }
  bucket((dealsRes.data ?? []) as DealRow[], dealsByContact);
  bucket((draftsRes.data ?? []) as DraftRow[], draftsByContact);

  function converted(tour: Tour): boolean {
    if (!tour.contactId) return false;
    const endMs = new Date(tour.endsAt).getTime();
    if (isNaN(endMs)) return false;
    const cutoff = endMs + 7 * MS_PER_DAY;
    for (const d of dealsByContact.get(tour.contactId) ?? []) {
      if (!stageIsLater.get(d.stageId)) continue;
      const t = new Date(d.updatedAt).getTime();
      if (!isNaN(t) && t > endMs && t <= cutoff) return true;
    }
    for (const dr of draftsByContact.get(tour.contactId) ?? []) {
      const t = new Date(dr.createdAt).getTime();
      if (isNaN(t) || t <= endMs || t > cutoff) continue;
      const text = (dr.content ?? '').toLowerCase();
      if (text.includes('application') || text.includes('offer')) return true;
    }
    return false;
  }

  const recentConverted = recent.filter(converted).length;
  const baselineConverted = baseline.filter(converted).length;
  const recentRate = (recentConverted / recent.length) * 100;
  const baselineRate = (baselineConverted / baseline.length) * 100;
  if (baselineRate - recentRate < 20) return [];

  const confidence = recent.length >= 6 ? 0.88 : 0.78;
  return [{
    source: 'tips',
    kind: 'tip',
    urgency: 2,
    confidence,
    subject: { id: 'tour_conversion_drop', name: 'Tour conversion dropped', href: '/deals?status=tour_completed' },
    evidence: `${countAsWord(recent.length)} tours last three weeks. None moved to application. Last quarter the rate was ${describeFraction(baselineConverted, baseline.length)}.`,
    tipCategory: 'tour_conversion_drop',
  }];
}

// ── 10. Source dry spell — a channel that's gone quiet ──────────────────────

export async function tipSourceDrySpell(spaceId: string): Promise<Signal[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ninetyAgo = new Date(today.getTime() - 90 * MS_PER_DAY);
  const twentyOneAgo = new Date(today.getTime() - 21 * MS_PER_DAY);

  const { data, error } = await supabase
    .from('Contact')
    .select('sourceLabel, createdAt')
    .eq('spaceId', spaceId)
    .is('brokerageId', null)
    .gte('createdAt', ninetyAgo.toISOString())
    .not('sourceLabel', 'is', null);
  if (error || !data) return [];

  type Row = { sourceLabel: string | null; createdAt: string };
  const bySource = new Map<string, string[]>();
  for (const r of data as Row[]) {
    const src = (r.sourceLabel ?? '').trim();
    if (!src) continue;
    const list = bySource.get(src) ?? [];
    list.push(r.createdAt);
    bySource.set(src, list);
  }

  const signals: Signal[] = [];
  for (const [source, createdAtList] of bySource.entries()) {
    if (createdAtList.length < 5) continue;
    if (createdAtList.some((iso) => new Date(iso) >= twentyOneAgo)) continue;

    const median = medianInterArrivalDays(createdAtList);
    if (median === null) continue;
    if (21 < median * 2) continue; // silence isn't long enough vs. history

    const latestMs = Math.max(...createdAtList.map((iso) => new Date(iso).getTime()));
    const silenceDays = Math.min(90, Math.floor((Date.now() - latestMs) / MS_PER_DAY));
    signals.push({
      source: 'tips',
      kind: 'tip',
      urgency: 3,
      confidence: 0.82,
      subject: { id: `source:${source}`, name: source, href: '/settings/integrations' },
      evidence: `${source} has been silent ${silenceDays} days. Your prior median was ${Math.round(median)}.`,
      tipCategory: 'source_dry_spell',
    });
  }
  return signals;
}

export const ALL_TIP_CATEGORIES = [
  tipHotLeadDormant,
  tipDealClosingSoonNoTouch,
  tipWonDealReviewAsk,
  tipPastClientReferral,
  tipUnworkedTag,
  tipOverduePileup,
  tipReplyRateDecline,
  tipStageStagnation,
  tipTourConversionDrop,
  tipSourceDrySpell,
];

/** Internals exposed for unit tests. */
export const __tipCategoryInternals = {
  computeReplyRate,
  medianInterArrivalDays,
  describeFraction,
  countAsWord,
};
