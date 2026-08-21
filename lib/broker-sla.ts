/**
 * Speed-to-lead enforcement — the agentic half of brokerage lead routing.
 *
 * Routing already puts a lead in a realtor's hands (auto-assign + DealRoutingRule
 * → a Contact clone tagged `assigned-by-broker` in the realtor's space). This is
 * the part that makes sure it's actually WORKED: a sweep that finds routed leads
 * sitting un-touched past the brokerage's SLA and acts on the broker's behalf —
 * nudging the realtor first, escalating to the broker if it stays cold.
 *
 * Detection needs no extra schema:
 *   - a routed lead  = Contact in a member space tagged `assigned-by-broker`
 *   - un-worked      = `lastContactedAt IS NULL`
 *   - the clock      = the clone's `createdAt` (= assignment time)
 *
 * Idempotency is carried on the contact's own tags: once Chippi nudges it gets
 * `sla-nudged`; once it escalates it gets `sla-escalated`. The sweep skips a
 * lead it has already acted on at that level, so running every 15 minutes never
 * double-pings.
 *
 * Durable re-surfacing: a tag + a transient push aren't enough on their own —
 * a push is fire-and-forget and the tag only stops US from acting again, it
 * doesn't put the lead back in front of the realtor. So alongside the
 * nudge/escalation each breach also opens a durable AgentTask in the realtor's
 * own space (the lead owner). That task is what re-surfaces the lead in their
 * Chippi task list / inbox and keeps it there until it's actually worked, even
 * after the one-time push has come and gone. The task is created idempotently:
 * if an open SLA follow-up already exists for that contact, no second one is
 * cut, so repeated 15-minute ticks never pile up duplicates.
 */

import { supabase } from '@/lib/supabase';
import { getBrokerageMembers } from '@/lib/brokerage-members';
import { notifyBroker } from '@/lib/broker-notify';
import { sendPushToSpace } from '@/lib/push';
import { logger } from '@/lib/logger';
import { unscoped } from '@/lib/supabase-guard';


export interface BrokerageSlaPolicy {
  id: string;
  name: string;
  slaFirstResponseMinutes: number;
  slaEscalateMinutes: number;
}

export interface SlaSweepResult {
  brokerageId: string;
  breached: number;
  nudged: number;
  escalated: number;
  // Durable SLA follow-up tasks newly opened this sweep (deduped — re-ticks
  // over an already-open follow-up don't increment this).
  followUpsCreated: number;
}

const NUDGED_TAG = 'sla-nudged';
const ESCALATED_TAG = 'sla-escalated';

// Marks an AgentTask as a speed-to-lead follow-up. `triggerSource` keeps these
// distinguishable from manual/scheduled tasks; the `kind` in metadata mirrors
// the BrokerNotification metadata convention so both surfaces tag the same way.
const SLA_TASK_TRIGGER = 'sla';
const SLA_TASK_KIND = 'lead_sla_followup';

// A follow-up that is still "open" — i.e. not yet worked/closed. If one of
// these already exists for a contact, the sweep must not cut another.
const OPEN_TASK_STATUSES = ['queued', 'running', 'paused'];

function minutesSince(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

/**
 * Open a durable SLA follow-up task in the realtor's own space so the breached
 * lead re-surfaces and stays surfaced until it's worked.
 *
 * Idempotent: if an open (queued/running/paused) SLA follow-up already exists
 * for this contact, no second task is created — so repeated cron ticks (every
 * 15 minutes) never pile up duplicates. Best-effort: a failure here is logged
 * and swallowed so it never aborts the rest of the sweep.
 *
 * Returns true iff a new task was created.
 */
async function ensureSlaFollowUpTask(args: {
  brokerageId: string;
  spaceId: string;
  contactId: string;
  contactName: string;
  realtor: string;
  waitedMinutes: number;
  level: 'nudge' | 'escalation';
}): Promise<boolean> {
  const { brokerageId, spaceId, contactId, contactName, realtor, waitedMinutes, level } = args;

  try {
    // Dedup: is there already an open SLA follow-up for this contact?
    const { data: existing, error: lookupError } = await supabase
      .from('AgentTask')
      .select('id')
      .eq('spaceId', spaceId)
      .eq('triggerSource', SLA_TASK_TRIGGER)
      .eq('metadata->>contactId', contactId)
      .in('status', OPEN_TASK_STATUSES)
      .limit(1);

    if (lookupError) {
      // Fail closed on lookup: don't risk a duplicate when we can't tell.
      logger.warn(
        '[broker-sla] follow-up dedup lookup failed; skipping task creation',
        { brokerageId, contactId },
        lookupError,
      );
      return false;
    }
    if (existing && existing.length > 0) return false;

    const title = `Follow up: ${contactName} hasn't been contacted`;
    const description =
      level === 'escalation'
        ? `Lead assigned to ${realtor} ${waitedMinutes} minutes ago is past the escalation window with no first response. The broker has been notified — reassign or reach out now.`
        : `Lead assigned to ${realtor} ${waitedMinutes} minutes ago is past the first-response SLA with no contact yet. Reach out now.`;

    // Mirrors enqueueTask()'s insert shape, but carries the dedup metadata
    // (contactId/kind) that the lookup above keys on — enqueueTask doesn't
    // expose a metadata field, so the row is written directly here.
    const now = new Date().toISOString();
    const { error: insertError } = await supabase.from('AgentTask').insert({
      spaceId,
      title: title.slice(0, 255),
      description,
      triggerSource: SLA_TASK_TRIGGER,
      goalDescription: description,
      status: 'queued',
      metadata: { kind: SLA_TASK_KIND, contactId, brokerageId, realtor, waitedMinutes, level },
      createdAt: now,
      updatedAt: now,
    });
    if (insertError) {
      logger.warn('[broker-sla] failed to insert follow-up task', { brokerageId, contactId }, insertError);
      return false;
    }
    return true;
  } catch (err) {
    logger.warn('[broker-sla] failed to open follow-up task', { brokerageId, contactId }, err);
    return false;
  }
}

/**
 * Run the speed-to-lead sweep for one brokerage. Best-effort throughout — a
 * single contact failing never aborts the rest. Returns what Chippi did.
 */
export async function sweepBrokerageSla(brokerage: BrokerageSlaPolicy): Promise<SlaSweepResult> {
  const result: SlaSweepResult = {
    brokerageId: brokerage.id,
    breached: 0,
    nudged: 0,
    escalated: 0,
    followUpsCreated: 0,
  };

  // ── Member spaces + realtor names ──────────────────────────────────────────
  const members = await getBrokerageMembers(brokerage.id, { includeSpaceName: true });
  const spaceIds: string[] = [];
  const spaceToRealtor = new Map<string, string>();
  for (const m of members) {
    const sid = m.Space?.id;
    if (!sid) continue;
    spaceIds.push(sid);
    spaceToRealtor.set(sid, m.User?.name ?? m.User?.email ?? 'a real estate agent');
  }
  if (spaceIds.length === 0) return result;

  // First-response threshold: any routed lead created before this has now sat
  // longer than the brokerage allows.
  const firstThreshold = new Date(Date.now() - brokerage.slaFirstResponseMinutes * 60000).toISOString();

  const { data, error } = await supabase
    .from('Contact')
    .select('id, name, spaceId, tags, createdAt, lastContactedAt')
    .in('spaceId', spaceIds)
    .contains('tags', ['assigned-by-broker'])
    .is('lastContactedAt', null)
    .lte('createdAt', firstThreshold)
    .limit(2000);
  if (error) {
    logger.error('[broker-sla] breach query failed', { brokerageId: brokerage.id }, error);
    return result;
  }

  const rows = (data ?? []) as {
    id: string;
    name: string;
    spaceId: string;
    tags: string[] | null;
    createdAt: string;
  }[];

  for (const c of rows) {
    const tags = c.tags ?? [];
    const waited = minutesSince(c.createdAt);
    const realtor = spaceToRealtor.get(c.spaceId) ?? 'a real estate agent';
    result.breached += 1;

    const level: 'nudge' | 'escalation' =
      waited >= brokerage.slaEscalateMinutes ? 'escalation' : 'nudge';

    try {
      // Durable re-surfacing FIRST, every tick. The push/notify + tag below are
      // one-shot (the tag-guard `continue`s on later ticks), so on their own a
      // lead goes quiet after the first nudge. The follow-up task is what keeps
      // it surfaced; ensureSlaFollowUpTask is idempotent, so re-ticks over an
      // already-open follow-up don't duplicate it.
      const created = await ensureSlaFollowUpTask({
        brokerageId: brokerage.id,
        spaceId: c.spaceId,
        contactId: c.id,
        contactName: c.name,
        realtor,
        waitedMinutes: waited,
        level,
      });
      if (created) result.followUpsCreated += 1;

      // Past the escalation window → the realtor has had their chance; pull in
      // the broker (their decision whether to reassign — nothing fires without
      // a human's name on it).
      if (level === 'escalation') {
        if (tags.includes(ESCALATED_TAG)) continue;
        await notifyBroker({
          brokerageId: brokerage.id,
          type: 'review_requested',
          title: `${c.name} still hasn't been contacted`,
          body: `Assigned to ${realtor} ${waited} minutes ago and still no first response. Reassign or step in.`,
          metadata: { kind: 'lead_sla_breach', contactId: c.id, spaceId: c.spaceId, realtor, waitedMinutes: waited },
        });
        await unscoped(supabase
          .from('Contact'), 'broker: membership-proved cross-space access')
          .update({ tags: [...tags, ESCALATED_TAG] })
          .eq('id', c.id);
        result.escalated += 1;
        continue;
      }

      // Past first-response but inside the escalation window → nudge the realtor.
      if (tags.includes(NUDGED_TAG)) continue;
      await sendPushToSpace(c.spaceId, {
        title: 'A lead is waiting on you',
        body: `${c.name} has been waiting ${waited} minutes. Reach out now.`,
      }).catch(() => 0);
      await unscoped(supabase
        .from('Contact'), 'broker: membership-proved cross-space access')
        .update({ tags: [...tags, NUDGED_TAG] })
        .eq('id', c.id);
      result.nudged += 1;
    } catch (err) {
      logger.warn('[broker-sla] action failed for contact', { brokerageId: brokerage.id, contactId: c.id }, err);
    }
  }

  return result;
}

/**
 * Run the sweep for every brokerage that has SLA enforcement on. Used by the
 * cron route.
 */
export async function sweepAllBrokerages(): Promise<SlaSweepResult[]> {
  const { data, error } = await supabase
    .from('Brokerage')
    .select('id, name, slaFirstResponseMinutes, slaEscalateMinutes')
    .eq('slaEnabled', true)
    .limit(5000);
  if (error) {
    logger.error('[broker-sla] failed to load brokerages', {}, error);
    return [];
  }
  const policies = (data ?? []) as BrokerageSlaPolicy[];
  const out: SlaSweepResult[] = [];
  for (const p of policies) {
    try {
      out.push(await sweepBrokerageSla(p));
    } catch (err) {
      logger.error('[broker-sla] brokerage sweep threw', { brokerageId: p.id }, err);
    }
  }
  return out;
}
