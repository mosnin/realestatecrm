import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendPushToSpace } from '@/lib/push';
import { redis } from '@/lib/redis';
import { logger } from '@/lib/logger';
import { monitorCron } from '@/lib/cron-monitor';
import { unscoped } from '@/lib/supabase-guard';


/**
 * GET /api/cron/deal-checklist-reminders
 *
 * Daily at 8 AM UTC (see vercel.json). Closing-checklist items carry due dates
 * and the deal UI paints an "Overdue" badge on anything past due — but that
 * badge only exists if the realtor opens the deal. For an agentic CRM that's a
 * dead end: an overdue earnest-money or loan-commitment item should *reach* the
 * realtor, not wait to be discovered.
 *
 * This sweep finds every open checklist item whose dueAt is in the past
 * (dueAt < now AND completedAt IS NULL), groups them by space, and sends each
 * space owner ONE push digest listing the overdue items (item label + deal
 * title + how overdue). A per-space daily digest is intentionally coarse: one
 * notification a day per space means there's no spam risk and no need for a
 * per-item "reminderSent" column — so no schema change.
 *
 * Reuses sendPushToSpace (the generic per-space owner notification used by the
 * follow-up-reminders cron and notify.ts). Gated on the notifyPush SpaceSetting
 * toggle, same as the follow-up digest.
 *
 * Idempotency: a SETNX day-lock prevents a duplicate cron invocation (Vercel
 * retry, manual re-trigger) from double-blasting every space with two identical
 * digests — mirrors follow-up-reminders.
 *
 * Best-effort: each space is sent in its own try/catch so one failure never
 * aborts the batch.
 *
 * Auth: Vercel cron sends `Authorization: Bearer ${CRON_SECRET}`.
 */
export const runtime = 'nodejs';
export const maxDuration = 300;

const DAY_MS = 24 * 60 * 60 * 1000;

function overdueLabel(dueAt: string, now: number): string {
  const days = Math.floor((now - new Date(dueAt).getTime()) / DAY_MS);
  if (days <= 0) return 'due today';
  if (days === 1) return '1 day overdue';
  return `${days} days overdue`;
}

async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/deal-checklist-reminders] CRON_SECRET is not set — rejecting request');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  if (req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const nowMs = now.getTime();
  const timestamp = now.toISOString();

  // Day-level idempotency. The realtor schedule revolves around days, so
  // locking by UTC date is the right granularity. 25h TTL absorbs clock skew
  // or a DST edge without going stale.
  const today = timestamp.slice(0, 10);
  const lockKey = `cron-lock:deal-checklist-reminders:${today}`;
  const claimed = await redis.set(lockKey, '1', { nx: true, ex: 25 * 60 * 60 });
  if (claimed !== 'OK') {
    return NextResponse.json({ ok: true, skipped: 'already_ran_today', date: today });
  }

  // Open + overdue: dueAt in the past, not completed. spaceId and dealId live
  // directly on DealChecklistItem, so the only join we need is to Deal for the
  // human-readable title.
  const { data: items, error } = await unscoped(supabase
    .from('DealChecklistItem'), 'cron: cross-tenant discovery then per-row work')
    .select('id, label, dealId, spaceId, dueAt')
    .lt('dueAt', timestamp)
    .is('completedAt', null);
  if (error) {
    logger.error('[cron/deal-checklist-reminders] DB query failed', {}, error);
    return NextResponse.json({ error: 'DB query failed' }, { status: 500 });
  }

  if (!items?.length) {
    return NextResponse.json({ notified: 0, spaces: 0, timestamp });
  }

  // Resolve deal titles in one pass.
  const dealIds = [...new Set(items.map((i) => i.dealId))];
  const { data: deals } = await unscoped(supabase
    .from('Deal'), 'cron: cross-tenant discovery then per-row work')
    .select('id, title')
    .in('id', dealIds);
  const titleById = new Map((deals ?? []).map((d) => [d.id, d.title as string]));

  // Group overdue items by space.
  const bySpace = new Map<string, typeof items>();
  for (const item of items) {
    const list = bySpace.get(item.spaceId) ?? [];
    list.push(item);
    bySpace.set(item.spaceId, list);
  }

  let notified = 0;
  for (const [spaceId, spaceItems] of bySpace) {
    try {
      const { data: space } = await supabase
        .from('Space')
        .select('name, slug')
        .eq('id', spaceId)
        .maybeSingle();
      if (!space) continue;

      const { data: setting } = await supabase
        .from('SpaceSetting')
        .select('notifyPush')
        .eq('spaceId', spaceId)
        .maybeSingle();
      if (setting?.notifyPush === false) continue;

      const count = spaceItems.length;
      // Lead the body with the most-overdue item so the digest is useful at a
      // glance even before opening the app.
      const sorted = [...spaceItems].sort(
        (a, b) => new Date(a.dueAt as string).getTime() - new Date(b.dueAt as string).getTime(),
      );
      const lead = sorted[0];
      const leadDeal = titleById.get(lead.dealId) ?? 'a deal';
      const leadLine = `${lead.label} (${leadDeal}) — ${overdueLabel(lead.dueAt as string, nowMs)}`;

      const sent = await sendPushToSpace(spaceId, {
        title:
          count === 1
            ? 'Overdue checklist item'
            : `${count} overdue checklist items`,
        body: count === 1 ? leadLine : `${leadLine}. Open ${space.name} to review the rest.`,
        url: `/s/${space.slug}/deals`,
      }).catch((err) => {
        logger.error('[cron/deal-checklist-reminders] push failed', { spaceId }, err);
        return 0;
      });

      if (sent > 0) notified++;
    } catch (err) {
      logger.error('[cron/deal-checklist-reminders] space digest failed', { spaceId }, err);
    }
  }

  logger.info('[cron/deal-checklist-reminders] sweep complete', {
    notified,
    spaces: bySpace.size,
  });
  return NextResponse.json({ notified, spaces: bySpace.size, timestamp });
}

export const GET = monitorCron('deal-checklist-reminders', { crontab: '0 8 * * *' }, handler);
