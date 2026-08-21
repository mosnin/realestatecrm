import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendNotificationDigest } from '@/lib/email';
import { redis } from '@/lib/redis';
import { monitorCron } from '@/lib/cron-monitor';
import { logger } from '@/lib/logger';
import {
  resolveEffectivePrefs,
  type DigestCadence,
  type EffectiveEventTypes,
} from '@/lib/notify-prefs';
import { buildDigestSections, contiguousWindow } from '@/lib/notify-digest';
import { unscoped } from '@/lib/supabase-guard';


/**
 * GET /api/cron/notification-digest
 *
 * Daily at 8 AM UTC. Sends the opt-in roll-up email to every realtor whose
 * effective notification preference (member override ?? space default) has a
 * digest cadence of 'daily' (every run) or 'weekly' (Mondays only). Each
 * digest batches the period's notable events — new leads, tour bookings, new
 * deals — into ONE summary email, replacing the per-event emails that
 * lib/notify.ts suppressed for the covered types.
 *
 * DEFAULT-OFF: the SpaceSetting.digestCadence column defaults to 'off' and no
 * NotificationPreference rows exist for existing users, so this cron sends to
 * nobody until someone opts in. Existing per-event behavior is untouched.
 *
 * IDEMPOTENCY (two layers):
 *   - A Redis SETNX day-lock prevents a duplicate invocation (Vercel retry,
 *     manual hit) from re-running the whole sweep, matching the other digest
 *     crons (follow-up-reminders, broker-weekly-report).
 *   - Per TARGET, `lastDigestAt` (on SpaceSetting for the space default, on
 *     NotificationPreference for a member override) is stamped after a send and
 *     checked before one: a target whose last digest falls inside the current
 *     period is skipped. So even if the lock is bypassed (e.g. Redis absent in
 *     a preview deploy), no realtor receives two digests for the same period.
 *
 * Auth: Vercel cron sends `Authorization: Bearer ${CRON_SECRET}`.
 * Disable: CRON_DIGEST_DISABLED=1.
 */
export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_TARGETS_PER_RUN = 5000;

/** A realtor to consider for a digest this run. */
interface DigestTarget {
  spaceId: string;
  /** Clerk user id of the recipient (owner or member). Used for per-member resolution. */
  userId: string | null;
  /** Where the per-target idempotency stamp lives. */
  source: 'space' | 'member';
  lastDigestAt: string | null;
}

/**
 * Start of the CURRENT digest period, in UTC, for `now`:
 *   - daily  → today 00:00:00 UTC
 *   - weekly → the most recent Monday 00:00:00 UTC (the weekly send day)
 *
 * Periods are CALENDAR buckets, not a rolling delta from `now`. This is what
 * makes idempotency jitter-proof: two runs on the same UTC day (or in the same
 * Mon-anchored week) resolve to the same period start regardless of the exact
 * second each cron fires, so a few seconds of Vercel scheduling jitter can
 * never skip — or double-send — a period the way an `elapsed < window`
 * comparison could.
 */
function periodStart(now: Date, cadence: 'daily' | 'weekly'): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (cadence === 'weekly') {
    // getUTCDay: 0=Sun..6=Sat. Days since Monday = (day + 6) % 7.
    const daysSinceMonday = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  }
  return d;
}

/**
 * Has this target already received a digest for the CURRENT period? True when
 * `lastDigestAt` falls on/after this period's calendar start — i.e. we already
 * sent (or stamped an empty period) within today (daily) or this Mon-anchored
 * week (weekly).
 */
function alreadySentThisPeriod(
  lastDigestAt: string | null,
  cadence: 'daily' | 'weekly',
  now: Date,
): boolean {
  if (!lastDigestAt) return false;
  return new Date(lastDigestAt).getTime() >= periodStart(now, cadence).getTime();
}

/** Stamp lastDigestAt on the right table after a successful send. */
async function stampLastDigest(target: DigestTarget, nowIso: string): Promise<void> {
  if (target.source === 'space') {
    await supabase
      .from('SpaceSetting')
      .update({ lastDigestAt: nowIso })
      .eq('spaceId', target.spaceId);
  } else {
    await supabase
      .from('NotificationPreference')
      .update({ lastDigestAt: nowIso })
      .eq('spaceId', target.spaceId)
      .eq('userId', target.userId);
  }
}

async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logger.error('[cron/notification-digest] CRON_SECRET is not set — rejecting request');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  if (req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (process.env.CRON_DIGEST_DISABLED) {
    logger.info('[cron/notification-digest] CRON_DIGEST_DISABLED is set — skipping');
    return NextResponse.json({ status: 'disabled' });
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const today = nowIso.slice(0, 10);

  // Day-level lock — one sweep per UTC day. 25h TTL absorbs clock skew / DST.
  // The lock is a best-effort OPTIMIZATION to avoid a redundant full sweep on a
  // retry; the authoritative idempotency guard is the per-target calendar-period
  // check below (alreadySentThisPeriod), which prevents double-sends even with
  // no lock. Crucially, redis.set returns null BOTH when the key already exists
  // (lock held) AND when Redis is unconfigured (the no-op proxy in lib/redis).
  // So we only treat a non-OK result as "already ran" when Redis is actually
  // configured — otherwise (preview deploys without Upstash) we proceed and let
  // the per-target stamps do the deduping. Redis-availability check mirrors
  // lib/agent/ts-idempotency.ts.
  const redisConfigured = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
  if (redisConfigured) {
    const lockKey = `cron-lock:notification-digest:${today}`;
    const claimed = await redis.set(lockKey, '1', { nx: true, ex: 25 * 60 * 60 });
    if (claimed !== 'OK') {
      return NextResponse.json({ ok: true, skipped: 'already_ran_today', date: today });
    }
  }

  // Weekly digests go out on Mondays only; daily every day. (UTC getDay: 1=Mon.)
  const weeklyDue = now.getUTCDay() === 1;

  // ── Collect candidate targets ───────────────────────────────────────────
  // 1. Space-default opt-ins: SpaceSetting rows with a non-off cadence.
  // 2. Member overrides: NotificationPreference rows with a non-off cadence.
  // A member override SHADOWS the space default for the same (space, user):
  // we send at most one digest per recipient, driven by their effective prefs.
  const [spaceRes, memberRes] = await Promise.all([
    unscoped(supabase
      .from('SpaceSetting'), 'cron: cross-tenant discovery then per-row work')
      .select('spaceId, digestCadence, lastDigestAt')
      .in('digestCadence', ['daily', 'weekly'])
      .limit(MAX_TARGETS_PER_RUN),
    unscoped(supabase
      .from('NotificationPreference'), 'cron: cross-tenant discovery then per-row work')
      .select('spaceId, userId, digestCadence, lastDigestAt')
      .in('digestCadence', ['daily', 'weekly'])
      .limit(MAX_TARGETS_PER_RUN),
  ]);

  if (spaceRes.error) {
    logger.error('[cron/notification-digest] SpaceSetting lookup failed', {}, spaceRes.error);
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }
  if (memberRes.error) {
    logger.error('[cron/notification-digest] NotificationPreference lookup failed', {}, memberRes.error);
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }

  const memberRows = (memberRes.data ?? []) as Array<{
    spaceId: string;
    userId: string;
    digestCadence: string | null;
    lastDigestAt: string | null;
  }>;
  // Track (spaceId, ownerClerkId) pairs already covered by a member override so
  // the space-default pass doesn't also send to that same recipient.
  const memberKeys = new Set(memberRows.map((m) => `${m.spaceId}::${m.userId}`));

  const targets: DigestTarget[] = [];
  for (const m of memberRows) {
    targets.push({ spaceId: m.spaceId, userId: m.userId, source: 'member', lastDigestAt: m.lastDigestAt });
  }

  // Resolve each space-default opt-in to its owner's Clerk id, and skip it when
  // that owner already has a member override for the space (the override wins).
  const spaceRows = (spaceRes.data ?? []) as Array<{
    spaceId: string;
    digestCadence: string | null;
    lastDigestAt: string | null;
  }>;
  if (spaceRows.length > 0) {
    const spaceIds = spaceRows.map((s) => s.spaceId);
    const { data: spaces } = await supabase
      .from('Space')
      .select('id, ownerId')
      .in('id', spaceIds);
    const ownerBySpace = new Map((spaces ?? []).map((s) => [s.id as string, s.ownerId as string]));
    const ownerUserIds = Array.from(new Set([...ownerBySpace.values()]));
    let clerkByUserId = new Map<string, string | null>();
    if (ownerUserIds.length > 0) {
      const { data: users } = await supabase
        .from('User')
        .select('id, clerkId')
        .in('id', ownerUserIds);
      clerkByUserId = new Map((users ?? []).map((u) => [u.id as string, (u.clerkId as string) ?? null]));
    }
    for (const s of spaceRows) {
      const ownerId = ownerBySpace.get(s.spaceId);
      const ownerClerkId = ownerId ? clerkByUserId.get(ownerId) ?? null : null;
      // Skip when a member override already covers this owner for this space.
      if (ownerClerkId && memberKeys.has(`${s.spaceId}::${ownerClerkId}`)) continue;
      targets.push({ spaceId: s.spaceId, userId: ownerClerkId, source: 'space', lastDigestAt: s.lastDigestAt });
    }
  }

  let sent = 0;
  let skippedEmpty = 0;
  let skippedAlreadySent = 0;
  let skippedCadence = 0;

  for (const target of targets) {
    try {
      // Effective prefs decide the recipient's real cadence + event types.
      const prefs = await resolveEffectivePrefs(target.spaceId, target.userId);
      const cadence: DigestCadence = prefs.digestCadence;
      if (cadence === 'off') {
        // The candidate row said daily/weekly but the resolved cadence is off
        // (e.g. a member override flips it off). Nothing to send.
        skippedCadence++;
        continue;
      }
      // Weekly recipients only run on the weekly day.
      if (cadence === 'weekly' && !weeklyDue) {
        skippedCadence++;
        continue;
      }
      // Per-target idempotency: never two digests for the same period.
      if (alreadySentThisPeriod(target.lastDigestAt, cadence, now)) {
        skippedAlreadySent++;
        continue;
      }
      // Email channel must be on — a digest is an email roll-up.
      if (!prefs.channels.email) {
        skippedCadence++;
        continue;
      }

      // Contiguous window anchored to the last stamp so periods never gap/overlap.
      const { since, until } = contiguousWindow(now, cadence, target.lastDigestAt);
      const eventTypes: EffectiveEventTypes = prefs.eventTypes;
      const sections = await buildDigestSections(target.spaceId, eventTypes, since, until);

      // Nothing notable this period → no email, but DO stamp so we don't
      // re-evaluate this target every run within the period.
      if (sections.length === 0) {
        await stampLastDigest(target, nowIso);
        skippedEmpty++;
        continue;
      }

      // Recipient email + space identity. For a member target the recipient is
      // the member; for a space target it's the owner.
      const recipient = await resolveRecipient(target);
      if (!recipient) {
        skippedEmpty++;
        continue;
      }

      await sendNotificationDigest({
        toEmail: recipient.email,
        spaceName: recipient.spaceName,
        spaceSlug: recipient.spaceSlug,
        cadence,
        sections,
      });

      // Stamp only AFTER a successful send attempt so a thrown send can retry
      // next run (sendNotificationDigest itself never throws; this guards the
      // surrounding gather/lookup).
      await stampLastDigest(target, nowIso);
      sent++;
    } catch (err) {
      logger.error('[cron/notification-digest] target failed', { spaceId: target.spaceId, userId: target.userId }, err);
    }
  }

  return NextResponse.json({ sent, skippedEmpty, skippedAlreadySent, skippedCadence, targets: targets.length });
}

/**
 * Resolve the recipient email + space identity for a target. For a member
 * target we look up the member's User row by Clerk id; for a space target we
 * use the owner's email. Returns null when the email can't be resolved.
 */
async function resolveRecipient(
  target: DigestTarget,
): Promise<{ email: string; spaceName: string; spaceSlug: string } | null> {
  const { data: space } = await supabase
    .from('Space')
    .select('name, slug, ownerId')
    .eq('id', target.spaceId)
    .maybeSingle();
  if (!space) return null;

  let email: string | null = null;
  if (target.source === 'member' && target.userId) {
    const { data: user } = await supabase
      .from('User')
      .select('email')
      .eq('clerkId', target.userId)
      .maybeSingle();
    email = (user?.email as string) ?? null;
  } else {
    const { data: owner } = await supabase
      .from('User')
      .select('email')
      .eq('id', space.ownerId as string)
      .maybeSingle();
    email = (owner?.email as string) ?? null;
  }

  if (!email) return null;
  return { email, spaceName: space.name as string, spaceSlug: space.slug as string };
}

export const GET = monitorCron('notification-digest', { crontab: '0 8 * * *' }, handler);
