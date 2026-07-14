import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner } from '@/lib/api-auth';
import {
  notificationForNewLeadsCount,
  notificationForUpcomingTour,
  notificationForFollowUpDue,
  notificationForWaitlist,
  notificationForToursNeedingFollowUp,
} from '@/lib/notification-voice';

interface ComputedNotification {
  id: string;
  type: string;
  title: string;
  description: string;
  href: string;
  createdAt: string;
  priority: 'high' | 'medium' | 'low';
}

interface NotificationStateRow {
  key: string;
  readAt: string | null;
  dismissedAt: string | null;
  sourceCreatedAt: string | null;
}

/** Stored agent-outcome records: how far back and how many the bell shows. */
const STORED_WINDOW_DAYS = 30;
const STORED_LIMIT = 25;

/**
 * Loads the DURABLE agent-outcome notifications for a space — rows written by
 * lib/notifications.ts (createAppNotification) when background work finishes
 * (swarm runs via /api/internal/notify, first-touch drafts, workflow sends and
 * failures, work-session completions). Mapped into the same shape as the
 * computed items so read/dismiss state (keyed by id) applies identically.
 *
 * Best-effort: if the table is unavailable (e.g. the migration hasn't been
 * applied to this environment yet) the bell degrades to computed-only rather
 * than erroring.
 */
async function fetchStoredNotifications(
  spaceId: string,
  slug: string,
): Promise<ComputedNotification[]> {
  try {
    const since = new Date(Date.now() - STORED_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const { data, error } = await supabase
      .from('AppNotification')
      .select('id, type, title, body, href, priority, createdAt')
      .eq('spaceId', spaceId)
      .gte('createdAt', since.toISOString())
      .order('createdAt', { ascending: false })
      .limit(STORED_LIMIT);
    if (error) {
      console.error('[notifications] stored lookup failed', error.message);
      return [];
    }
    return (data ?? []).map((row: any): ComputedNotification => ({
      id: row.id,
      type: row.type,
      title: row.title,
      description: row.body ?? '',
      // Records written without a deep link land on the space dashboard.
      href: row.href || `/s/${slug}`,
      createdAt: row.createdAt,
      priority: row.priority === 'high' || row.priority === 'low' ? row.priority : 'medium',
    }));
  } catch (err) {
    console.error('[notifications] stored lookup threw', err);
    return [];
  }
}

/**
 * The full unfiltered list the bell operates on: computed CRM items + stored
 * agent-outcome records. Both GET and PATCH{all:true} MUST use this so
 * "mark all read" covers exactly what the realtor sees.
 */
async function listNotifications(
  spaceId: string,
  slug: string,
): Promise<ComputedNotification[]> {
  const [computed, stored] = await Promise.all([
    computeNotifications(spaceId, slug),
    fetchStoredNotifications(spaceId, slug),
  ]);
  return [...computed, ...stored];
}

/**
 * Computes the live, CRM-derived notifications for a space. These are NOT
 * stored — they're re-derived on every request. Read/dismiss state is layered
 * on top by the GET handler via the NotificationState table.
 */
async function computeNotifications(
  spaceId: string,
  slug: string,
): Promise<ComputedNotification[]> {
  const now = new Date();
  const notifications: ComputedNotification[] = [];

  // 1. New unread leads.
  // We fetch the latest matching lead too, so the aggregate notification
  // carries a STABLE, data-derived createdAt (the newest lead's). That lets the
  // read/dismiss freshness check work: once read, this stays hidden until a
  // genuinely newer lead arrives — instead of re-surfacing every fetch (which
  // it would if createdAt were wall-clock now()).
  const { count: newLeads } = await supabase
    .from('Contact')
    .select('*', { count: 'exact', head: true })
    .eq('spaceId', spaceId)
    .is('brokerageId', null)
    .contains('tags', ['new-lead']);
  if (newLeads && newLeads > 0) {
    const { data: latestLead } = await supabase
      .from('Contact')
      .select('createdAt')
      .eq('spaceId', spaceId)
      .is('brokerageId', null)
      .contains('tags', ['new-lead'])
      .order('createdAt', { ascending: false })
      .limit(1)
      .maybeSingle();
    const copy = notificationForNewLeadsCount(newLeads);
    notifications.push({
      id: 'new-leads',
      type: 'new_lead',
      title: copy.title,
      description: copy.description,
      href: `/s/${slug}/leads`,
      createdAt: latestLead?.createdAt ?? now.toISOString(),
      priority: 'high',
    });
  }

  // 2. Tours starting in the next 24 hours
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const { data: upcomingTours } = await supabase
    .from('Tour')
    .select('id, guestName, startsAt, propertyAddress')
    .eq('spaceId', spaceId)
    .in('status', ['scheduled', 'confirmed'])
    .gte('startsAt', now.toISOString())
    .lte('startsAt', in24h.toISOString())
    .order('startsAt', { ascending: true })
    .limit(5);
  for (const t of upcomingTours ?? []) {
    const copy = notificationForUpcomingTour(
      t.guestName,
      new Date(t.startsAt),
      t.propertyAddress,
      now,
    );
    notifications.push({
      id: `tour-${t.id}`,
      type: 'upcoming_tour',
      title: copy.title,
      description: copy.description,
      href: `/s/${slug}/calendar`,
      createdAt: t.startsAt,
      priority: 'high',
    });
  }

  // 3. Follow-ups that are due
  const { data: dueFollowUps } = await supabase
    .from('Contact')
    .select('id, name, followUpAt')
    .eq('spaceId', spaceId)
    .not('followUpAt', 'is', null)
    .lte('followUpAt', now.toISOString())
    .order('followUpAt', { ascending: true })
    .limit(5);
  for (const c of dueFollowUps ?? []) {
    const copy = notificationForFollowUpDue(c.name, new Date(c.followUpAt), now);
    notifications.push({
      id: `followup-${c.id}`,
      type: 'follow_up_due',
      title: copy.title,
      description: copy.description,
      href: `/s/${slug}/contacts/${c.id}`,
      createdAt: c.followUpAt,
      priority: 'medium',
    });
  }

  // 4. Waitlist entries needing attention. Same stable-timestamp treatment as
  // the new-leads aggregate: carry the newest waiting entry's createdAt so the
  // read/dismiss state sticks until a newer entry joins the waitlist.
  const { count: waitlistCount } = await supabase
    .from('TourWaitlist')
    .select('*', { count: 'exact', head: true })
    .eq('spaceId', spaceId)
    .eq('status', 'waiting');
  if (waitlistCount && waitlistCount > 0) {
    const { data: latestWaiting } = await supabase
      .from('TourWaitlist')
      .select('createdAt')
      .eq('spaceId', spaceId)
      .eq('status', 'waiting')
      .order('createdAt', { ascending: false })
      .limit(1)
      .maybeSingle();
    const copy = notificationForWaitlist(waitlistCount);
    notifications.push({
      id: 'waitlist',
      type: 'waitlist',
      title: copy.title,
      description: copy.description,
      href: `/s/${slug}/calendar`,
      createdAt: latestWaiting?.createdAt ?? now.toISOString(),
      priority: 'low',
    });
  }

  // 5. Completed tours needing follow-up (no deal yet)
  const { data: completedNoFollowUp } = await supabase
    .from('Tour')
    .select('id, guestName, updatedAt')
    .eq('spaceId', spaceId)
    .eq('status', 'completed')
    .order('updatedAt', { ascending: false })
    .limit(10);

  if (completedNoFollowUp?.length) {
    const tourIds = completedNoFollowUp.map((t: any) => t.id);
    const { data: dealsFromTours } = await supabase
      .from('Deal')
      .select('sourceTourId')
      .eq('spaceId', spaceId)
      .in('sourceTourId', tourIds);
    const dealsSet = new Set((dealsFromTours ?? []).map((d: any) => d.sourceTourId));
    const needsAction = completedNoFollowUp.filter((t: any) => !dealsSet.has(t.id));
    if (needsAction.length > 0) {
      // Newest updatedAt among the tours needing action → stable timestamp so
      // this aggregate stays read until a newer tour starts needing follow-up.
      const latestUpdatedAt = needsAction.reduce<string | null>((max, t: any) => {
        return !max || new Date(t.updatedAt).getTime() > new Date(max).getTime()
          ? t.updatedAt
          : max;
      }, null);
      const copy = notificationForToursNeedingFollowUp(needsAction.length);
      notifications.push({
        id: 'tours-need-action',
        type: 'tour_needs_action',
        title: copy.title,
        description: copy.description,
        href: `/s/${slug}/calendar`,
        createdAt: latestUpdatedAt ?? now.toISOString(),
        priority: 'medium',
      });
    }
  }

  return notifications;
}

/**
 * GET — Returns the realtor's actionable notifications for the dashboard:
 * items computed in real time from CRM data PLUS durable agent-outcome
 * records (AppNotification rows), filtered by persisted read/dismiss state.
 *
 * State semantics (see migration 20260706000000_notification_state.sql):
 *  - DISMISSED keys are dropped entirely.
 *  - READ keys are dropped from this (unread) list — UNLESS the notification's
 *    current source timestamp is newer than what was stamped when it was read,
 *    which means genuinely fresher activity and re-surfaces the item.
 */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const authResult = await requireSpaceOwner(slug);
  if (authResult instanceof NextResponse) return authResult;
  const { userId, space } = authResult;

  let notifications: ComputedNotification[];
  try {
    notifications = await listNotifications(space.id, slug);
  } catch (err) {
    console.error('[notifications] query failed', err);
    return NextResponse.json({ error: 'Failed to load notifications' }, { status: 500 });
  }

  // Layer persisted read/dismiss state on top. Best-effort: if the state table
  // is unavailable we still return the raw computed list rather than 500.
  let stateByKey = new Map<string, NotificationStateRow>();
  try {
    const { data: states } = await supabase
      .from('NotificationState')
      .select('key, readAt, dismissedAt, sourceCreatedAt')
      .eq('spaceId', space.id)
      .eq('userId', userId);
    stateByKey = new Map((states ?? []).map((s: NotificationStateRow) => [s.key, s]));
  } catch (err) {
    console.error('[notifications] state lookup failed', err);
  }

  const visible = notifications.filter((n) => {
    const state = stateByKey.get(n.id);
    if (!state) return true;

    // A later occurrence with a fresher source timestamp re-surfaces the item,
    // even if it was previously read/dismissed — that's new activity.
    const isFresher =
      !!state.sourceCreatedAt &&
      new Date(n.createdAt).getTime() > new Date(state.sourceCreatedAt).getTime();
    if (isFresher) return true;

    if (state.dismissedAt) return false;
    if (state.readAt) return false;
    return true;
  });

  // Sort: high priority first, then by date
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  visible.sort(
    (a, b) =>
      priorityOrder[a.priority] - priorityOrder[b.priority] ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return NextResponse.json(visible);
}

/**
 * Upserts a NotificationState row for (space, user, key), stamping the given
 * action timestamps. Used by both PATCH (mark read) and DELETE (dismiss).
 *
 * Only the fields present in `patch` are written, so marking read never clears
 * an existing dismiss and vice-versa — on conflict, supabase-js updates only
 * the columns supplied. `updatedAt` and `sourceCreatedAt` are always stamped.
 */
async function stampState(
  spaceId: string,
  userId: string,
  key: string,
  patch: { readAt?: string; dismissedAt?: string; sourceCreatedAt?: string },
) {
  const nowIso = new Date().toISOString();
  const row: Record<string, unknown> = {
    spaceId,
    userId,
    key,
    sourceCreatedAt: patch.sourceCreatedAt ?? null,
    updatedAt: nowIso,
  };
  if (patch.readAt) row.readAt = patch.readAt;
  if (patch.dismissedAt) row.dismissedAt = patch.dismissedAt;

  await supabase
    .from('NotificationState')
    .upsert(row, { onConflict: 'spaceId,userId,key' });
}

/**
 * PATCH — Mark notification(s) as read for the calling realtor.
 *
 * Body:
 *  - { key: string, sourceCreatedAt?: string }  → mark one notification read
 *  - { all: true }                              → mark every current
 *    notification read (snapshots their source timestamps so they stay read
 *    until fresher activity arrives).
 */
export async function PATCH(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const authResult = await requireSpaceOwner(slug);
  if (authResult instanceof NextResponse) return authResult;
  const { userId, space } = authResult;

  let body: { key?: string; sourceCreatedAt?: string; all?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    // Empty/invalid body — treated as a no-op below.
  }

  const nowIso = new Date().toISOString();

  try {
    if (body.all) {
      // Re-derive the current set (computed + stored agent-outcome records) so
      // we can snapshot each item's source timestamp; a key with no stored
      // sourceCreatedAt would re-surface on the next fetch (current > null is
      // false, but we want the timestamp recorded so fresher activity is
      // detectable).
      const current = await listNotifications(space.id, slug);
      if (current.length === 0) return NextResponse.json({ success: true });
      await supabase.from('NotificationState').upsert(
        current.map((n) => ({
          spaceId: space.id,
          userId,
          key: n.id,
          readAt: nowIso,
          sourceCreatedAt: n.createdAt,
          updatedAt: nowIso,
        })),
        { onConflict: 'spaceId,userId,key' },
      );
      return NextResponse.json({ success: true });
    }

    if (!body.key) {
      return NextResponse.json({ error: 'key or all required' }, { status: 400 });
    }

    await stampState(space.id, userId, body.key, {
      readAt: nowIso,
      sourceCreatedAt: body.sourceCreatedAt,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[notifications] mark-read failed', err);
    return NextResponse.json({ error: 'Failed to update notification' }, { status: 500 });
  }
}

/**
 * DELETE — Dismiss a single notification for the calling realtor. The key is
 * passed as a query param so this stays a bodyless DELETE.
 *   DELETE /api/notifications?slug=...&key=...&sourceCreatedAt=...
 */
export async function DELETE(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  const key = req.nextUrl.searchParams.get('key');
  const sourceCreatedAt = req.nextUrl.searchParams.get('sourceCreatedAt') ?? undefined;
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 });

  const authResult = await requireSpaceOwner(slug);
  if (authResult instanceof NextResponse) return authResult;
  const { userId, space } = authResult;

  try {
    await stampState(space.id, userId, key, {
      dismissedAt: new Date().toISOString(),
      sourceCreatedAt,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[notifications] dismiss failed', err);
    return NextResponse.json({ error: 'Failed to dismiss notification' }, { status: 500 });
  }
}
