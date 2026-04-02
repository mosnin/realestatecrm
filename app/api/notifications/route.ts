import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner } from '@/lib/api-auth';

/**
 * GET — Returns a list of actionable notifications for the dashboard.
 * These are computed in real-time from CRM data, not stored separately.
 */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  const now = new Date();
  const notifications: Array<{
    id: string;
    type: string;
    title: string;
    description: string;
    href: string;
    createdAt: string;
    priority: 'high' | 'medium' | 'low';
  }> = [];

  // 1. New unread leads
  const { count: newLeads } = await supabase
    .from('Contact')
    .select('*', { count: 'exact', head: true })
    .eq('spaceId', space.id)
    .is('brokerageId', null)
    .contains('tags', ['new-lead']);
  if (newLeads && newLeads > 0) {
    notifications.push({
      id: 'new-leads',
      type: 'new_lead',
      title: `${newLeads} new lead${newLeads > 1 ? 's' : ''}`,
      description: 'Unread applications waiting for review',
      href: `/s/${slug}/leads`,
      createdAt: now.toISOString(),
      priority: 'high',
    });
  }

  // 2. Tours starting in the next 24 hours
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const { data: upcomingTours } = await supabase
    .from('Tour')
    .select('id, guestName, startsAt, propertyAddress')
    .eq('spaceId', space.id)
    .in('status', ['scheduled', 'confirmed'])
    .gte('startsAt', now.toISOString())
    .lte('startsAt', in24h.toISOString())
    .order('startsAt', { ascending: true })
    .limit(5);
  for (const t of upcomingTours ?? []) {
    notifications.push({
      id: `tour-${t.id}`,
      type: 'upcoming_tour',
      title: `Tour with ${t.guestName}`,
      description: `${new Date(t.startsAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}${t.propertyAddress ? ` — ${t.propertyAddress}` : ''}`,
      href: `/s/${slug}/tours`,
      createdAt: t.startsAt,
      priority: 'high',
    });
  }

  // 3. Follow-ups that are due
  const { data: dueFollowUps } = await supabase
    .from('Contact')
    .select('id, name, followUpAt')
    .eq('spaceId', space.id)
    .not('followUpAt', 'is', null)
    .lte('followUpAt', now.toISOString())
    .order('followUpAt', { ascending: true })
    .limit(5);
  for (const c of dueFollowUps ?? []) {
    notifications.push({
      id: `followup-${c.id}`,
      type: 'follow_up_due',
      title: `Follow up with ${c.name}`,
      description: `Due ${new Date(c.followUpAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      href: `/s/${slug}/contacts/${c.id}`,
      createdAt: c.followUpAt,
      priority: 'medium',
    });
  }

  // 4. Waitlist entries needing attention
  const { count: waitlistCount } = await supabase
    .from('TourWaitlist')
    .select('*', { count: 'exact', head: true })
    .eq('spaceId', space.id)
    .eq('status', 'waiting');
  if (waitlistCount && waitlistCount > 0) {
    notifications.push({
      id: 'waitlist',
      type: 'waitlist',
      title: `${waitlistCount} on waitlist`,
      description: 'People waiting for tour slots',
      href: `/s/${slug}/tours`,
      createdAt: now.toISOString(),
      priority: 'low',
    });
  }

  // 5. Completed tours needing follow-up (no deal yet)
  const { data: completedNoFollowUp } = await supabase
    .from('Tour')
    .select('id, guestName, updatedAt')
    .eq('spaceId', space.id)
    .eq('status', 'completed')
    .order('updatedAt', { ascending: false })
    .limit(10);

  if (completedNoFollowUp?.length) {
    const tourIds = completedNoFollowUp.map((t: any) => t.id);
    const { data: dealsFromTours } = await supabase
      .from('Deal')
      .select('sourceTourId')
      .in('sourceTourId', tourIds);
    const dealsSet = new Set((dealsFromTours ?? []).map((d: any) => d.sourceTourId));
    const needsAction = completedNoFollowUp.filter((t: any) => !dealsSet.has(t.id));
    if (needsAction.length > 0) {
      notifications.push({
        id: 'tours-need-action',
        type: 'tour_needs_action',
        title: `${needsAction.length} tour${needsAction.length > 1 ? 's' : ''} need follow-up`,
        description: 'Completed tours without a deal — consider converting',
        href: `/s/${slug}/tours`,
        createdAt: now.toISOString(),
        priority: 'medium',
      });
    }
  }

  // Sort: high priority first, then by date
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  notifications.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority] || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json(notifications);
}
